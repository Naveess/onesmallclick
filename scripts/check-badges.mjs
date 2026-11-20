// Local check of phase 8b: every badge rule, the merge on sign-in, the leaderboards and the profile.
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
    return {
      ws,
      hello,
      next,
      taps: async (n) => {
        ws.send(JSON.stringify({ t: "taps", n, seq: ++seq }));
        return next("credited");
      },
      prestige: async () => {
        ws.send(JSON.stringify({ t: "prestige", seq: ++seq }));
        return next("me");
      },
      close: () => ws.close(),
    };
  };
  return { jar, get, post, connect, cookie };
}
const admin = async (action, body, b) =>
  (
    await fetch(`${base}/api/admin/${action}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Cookie: b ? b.cookie() : "" },
      body: body && JSON.stringify(body),
    })
  ).json();
const ids = (list) => (list ?? []).map((b) => b.id).sort();

await admin("reset", {}); // local test data only: a fresh mission, players kept
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // the dev server sees this machine's location
const hourAt = (ms) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(ms));
{
  const h0 = hourAt((await admin("state")).serverNow);
  const toNoon = (36 - h0) % 24 || 24; // start at midday, away from Night Shift
  await admin("clock", { hours: toNoon });
}
await admin("signal", { seconds: 40 * 3600 });
await admin("distance", { km: 100_000_000 });

// --- A guest: First Ping, then Signal Keeper I after a 3-day streak ---
const A = browser();
await A.get("/api/session");
let a = await A.connect();
check(Array.isArray(a.hello.badges) && a.hello.badges.length === 0, "a new guest has no badges");
let r = await A.post("/api/ping", { token: TOKEN });
let b = await a.next("badges");
check(r.ok && b && b.earned.join() === "first-ping", `ping → earned ${b?.earned}`);
for (let d = 0; d < 2; d++) {
  await admin("clock", { hours: 24 });
  await admin("signal", { seconds: 40 * 3600 });
  r = await A.post("/api/ping", { token: TOKEN });
}
b = await a.next("badges");
check(r.ok && r.pingStreakDays === 3 && b?.earned.includes("keeper-1"), `3-day streak (${r.pingStreakDays}) → ${b?.earned}`);
a.close();

// --- Clicks: 1,500 in all → Steady Finger (seeded history plus real taps) ---
const devA = A.jar.get("osc_device").split(".")[0];
const dayRow = sql(`SELECT MAX(day) AS d FROM daily_km`)[0]?.d ?? "2026-01-01";
sql(`INSERT INTO daily_km (day, device_id, km, tap_km, taps) VALUES ('2026-01-02', '${devA}', 10, 10, 1495)`);
a = await A.connect(); // reloads? the day's entry is cached: drop it with a new UTC day
await admin("clock", { hours: 24 });
await admin("signal", { seconds: 40 * 3600 });
a.close();
await wait(300);
a = await A.connect();
check(a.hello.tapsAll >= 1495, `seeded clicks read: all time ${a.hello.tapsAll}`);
await wait(1100);
let c = await a.taps(10);
b = await a.next("badges");
check(c.tapsAll >= 1500 && b?.earned.includes("clicks-1"), `${c.tapsAll} clicks → ${b?.earned}`);
check(ids(c.badges).includes("clicks-1") || ids(b?.badges).includes("clicks-1"), "the badge is in the player's list");

// --- Mission Patch: hand over the shift ---
await admin("give", { km: 2_100_000 }, A);
await wait(500);
const pm = await a.prestige();
b = await a.next("badges");
check(pm?.ok && b?.earned.includes("patch"), `handed over the shift → ${b?.earned}`);

// --- Voter ×30: 29 earlier rounds, then today's vote ---
for (let i = 1; i <= 29; i++) sql(`INSERT INTO votes (round, device_id, option, at) VALUES ('2025-12-${String(i).padStart(2, "0")}', '${devA}', 0, 0)`);
a.close();
await admin("clock", { hours: 24 }); // a new day reloads the vote count
await admin("signal", { seconds: 40 * 3600 });
await wait(300);
a = await A.connect();
const round = (await admin("state")).probe.vote.round;
r = await A.post("/api/vote", { token: TOKEN, round, option: 0 });
b = await a.next("badges");
check(r.ok && b?.earned.includes("voter-30"), `30th vote → ${b?.earned}`);

// --- Night Shift: taps at 02:00–04:59 local time (the probe's clock moved there) ---
const nowProbe = (await admin("state")).serverNow;
const add = (27 - hourAt(nowProbe)) % 24 || 24;
a.close();
await admin("clock", { hours: add });
await admin("signal", { seconds: 40 * 3600 });
await wait(300);
a = await A.connect();
await wait(1100);
c = await a.taps(3);
b = await a.next("badges");
check(b?.earned.includes("night-shift"), `taps at ${hourAt((await admin("state")).serverNow)}:xx local (${tz}) → ${b?.earned ?? "none (no time zone locally?)"}`);
a.close();

// --- Halfway Crew: pushed before halfway in this mission ---
const H = browser();
await H.get("/api/session");
let h = await H.connect();
await wait(1100);
await h.taps(5); // pushes km in this mission, before halfway
await wait(200);
await h.next("badges", 1500); // Night Shift (it's still 3 am here)
await admin("distance", { km: 240_500_000 });
b = await h.next("badges", 8000);
check(b?.earned.includes("halfway"), `the probe passed halfway → ${b?.earned}`);
h.close();
const late = browser(); // pushes only after halfway: no badge
await late.get("/api/session");
let l = await late.connect();
await wait(1100);
await l.taps(5);
b = await l.next("badges", 2000);
check(!b?.earned?.includes("halfway"), "pushing after halfway doesn't earn Halfway Crew");
l.close();

// --- Leaderboards and profile, as a guest ---
let lb = await A.get("/api/leaderboard?board=players");
check(lb.signedIn === false && lb.me && lb.me.rank === null, `guest on Players: not ranked (${JSON.stringify(lb.me)})`);
lb = await A.get("/api/leaderboard?board=countries");
check(Array.isArray(lb.rows) && (lb.me === null || typeof lb.me.cc === "string"), `Countries board: ${lb.rows.length} rows, mine ${JSON.stringify(lb.me)}`);
let pf = await A.get("/api/profile");
check(pf.signedIn === false && pf.totalKm > 0 && pf.days.length === 30 && pf.pingDays.length >= 1, `profile: ${Math.round(pf.totalKm)} km, ${pf.pingDays.length} ping days in 30`);

// --- Merge: A (guest, many badges) and H (Halfway) sign in to one email ---
const email = `badges${Date.now()}@example.com`;
for (const X of [A, H]) {
  const s = await X.post("/api/auth/email", { email, token: TOKEN });
  await X.post("/api/auth/confirm", { t: new URL(s.devLink).hash.slice(3) });
}
await wait(400);
h = await H.connect();
const merged = ids(h.hello.badges);
check(["first-ping", "keeper-1", "clicks-1", "patch", "voter-30", "halfway"].every((x) => merged.includes(x)), `the account has both devices' badges: ${merged.join(", ")}`);
const leftover = sql(`SELECT COUNT(*) AS n FROM badges WHERE player_key = '${devA}'`)[0].n;
check(leftover === 0, "the guest's badge rows moved to the account");

// --- Signed in: on the Players board ---
await wait(1100);
await h.taps(5);
h.close();
console.log("waiting for the D1 flush…");
await wait(32_000);
lb = await H.get("/api/leaderboard?board=players");
check(lb.signedIn && lb.me?.rank >= 1 && lb.me.km > 0, `signed in: rank #${lb.me?.rank} with ${Math.round(lb.me?.km ?? 0)} km`);

// --- Delete the account: its badges go ---
const acct = sql(`SELECT id FROM accounts WHERE email = '${email}'`)[0].id;
await H.post("/api/auth/delete");
const gone = sql(`SELECT COUNT(*) AS n FROM badges WHERE player_key = 'a:${acct}'`)[0].n;
check(gone === 0, "deleting the account deletes its badges");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
