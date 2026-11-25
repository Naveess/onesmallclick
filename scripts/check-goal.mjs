// Local check of phase Q1a: the daily crew goal (target formula, reaching it, the log entry, the bonus paid once at
// 00:00 UTC) and "Report a bug or idea" (sent, refused when invalid, listed and marked done in /admin).
// Uses local test data only: it moves the probe's clock and resets the mission at the end.
//   node scripts/check-goal.mjs [http://localhost:5173]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GOAL_BONUS_CAP, GOAL_FLOOR_KM, goalBonus, goalTarget, median, roundNice } from "../shared/goal.ts";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(`${ROOT}/.dev.vars`, "utf-8"))[1];
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- The formula (decision 30) ----------
check(roundNice(16_723) === 17_000 && roundNice(1_234_567) === 1_200_000 && roundNice(95) === 95, "2 significant figures");
check(median([5, 1, 3]) === 3 && median([1, 2, 3, 4]) === 2.5, "median");
// The live days of 18–24 Nov: one 959,339 km spike doesn't drag the target up.
check(goalTarget([1008, 28740, 13352, 13941, 11935, 11520, 959339]) === GOAL_FLOOR_KM, "live week → the 20,000 km floor (median 13,941)");
check(goalTarget([100_000, 120_000, 90_000, 110_000, 105_000, 95_000, 2_000_000]) === 130_000, "busy week → 1.2 × 105,000 = 126,000 → 130,000");
check(goalTarget([]) === GOAL_FLOOR_KM, "no history → the floor");
check(goalBonus(412) === 41 && goalBonus(50_000) === GOAL_BONUS_CAP && goalBonus(0) === 0, "bonus: 10% of km, capped at 1,000");

// ---------- A player ----------
function player() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      jar.set(kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1));
    }
    return res;
  };
  const req = async (path, body) =>
    keep(await fetch(base + path, { method: body ? "POST" : "GET", headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json" }, body: body && JSON.stringify(body) }));
  const connect = async () => {
    const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/probe`, { headers: { Cookie: cookie(), Origin: base } });
    const queue = [];
    const waiters = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const i = waiters.findIndex((w) => w.t === m.t);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
      else queue.push(m);
    };
    await new Promise((res) => (ws.onopen = res));
    const next = (t, ms = 5000) => {
      const i = queue.findIndex((m) => m.t === t);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return Promise.race([new Promise((resolve) => waiters.push({ t, resolve })), wait(ms).then(() => null)]);
    };
    let seq = 0;
    const hello = await next("hello");
    return {
      hello,
      next,
      taps: async (n) => {
        ws.send(JSON.stringify({ t: "taps", n, seq: ++seq }));
        return next("credited");
      },
      close: () => ws.close(),
    };
  };
  return { req, connect };
}
const admin = async (action, body) =>
  (
    await fetch(`${base}/api/admin/${action}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    })
  ).json();

// ---------- The goal on the probe ----------
await admin("reset", {});
await admin("signal", { seconds: 40 * 3600 });
let s = await admin("state");
const day0 = s.probe.goal?.day;
check(!!s.probe.goal && day0 === new Date(s.serverNow).toISOString().slice(0, 10), `today's goal is set (${day0})`);
check(s.probe.goal.targetKm >= GOAL_FLOOR_KM, `target ${s.probe.goal.targetKm.toLocaleString("en-GB")} km, at least the floor`);

const a = player();
await a.req("/api/session");
const ws = await a.connect();
check(ws.hello.probe.goal?.day === day0, "the snapshot carries the goal");
s = await admin("goal", { km: Math.round(s.probe.goal.km) + 10 });
check(s.probe.goal.reachedAt === null, "a target above today's km isn't reached yet");
let km = 0;
let credited = null;
for (let i = 0; i < 6 && !credited?.probe.goal?.reachedAt; i++) {
  credited = await ws.taps(15);
  km += credited?.km ?? 0;
  await wait(1100);
}
check(!!credited?.probe.goal?.reachedAt, `taps carried the crew past the target (${km.toFixed(1)} km)`);
await wait(1500);
const log = await (await a.req("/api/log")).json();
check(log.entries.some((e) => e.kind === "goal" && /Crew goal reached/.test(e.title)), "the log says the goal was reached");
check(log.entries.some((e) => e.kind === "goal" && /miles/.test(e.body)), "…with its miles (phase M)");

// A player's km today, then the day ends: the bonus is paid once, at 00:00 UTC.
const before = credited.me.credits;
const kmToday = credited.kmToday;
const expect = goalBonus(kmToday);
await admin("clock", { hours: 24 });
const bonus = await ws.next("bonus", 8000);
check(bonus?.day === day0 && bonus.credits === expect, `bonus paid for ${day0}: ${bonus?.credits} cr (10% of ${kmToday.toFixed(1)} km = ${expect})`);
const me = await ws.next("me", 4000);
check(!!me && Math.abs(me.me.credits - (before + expect)) < 1.5, `credits went up by the bonus (${before.toFixed(1)} → ${me?.me.credits.toFixed(1)})`);
s = await admin("state");
check(s.probe.goal.day !== day0 && s.probe.goal.reachedAt === null, `a new day's goal (${s.probe.goal.day}), not reached`);
// Another day passes with nobody pushing: no second bonus for the first day.
await admin("clock", { hours: 24 });
check((await ws.next("bonus", 3000)) === null, "no second bonus");
ws.close();

// ---------- Feedback ----------
const f = player();
await f.req("/api/session");
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const msg = `Check ${Date.now()}: the vote card overlaps on a small phone.`;
let r = await f.req("/api/feedback", { token: TOKEN, kind: "bug", message: msg, contact: true, page: "/ranks?c=secret#x", info: "390×844 @3x · test" });
check(r.status === 200 && (await r.json()).ok === true, "feedback sent");
r = await f.req("/api/feedback", { token: TOKEN, kind: "rant", message: "hi" });
check(r.status === 400, "an unknown kind is refused");
r = await f.req("/api/feedback", { token: TOKEN, kind: "idea", message: "x".repeat(1001) });
check(r.status === 400, "over 1,000 characters is refused");
r = await f.req("/api/feedback", { token: TOKEN, kind: "idea", message: "   " });
check(r.status === 400, "an empty message is refused");
r = await fetch(`${base}/api/feedback`, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ token: TOKEN, kind: "bug", message: "x" }) });
check(r.status === 403, "another site can't post it");
let rep = await admin("feedback");
const item = rep.items.find((i) => i.message === msg);
check(!!item && item.kind === "bug" && item.doneAt === null, "/admin lists it as new");
check(item?.page === "/ranks", "the page is kept without its query or hash");
check(item?.contact === null, "a guest's \"contact me\" keeps no contact");
await admin("feedback-done", { id: item.id, done: true });
rep = await admin("feedback");
check(rep.items.find((i) => i.id === item.id)?.doneAt > 0, "marked done");
await admin("feedback-done", { id: item.id, done: false });
rep = await admin("feedback");
check(rep.items.find((i) => i.id === item.id)?.doneAt === null, "reopened");
await admin("feedback-done", { id: item.id, done: true });

await admin("reset", {});
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
