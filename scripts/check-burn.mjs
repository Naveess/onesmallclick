// Local check of E4b part 2b, the landing burn: it starts an hour out with the landing time fixed; taps fill the
// bar double and don't move the probe; the signal can't run out and a vote can't move the landing; the probe lands
// on time either way; a missed and a stuck landing are saved with the leg (the probe's last arrival, /api/credits,
// the log). Uses local test data only (it resets the mission at the start and the end).
//   node scripts/check-burn.mjs [http://localhost:5173]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(`${ROOT}/.dev.vars`, "utf-8"))[1];
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const OPTIONS = JSON.parse(readFileSync(`${ROOT}/content/vote-options.json`, "utf-8"));
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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
      hello,
      taps: async (n) => {
        ws.send(JSON.stringify({ t: "taps", n, seq: ++seq }));
        return next("credited");
      },
      close: () => ws.close(),
    };
  };
  return { get, post, connect, cookie };
}
const admin = async (action, body) =>
  (
    await fetch(`${base}/api/admin/${action}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    })
  ).json();
const distanceAt = (p, now) => Math.min(p.routeKm, p.distanceKm + ((p.coastKmS + p.autoKmS) * Math.max(0, now - p.at)) / 1000);

// ---------- A fresh Mars leg, 20 days in ----------
await admin("reset", {});
await admin("signal", { seconds: 40 * 3600 });
await admin("leg-start", { days: 20 });
const A = browser();
await A.get("/api/session");
const a = await A.connect();
await wait(1100);

// ---------- Leg 1: the burn starts; a missed landing ----------
let st = await admin("burn", { minutes: 60 });
const b = st.probe.burn;
check(b && b.landAt - b.startedAt === 3_600_000 && b.target === 2_000_000 && b.km === 0, `the burn started: lands in 60 min, target ${b?.target}`);
check(near(distanceAt(st.probe, b.landAt), st.probe.routeKm, 5), "at its speed the probe reaches the end exactly at the landing time");
check(st.probe.autoKmS === 0, "auto-thrust no longer moves the probe");

const before = distanceAt(st.probe, st.serverNow);
const c1 = await a.taps(20);
check(c1.taps === 20 && c1.km > 0, `20 taps credited normally (${c1.km.toFixed(0)} km to you)`);
const p1 = c1.probe;
check(near(p1.burn.km, c1.km * 2, 0.5), `the bar got them double: ${p1.burn.km.toFixed(0)} km (taps ${c1.km.toFixed(0)} × 2)`);
const moved = distanceAt(p1, c1.now) - before;
const glide = ((st.probe.coastKmS) * (c1.now - st.serverNow)) / 1000;
check(near(moved, glide, glide * 0.05 + 5), `the taps didn't move the probe (${moved.toFixed(0)} km moved, the glide alone is ${glide.toFixed(0)})`);
check(p1.burn.landAt === b.landAt, "the landing time didn't change");

st = await admin("signal", { seconds: 1 });
await wait(1500);
st = await admin("state");
check(st.probe.safeSince === null, "the signal can't run out during the burn");

// A vote that would make the trip 1-4 hours sooner wins: the landing stays put.
const v = st.probe.vote;
const fastIdx = v.options.findIndex((o) => (OPTIONS.options ?? OPTIONS).find?.((d) => d.id === o.id)?.hours < 0);
if (fastIdx >= 0) {
  const r = await A.post("/api/vote", { token: TOKEN, round: v.round, option: fastIdx });
  const route = st.probe.routeKm;
  st = await admin("close-vote", {});
  check(r.ok && st.probe.routeKm === route && st.probe.burn?.landAt === b.landAt, `a "${v.options[fastIdx].label}" win doesn't move the landing`);
  const log = await A.get("/api/log");
  check(log.entries.some((e) => e.kind === "vote_result" && /landing time stays put/.test(e.body)), "the vote's log entry says the landing time stays put");
} else {
  check(false, "today's vote has a faster option to test with");
}

st = await admin("clock", { hours: 1.02 });
const arr1 = st.probe.lastArrival;
check(arr1 && arr1.burn && arr1.burn.ok === false && arr1.burn.km > 0 && arr1.burn.spareMs === null, `landed with a missed burn: ${arr1?.burn?.km?.toFixed(0)} of ${arr1?.burn?.target} km`);
check(arr1 && near(arr1.at, b.landAt, 1000), `it landed at the fixed time (off by ${((arr1?.at - b.landAt) / 1000).toFixed(1)} s)`);
const cr1 = await A.get(`/api/credits?mission=${arr1.missionId}`);
check(cr1.burn && cr1.burn.ok === false && near(cr1.burn.km, arr1.burn.km, 1), "/api/credits has the missed burn");
let log = await A.get("/api/log");
check(log.entries.some((e) => e.kind === "burn_start"), "the log has the burn's start");
check(log.entries.some((e) => e.kind === "arrival" && /Rough landing, but we made it/.test(e.body)), "the arrival's log entry says rough landing");
check(st.probe.burn === null || st.probe.burn === undefined, "no burn after landing");

// ---------- Leg 2: a stuck landing (a small test target) ----------
st = await admin("close-vote", {}); // the branch vote closes: on to the next stop
check(st.probe.arrivedAt === null && st.probe.missionId === arr1.missionId + 1, `on to ${st.probe.stop}`);
await admin("signal", { seconds: 40 * 3600 });
st = await admin("burn", { minutes: 30, target: 50 });
check(st.probe.burn?.target === 50, "a second burn with a 50 km test target");
await wait(1100);
const c2 = await a.taps(20);
check(c2.probe.burn.km >= 50 && c2.probe.burn.filledAt !== null, `the bar filled (${c2.probe.burn.km.toFixed(0)} km)`);
st = await admin("clock", { hours: 0.52 });
const arr2 = st.probe.lastArrival;
check(arr2?.burn?.ok === true && arr2.burn.spareMs > 25 * 60_000, `landing stuck with ${Math.round((arr2?.burn?.spareMs ?? 0) / 60000)} min to spare`);
const cr2 = await A.get(`/api/credits?mission=${arr2.missionId}`);
check(cr2.burn?.ok === true && cr2.burn.spareMs === arr2.burn.spareMs, "/api/credits has the stuck landing");
log = await A.get("/api/log");
check(log.entries.some((e) => e.kind === "arrival" && /Landing stuck/.test(e.body)), "the arrival's log entry says landing stuck");

// ---------- Not too early: no burn far from arrival ----------
await admin("reset", {});
st = await admin("state");
check(!st.probe.burn, "a fresh leg has no burn");

// ---------- It starts by itself once the arrival is under an hour away at today's pace ----------
await admin("signal", { seconds: 40 * 3600 });
st = await admin("state");
await admin("distance", { km: st.probe.routeKm - st.probe.paceKmS * 3600 * 1.5 });
await wait(1100);
let c3 = await a.taps(5);
check(!c3.probe.burn, `90 minutes out: no burn yet (pace ${st.probe.paceKmS.toFixed(1)} km/s)`);
st = await admin("state");
await admin("distance", { km: st.probe.routeKm - st.probe.paceKmS * 3600 * 0.8 });
await wait(1100);
c3 = await a.taps(5);
check(!!c3.probe.burn && c3.probe.burn.landAt - c3.probe.burn.startedAt === 3_600_000 && c3.probe.burn.km > 0, "48 minutes out: a tap starts the burn (landing in 60 min) and counts for it");
a.close();
await admin("reset", {});
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
