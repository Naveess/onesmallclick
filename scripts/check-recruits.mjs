// Local check of phase S2: recruits, Crew Recruiter badges, the profile line and the K-factor report.
//   node scripts/check-recruits.mjs            (npm run dev must be running; local test data only)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(`${ROOT}/.dev.vars`, "utf-8"))[1];
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => {
  const out = execSync(`npx wrangler d1 execute onesmallclick --local --json --command "${q.replace(/"/g, '\\"')}"`, { cwd: ROOT, encoding: "utf-8" });
  return JSON.parse(out)[0].results;
};

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(";");
      const k = kv.slice(0, kv.indexOf("="));
      if (attrs.some((a) => /max-age=0/i.test(a.trim()))) jar.delete(k);
      else jar.set(k, kv.slice(kv.indexOf("=") + 1));
    }
    return res;
  };
  const req = async (path, body) =>
    keep(await fetch(base + path, { method: body ? "POST" : "GET", headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json" }, body: body && JSON.stringify(body) }));
  const get = async (path) => (await req(path)).json();
  const post = async (path, body = {}) => (await req(path, body)).json();
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
    const taps = async (n) => {
      ws.send(JSON.stringify({ t: "taps", n, seq: ++seq }));
      return next("credited");
    };
    /** Taps until this many have been credited (the bucket refills at 15 a second). */
    const tapTo = async (n) => {
      let got = 0;
      for (let i = 0; i < 20 && got < n; i++) {
        const c = await taps(Math.min(40, n - got));
        got += c?.taps ?? 0;
        if (got < n) await wait(1500);
      }
      return got;
    };
    return { ws, hello, next, taps, tapTo, close: () => ws.close() };
  };
  const device = () => jar.get("osc_device").split(".")[0];
  return { jar, get, post, connect, cookie, device };
}
const admin = async (action, body) =>
  (
    await fetch(`${base}/api/admin/${action}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    })
  ).json();
const status = (dev) => sql(`SELECT status FROM recruits WHERE device_id = '${dev}'`)[0]?.status ?? "none";
// Each ping first resets the signal (that also clears the 5-second "just saved" window).
const pingAs = async (X) => {
  await admin("signal", { seconds: 40 * 3600 });
  return X.post("/api/ping", { token: TOKEN });
};
const signIn = async (X, email) => {
  const s = await X.post("/api/auth/email", { email, token: TOKEN });
  await X.post("/api/auth/confirm", { t: new URL(s.devLink).hash.slice(3) });
};

await admin("reset", {}); // local test data only: a fresh mission, players kept
await admin("signal", { seconds: 40 * 3600 });
sql(`DELETE FROM recruits`);

// --- The recruiter, a guest, with an open tab ---
const R = browser();
await R.get("/api/session");
const { code } = await R.get("/api/crew-link");
check(/^[a-z0-9]{6}$/.test(code ?? ""), `recruiter has a crew link (${code})`);
let r = await R.connect();
let own = await R.get(`/api/crew/${code}?m=invite&v=copy`);
check(own.own === true && status(R.device()) === "none", "opening your own link: own, no arrival");

// --- A new player arrives and taps 50 ---
const N = browser();
await N.get("/api/session");
let info = await N.get(`/api/crew/${code}?m=milestone&v=wa`);
check(info.own === false && status(N.device()) === "arrived", `a new device arrives (${info.name}): ${status(N.device())}`);
let n = await N.connect();
await wait(1100);
let got = await n.tapTo(30);
check(status(N.device()) === "arrived", `${got} taps: not a recruit yet`);
got += await n.tapTo(25);
await wait(300);
check(status(N.device()) === "recruit", `${got} taps: a recruit`);
let b = await r.next("badges", 4000);
check(b?.earned.includes("recruit-1"), `the recruiter's open tab gets ${b?.earned ?? "nothing"}`);
await n.tapTo(20);
check(sql(`SELECT COUNT(*) AS n FROM recruits WHERE recruiter_key = '${R.device()}' AND status = 'recruit'`)[0].n === 1, "more taps don't count again");
n.close();

// --- Opening the link again on the same device doesn't make a second arrival ---
await N.get(`/api/crew/${code}?m=invite&v=copy`);
check(sql(`SELECT COUNT(*) AS n FROM recruits WHERE device_id = '${N.device()}'`)[0].n === 1, "one row per device");

// --- An old device (first seen an hour ago) doesn't count as new ---
const O = browser();
await O.get("/api/session");
sql(`UPDATE devices SET created_at = created_at - 3600000 WHERE id = '${O.device()}'`);
await O.get(`/api/crew/${code}?m=invite&v=copy`);
check(status(O.device()) === "none", "a device first seen an hour ago: no arrival");

// --- A Ping makes a newcomer a recruit too ---
const P = browser();
await P.get("/api/session");
await P.get(`/api/crew/${code}?m=signal&v=x`);
const ping = await pingAs(P);
await wait(300);
check(ping.ok && status(P.device()) === "recruit", `a Ping (${ping.ok ? "ok" : ping.reason}): ${status(P.device())}`);

// --- The profile shows the recruits ---
let pf = await R.get("/api/profile");
check(pf.recruits === 2 && typeof pf.recruitKm === "number", `profile: ${pf.recruits} recruits, ${pf.recruitKm} km (km show after the 5-minute flush)`);

// --- The daily cap: 10 recruits a day count; the 11th is over-cap (8 more seeded for today) ---
const now = Date.now();
for (let i = 0; i < 8; i++)
  sql(`INSERT INTO recruits (device_id, recruiter_key, moment, channel, arrived_at, converted_at, status) VALUES ('seed-${now}-${i}', '${R.device()}', 'invite', 'copy', ${now - 60000}, ${now}, 'recruit')`);
const C = browser();
await C.get("/api/session");
await C.get(`/api/crew/${code}?m=invite&v=copy`);
const pc = await pingAs(C);
await wait(300);
check(pc.ok && status(C.device()) === "over-cap", `the 11th recruit today: ${status(C.device())}`);

// --- Five recruits make Crew Recruiter II: seen on the recruiter's next visit (a new day reloads their numbers) ---
r.close();
await admin("clock", { hours: 24 });
await admin("signal", { seconds: 40 * 3600 });
await wait(300);
r = await R.connect();
b = await r.next("badges", 3000);
const have = (r.hello.badges ?? []).concat(b?.badges ?? []).map((x) => x.id);
check(have.includes("recruit-2") && !have.includes("recruit-3"), `with 10 recruits: ${[...new Set(have)].filter((x) => x.startsWith("recruit")).join(", ")}`);
r.close();

// --- Signing in to an account older than the arrival: not counted ---
const stamp = Date.now();
const Old = browser();
await Old.get("/api/session");
await signIn(Old, `old${stamp}@example.com`);
const E = browser();
await E.get("/api/session");
sql(`UPDATE accounts SET created_at = created_at - 60000 WHERE email = 'old${stamp}@example.com'`);
await E.get(`/api/crew/${code}?m=invite&v=copy`);
await signIn(E, `old${stamp}@example.com`);
await wait(300);
await pingAs(E);
await wait(300);
check(status(E.device()) === "existing", `an existing player on a new phone: ${status(E.device())}`);

// --- The recruiter signs in: their recruits and badges move to the account ---
await signIn(R, `recruiter${stamp}@example.com`);
await wait(400);
const acct = sql(`SELECT id FROM accounts WHERE email = 'recruiter${stamp}@example.com'`)[0].id;
check(sql(`SELECT COUNT(*) AS n FROM recruits WHERE recruiter_key = 'a:${acct}' AND status = 'recruit'`)[0].n === 10, "the guest's recruits moved to the account");
pf = await R.get("/api/profile");
check(pf.recruits === 10, `signed-in profile: ${pf.recruits} recruits`);

// --- A new device through the old guest link now counts for the account; signing in to it is "own" ---
const S = browser();
await S.get("/api/session");
await S.get(`/api/crew/${code}?m=invite&v=copy`);
check(sql(`SELECT recruiter_key FROM recruits WHERE device_id = '${S.device()}'`)[0]?.recruiter_key === `a:${acct}`, "the guest link's arrival goes to the account");
await signIn(S, `recruiter${stamp}@example.com`);
await wait(300);
await pingAs(S);
await wait(300);
check(status(S.device()) === "own", `your own account on a new phone: ${status(S.device())}`);

// --- /admin: the K-factor ---
const rep = await admin("shares");
const k = rep.k;
check(k && k.arrived >= 6 && k.recruits >= 3 && k.overCap >= 1 && k.notCounted >= 2 && Math.abs(k.k - k.i * k.c) < 1e-9, `K-factor: ${JSON.stringify(k)}`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
