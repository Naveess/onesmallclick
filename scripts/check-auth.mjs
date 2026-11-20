// Local check of phase 8a: email sign-in on two devices, the merge, names, country, once-per-account
// pings and votes, sign out, delete account, Google off locally.
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf-8"))[1];
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

/** A browser: a cookie jar and helpers. */
function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (attrs.some((a) => /max-age=0/i.test(a.trim()))) jar.delete(k);
      else jar.set(k, v);
    }
    return res;
  };
  const req = async (path, body, method = body ? "POST" : "GET", extra = {}) =>
    keep(
      await fetch(base + path, {
        method,
        redirect: "manual",
        headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json", ...extra },
        body: body && JSON.stringify(body),
      }),
    );
  const get = async (path) => (await req(path)).json();
  const post = async (path, body = {}) => {
    const r = await req(path, body, "POST");
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const connect = async () => {
    const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/probe`, { headers: { Cookie: cookie(), Origin: base } });
    const queue = [];
    const waiters = [];
    let closed = null;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const i = waiters.findIndex((w) => w.t === m.t);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
      else queue.push(m);
    };
    ws.onclose = (e) => (closed = e.code);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error("socket"));
    });
    const next = (t) => {
      const i = queue.findIndex((m) => m.t === t);
      return i >= 0 ? Promise.resolve(queue.splice(i, 1)[0]) : new Promise((resolve) => waiters.push({ t, resolve }));
    };
    let seq = 0;
    return {
      ws,
      hello: await next("hello"),
      taps: async (n) => {
        ws.send(JSON.stringify({ t: "taps", n, seq: ++seq }));
        return next("credited");
      },
      buy: async (key) => {
        ws.send(JSON.stringify({ t: "buy", key, seq: ++seq }));
        return next("me");
      },
      closedCode: () => closed,
    };
  };
  return { jar, get, post, req, connect };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = async (action, body, b) =>
  (
    await fetch(`${base}/api/admin/${action}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Cookie: b ? [...b.jar].map(([k, v]) => `${k}=${v}`).join("; ") : "" },
      body: body && JSON.stringify(body),
    })
  ).json();

const email = `test${Date.now()}@example.com`;
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

// --- Device A: a guest with progress ---
const A = browser();
let s = await A.get("/api/session");
check(s.account === null && s.crew > 0 && !!s.name, `A is a guest: ${s.name}, crew #${s.crew}`);
const aGuestName = s.name;
await admin("give", { km: 5000 }, A);
let a = await A.connect();
let me = await a.buy("hands"); // 300 cr
check(me.ok && me.me.levels.hands === 1, "A bought Steady hands 1");
await a.taps(10);
const aCredits = (await a.taps(1)).me.credits;
check(Math.abs((await A.post("/api/ping", { token: TOKEN })).ok ? 0 : 1) === 0, "A pinged as a guest");

// --- A signs in by email ---
let r = await A.post("/api/auth/email", { email, token: TOKEN });
check(r.ok && r.devLink?.includes("/sign-in/confirm#t="), `email link (dev): ${r.devLink?.slice(0, 50)}…`);
const tA = new URL(r.devLink).hash.slice(3);
r = await A.post("/api/auth/confirm", { t: tA });
check(r.ok === true && A.jar.has("osc_session"), "A confirmed: signed in");
await wait(300);
check(a.closedCode() === 4001, `A's open socket was told to reconnect (code ${a.closedCode()})`);
r = await A.post("/api/auth/confirm", { t: tA });
check(r.ok === false && r.reason === "used", "the same link can't be used twice");
s = await A.get("/api/session");
check(s.account && s.account.name === aGuestName && !s.account.nameChosen, `A's account kept the name ${s.account?.name}, not chosen yet`);
a = await A.connect();
check(Math.abs(a.hello.me.credits - aCredits) < 1 && a.hello.me.levels.hands === 1, `A's progress moved into the account (${Math.round(a.hello.me.credits)} cr, hands 1)`);
check(a.hello.pingedToday === true, "A's ping today moved to the account");

// --- Device B: another guest, more patches-free progress, same email ---
const B = browser();
await B.get("/api/session");
await admin("give", { km: 2000 }, B);
let b = await B.connect();
await b.buy("cold"); // 150 cr
const bCredits = (await b.taps(1)).me.credits;
b.ws.close();
await wait(300);
check((await B.post("/api/vote", { token: TOKEN, round: (await admin("state")).probe.vote.round, option: 1 })).ok, "B voted as a guest");
r = await B.post("/api/auth/email", { email, token: TOKEN });
r = await B.post("/api/auth/confirm", { t: new URL(r.devLink).hash.slice(3) });
check(r.ok, "B signed in with the same email");
s = await B.get("/api/session");
check(s.account?.name === aGuestName, "B is on the same account");
b = await B.connect();
const merged = b.hello.me;
check(
  merged.levels.hands === 1 && merged.levels.cold === 1 && Math.abs(merged.credits - (aCredits + bCredits)) < 2,
  `merged: hands ${merged.levels.hands}, cold ${merged.levels.cold}, ${Math.round(merged.credits)} cr ≈ ${Math.round(aCredits)} + ${Math.round(bCredits)}`,
);
check(b.hello.pingedToday === true, "B sees the account's ping today");
r = await B.post("/api/ping", { token: TOKEN });
check(r.ok === false && r.reason === "already-pinged", "B can't ping again: one per account per day");
r = await A.post("/api/vote", { token: TOKEN, round: (await admin("state")).probe.vote.round, option: 2 });
check(r.ok === false && r.reason === "already-voted" && r.option === 1, `A can't vote again: the account voted (option ${r.option})`);
check((await admin("state")).probe.online >= 1, "people here counts the account once");

// --- Names and country ---
const offers = (await A.get("/api/auth/names")).offers;
check(offers?.length === 3 && offers[0] === aGuestName, `three offers: ${offers?.join(", ")}`);
r = await A.post("/api/auth/name", { name: "Not A Name" });
check(r.ok === false && r.reason === "invalid", "a free-typed name is refused");
r = await A.post("/api/auth/name", { name: offers[1] });
check(r.ok && r.name === offers[1], `picked ${offers[1]}`);
r = await A.post("/api/auth/name", { name: offers[2] });
check(r.ok === false && r.reason === "already-chosen", "the name is chosen once");
s = await B.get("/api/session");
check(s.name === offers[1] && s.account.nameChosen, "B sees the new name");
r = await A.post("/api/auth/country", { country: "FR" });
check(r.ok && r.country === "FR", "country changed to FR");
r = await A.post("/api/auth/country", { country: "GB" });
check(r.ok === false && r.reason === "already-changed", "the country changes once");
r = await A.post("/api/auth/country", { country: "EU" });
check(r.ok === false, "EU isn't a country");

// --- Sign out B: a fresh guest; the account keeps the progress ---
const bDeviceBefore = B.jar.get("osc_device");
r = await B.post("/api/auth/sign-out");
check(r.ok && !B.jar.has("osc_session") && B.jar.get("osc_device") !== bDeviceBefore, "B signed out with a new guest device");
s = await B.get("/api/session");
check(s.account === null && s.name !== offers[1], `B is a guest again: ${s.name}`);
const bGuest = await B.connect();
check(bGuest.hello.me.credits === 0 && bGuest.hello.me.levels.hands === 0 && bGuest.hello.pingedToday === false, "B starts at zero and can ping");
bGuest.ws.close();
a.ws.close();
b.ws.close();
await wait(300);
a = await A.connect();
check(Math.abs(a.hello.me.credits - merged.credits) < 2, "A still has the account's progress");
a.ws.close();

// --- Google is off locally ---
const g = await A.req("/api/auth/google");
check(g.status === 302 && g.headers.get("location").endsWith("/sign-in?error=google-off"), `Google: ${g.headers.get("location")}`);
const cb = await A.req("/api/auth/google/callback?code=x&state=y");
check(cb.status === 302 && cb.headers.get("location").includes("error="), "a forged Google callback is refused");

// --- Delete the account ---
r = await A.post("/api/auth/delete");
check(r.ok && !A.jar.has("osc_session"), "A deleted the account");
s = await A.get("/api/session");
check(s.account === null, "A is a guest again");
r = await A.post("/api/auth/name", { name: offers[2] });
check(r.status === 401, "the old session is gone");
r = await B.post("/api/auth/email", { email, token: TOKEN });
r = await B.post("/api/auth/confirm", { t: new URL(r.devLink).hash.slice(3) });
s = await B.get("/api/session");
check(s.account && s.account.nameChosen === false, "the same email makes a brand-new account after deleting");
const fresh = await B.connect();
check(fresh.hello.me.levels.hands === 0, "…with no old progress");
fresh.ws.close();

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
