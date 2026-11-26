// Local check of phase A1c-2: maintenance mode. Switching it on freezes the game (taps, pings, votes, purchases and
// signing in are turned away; the probe stands still), it survives a probe restore, and switching it off moves the
// signal and the vote later by how long it was on. Also the rewind route's checks (the rewind itself only works on
// Cloudflare, so locally it must fail cleanly).
// Local only (dev sign-in links, the Bearer key):
//   node scripts/check-maintenance.mjs [http://localhost:5173]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const vars = readFileSync(`${ROOT}/.dev.vars`, "utf-8");
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(vars)[1];
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(";")[0];
      jar.set(kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1));
    }
    return res;
  };
  const req = async (path, body) =>
    keep(await fetch(base + path, { method: body ? "POST" : "GET", headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json" }, body: body && JSON.stringify(body) }));
  const get = async (path) => (await req(path)).json();
  const post = async (path, body = {}) => {
    const res = await req(path, body);
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
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
    const next = (t, ms = 4000) => {
      const i = queue.findIndex((m) => m.t === t);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return Promise.race([new Promise((resolve) => waiters.push({ t, resolve })), wait(ms).then(() => null)]);
    };
    let seq = 0;
    const hello = await next("hello");
    return {
      hello,
      taps: async (n) => (ws.send(JSON.stringify({ t: "taps", n, seq: ++seq })), next("credited")),
      buy: async (key) => (ws.send(JSON.stringify({ t: "buy", key, seq: ++seq })), next("me")),
      close: () => ws.close(),
    };
  };
  return { get, post, connect };
}
const admin = async (action, body) => {
  const res = await fetch(`${base}/api/admin/${action}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Origin: base },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};

// A probe on its way (not in orbit or mid-burn), with plenty of signal, and awake.
let st = await admin("state");
if (st.probe.arrivedAt !== null || st.probe.burn || st.probe.maintenance) {
  if (st.probe.maintenance) await admin("maintenance", { on: false, reason: "check-maintenance: start clean" });
  await admin("reset", {});
}
await admin("signal", { seconds: 6 * 3600 });
const G = browser();
await G.get("/api/session");
const g = await G.connect();
await g.taps(5);
st = await admin("state");
check(st.probe.pausedSince === null && st.probe.safeSince === null && !st.probe.maintenance, "the probe is moving, signal on, maintenance off");

// ---------- Switching it on ----------
let r = await admin("maintenance", { on: true, message: "check-maintenance" });
check(r.status === 400, "switching it on needs a reason");
r = await admin("maintenance", { on: true, message: "Fixing a thing (check)", reason: "check-maintenance" });
check(r.status === 200 && r.probe.maintenance?.message === "Fixing a thing (check)", "switch it on, with a message");
const since = r.probe.maintenance.since;
const deadline = r.probe.signalDeadline;
const closes = r.probe.vote.closesAt;
check(r.probe.pausedSince !== null && r.probe.coastKmS === 0 && r.probe.autoKmS === 0, "…the probe stands still");
const games = (await admin("game-states")).game ?? [];
check(games.some((s) => s.reason === "before maintenance"), "…a game save state was taken first");
const g2 = await G.connect();
check(g2.hello?.probe?.maintenance?.message === "Fixing a thing (check)", "…a new screen gets the message in its first snapshot");

// ---------- What's turned away ----------
const km0 = (await admin("state")).probe.distanceKm;
const c = await g2.taps(20);
check(c && c.taps === 0, `taps count for nothing (${c?.taps} credited)`);
await wait(1500);
st = await admin("state");
check(st.probe.distanceKm === km0 && st.probe.pausedSince !== null, "…and don't wake or move the probe");
const b = await g2.buy("cold");
check(b && b.ok === false, "a purchase is refused");
r = await G.post("/api/ping", { token: TOKEN });
check(r.ok === false && r.reason === "maintenance", `a ping is turned away (${r.reason})`);
r = await G.post("/api/vote", { token: TOKEN, round: st.probe.vote.round, option: 0 });
check(r.ok === false && r.reason === "maintenance", `a vote is turned away (${r.reason})`);
const S = browser();
await S.get("/api/session");
r = await S.post("/api/auth/email", { email: `maint${Date.now()}@example.com`, token: TOKEN });
check(r.status === 503 && r.reason === "maintenance", "signing in is paused (email link)");
r = await S.post("/api/auth/confirm", { t: "x".repeat(40) });
check(r.status === 503 && r.reason === "maintenance", "…and the link's page too (the link isn't used up)");

// ---------- Changing the message; surviving a restore ----------
r = await admin("maintenance", { on: true, message: "Nearly done (check)", reason: "check-maintenance message" });
check(r.probe.maintenance?.message === "Nearly done (check)" && r.probe.maintenance.since === since, "change the message: the freeze carries on from the same time");
const pre = (await admin("game-states")).game.find((s) => s.reason === "before maintenance");
r = await admin("game-restore", { snapshot: pre.id, reason: "check-maintenance restore", confirm: "RESTORE THE PROBE" });
check(r.status === 200, "restore the probe while frozen");
await wait(2000);
st = await admin("state");
check(st.probe.maintenance?.since === since && st.probe.pausedSince !== null, "…it comes back still frozen, the probe still standing");
r = await G.post("/api/ping", { token: TOKEN });
check(r.reason === "maintenance", "…and pings are still turned away");

// ---------- Switching it off ----------
await wait(2500);
r = await admin("maintenance", { on: false, reason: "check-maintenance done" });
const span = r.serverNow - since;
check(r.status === 200 && !r.probe.maintenance, `switch it off (it was on ${(span / 1000).toFixed(1)} s)`);
const moved = r.probe.signalDeadline - deadline;
check(Math.abs(moved - span) < 1500, `…the signal deadline moved ${(moved / 1000).toFixed(1)} s later`);
const voteMoved = r.probe.vote.closesAt - closes;
check(r.probe.vote.closesAt === closes || Math.abs(voteMoved - span) < 1500, `…the vote closes ${(voteMoved / 1000).toFixed(1)} s later`);
check(r.probe.pausedSince === null && r.probe.coastKmS > 0, "…the probe moves again");
const g3 = await G.connect(); // the restore restarted the probe, which closed every connection
const c2 = await g3.taps(5);
check(c2 && c2.taps > 0, "taps count again");
r = await G.post("/api/ping", { token: TOKEN });
check(r.reason !== "maintenance", `pings aren't turned away (${r.ok ? "pinged" : r.reason})`);
r = await S.post("/api/auth/email", { email: `maint${Date.now()}@example.com`, token: TOKEN });
check(r.ok === true, "signing in works again");
r = await admin("maintenance", { on: false, reason: "check-maintenance twice" });
check(r.status === 200 && !r.probe.maintenance, "switching it off twice is harmless");

// ---------- A landing burn under way waits too ----------
r = await admin("burn", { minutes: 30, target: 2_000_000 });
const land = r.probe?.burn?.landAt;
check(!!land, "start a landing burn");
r = await admin("maintenance", { on: true, reason: "check-maintenance burn" });
const since2 = r.probe.maintenance.since;
check(r.probe.pausedSince !== null, "…freeze: the probe stands still mid-burn");
await wait(2000);
r = await admin("maintenance", { on: false, reason: "check-maintenance burn done" });
const span2 = r.serverNow - since2;
check(Math.abs(r.probe.burn.landAt - land - span2) < 1500, `…unfreeze: the landing moved ${((r.probe.burn.landAt - land) / 1000).toFixed(1)} s later`);
await admin("reset", {}); // tidy up: a fresh tour, no burn

// ---------- The rewind route (point-in-time recovery: Cloudflare only) ----------
r = await admin("probe-rewind", { minutesAgo: 5, reason: "check", confirm: "rewind the probe" });
check(r.status === 400, "a rewind needs the phrase typed exactly");
r = await admin("probe-rewind", { minutesAgo: 0, reason: "check", confirm: "REWIND THE PROBE" });
check(r.status === 400, "…and 1 minute to 30 days");
r = await admin("probe-rewind", { minutesAgo: 5, reason: "check-maintenance (local: should fail)", confirm: "REWIND THE PROBE" });
check(r.status === 500 || r.status === 200, `locally it fails cleanly or works (${r.status}: ${r.error ?? "ok"})`);
await wait(1500);
st = await admin("state");
check(!!st.probe, "…and the probe still answers");

g.close();
g2.close();
g3.close();
console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
