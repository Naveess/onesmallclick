// Local check of E4b part 2a: arrival medals, planet tech (tap credits, upgrade prices, the offline cap),
// passport stamps (who helped), the guest stamp moving on sign-in, and a deleted account leaving the credits.
// Run against `npm run dev`: node scripts/check-rewards.mjs [base URL]. It resets the local mission.
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf-8"))[1];
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const DAY = 86_400_000;
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(";")[0];
      const k = kv.slice(0, kv.indexOf("="));
      if (/max-age=0/i.test(c)) jar.delete(k);
      else jar.set(k, kv.slice(kv.indexOf("=") + 1));
    }
    return res;
  };
  const req = async (path, body, extra = {}) =>
    keep(
      await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json", ...extra },
        body: body && JSON.stringify(body),
      }),
    );
  const get = async (path) => (await req(path)).json();
  const post = async (path, body = {}) => (await req(path, body)).json();
  const admin = async (action, body) => (await req(`/api/admin/${action}`, body, { Authorization: `Bearer ${KEY}` })).json();
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
      taps: async (n) => (ws.send(JSON.stringify({ t: "taps", n, seq: ++seq })), next("credited")),
      buy: async (key) => (ws.send(JSON.stringify({ t: "buy", key, seq: ++seq })), next("me")),
      close: () => ws.close(),
    };
  };
  return { jar, get, post, admin, connect };
}
const anon = browser(); // admin calls that don't need a device
const admin = anon.admin;

/** Arrives now, `days` after the leg launched. */
async function arriveAfter(days) {
  await admin("leg-start", { days });
  const st = await admin("state");
  await admin("distance", { km: st.probe.routeKm });
  await wait(2000);
  return admin("state");
}
async function chooseBranch(voters, option) {
  let st = await admin("state");
  for (const v of voters) await v.post("/api/vote", { token: TOKEN, round: st.probe.vote.round, option });
  await admin("close-vote", {});
  await wait(1000);
  return admin("state");
}

// ---------- Tour 1: Mars in 24 days (Gold), then Vesta in 28 (Silver) ----------
await admin("reset", {});
await admin("signal", { seconds: 200 * 3600 });
let st = await admin("state");
check(st.probe.tech && Object.values(st.probe.tech).every((v) => v === 0), "a fresh tour has no planet tech");

const A = browser(); // taps: gets the stamp
await A.get("/api/session");
const B = browser(); // never taps: the "push on the next leg" card
await B.get("/api/session");
const G = browser(); // taps as a guest, signs in after the arrival
await G.get("/api/session");
const a = await A.connect();
const b = await B.connect();
const g = await G.connect();
await wait(1100);
await a.taps(20);
await g.taps(5);

st = await arriveAfter(24);
const mars = st.probe.lastArrival.missionId;
check(st.probe.arrivedAt !== null && st.probe.stop === "mars", "arrived at Mars on day 24");
check(near(st.probe.tech.tapCredits, 0.05, 1e-9), `Mars Gold: tap credits +${st.probe.tech.tapCredits * 100}% for everyone`);
const crMars = await A.get(`/api/credits?mission=${mars}`);
check(crMars.medal === "gold", `the credits carry the medal: ${crMars.medal}`);
const tourA = await A.get("/api/tour");
const tourB = await B.get("/api/tour");
const legA = tourA.legs.find((l) => l.missionId === mars);
check(legA?.helped === true && legA.medal === "gold", "A tapped: A's stamp, in gold");
check(tourB.legs.find((l) => l.missionId === mars)?.helped === false, "B didn't tap: no stamp (the 'push on the next leg' card)");
const logEntry = (await A.get("/api/log")).entries.find((e) => e.kind === "arrival");
check(logEntry?.data?.medal === "gold", "the arrival's log entry has the medal");

// Tap credits +5%: in orbit, taps still earn credits (not km on the probe).
await wait(1100);
const c0 = (await a.taps(1)).me.credits;
await wait(1100);
const c1 = await a.taps(10);
const got = c1.me.credits - c0;
check(near(got, c1.km * 1.05, 0.01), `10 taps: ${c1.km} km earned ${got.toFixed(3)} credits (km × 1.05)`);
check(c1.me.tapKm === a.hello.me.tapKm, `tap power unchanged: ${c1.me.tapKm} km a tap`);

// Mars → Vesta, arriving on day 28: Silver, upgrades 3% cheaper.
st = await chooseBranch([A, G], 1);
check(st.probe.stop === "vesta", "the crew chose Vesta");
await wait(1100);
await a.taps(3);
st = await arriveAfter(28);
const vesta = st.probe.lastArrival.missionId;
check(st.probe.lastArrival.stop === "vesta" && (await A.get(`/api/credits?mission=${vesta}`)).medal === "silver", "Vesta on day 28: Silver");
check(near(st.probe.tech.priceCut, 0.03, 1e-9) && near(st.probe.tech.tapCredits, 0.05, 1e-9), `planet tech now: tap credits +5% (Mars), upgrades ${st.probe.tech.priceCut * 100}% cheaper (Vesta)`);

// Upgrades 3% cheaper: Steady hands round(300 × 0.97) = 291, Cold-gas jets round(150 × 0.97) = 146.
await A.admin("give", { km: 1000 });
const before = (await a.next("me")).me.credits; // the give sends the new balance
const m0 = await a.buy("hands");
check(m0.ok && near(before - m0.me.credits, 291, 0.01), `Steady hands cost ${(before - m0.me.credits).toFixed(0)} credits (300, 3% off)`);
const m1 = await a.buy("cold");
check(m1.ok && near(m0.me.credits - m1.me.credits, 146, 0.01), `Cold-gas jets cost ${(m0.me.credits - m1.me.credits).toFixed(0)} credits (150, 3% off)`);

// ---------- The guest's stamp moves to the account on sign-in; deleting the account leaves the credits ----------
const s = await G.post("/api/auth/email", { email: `stamp${Date.now()}@example.com`, token: TOKEN });
await G.post("/api/auth/confirm", { t: new URL(s.devLink).hash.slice(3) });
const name = (await G.get("/api/auth/names")).offers[0];
await G.post("/api/auth/name", { name });
await wait(800);
const tourG = await G.get("/api/tour");
check(tourG.legs.find((l) => l.missionId === mars)?.helped === true, "G signed in: the Mars stamp G earned as a guest is the account's");
const crMars2 = await G.get(`/api/credits?mission=${mars}`);
check(crMars2.names.some((n) => n.name === name) && crMars2.crew === crMars.crew, `G is named in the Mars credits now (${crMars2.crew} crew, as before)`);
const del = await G.post("/api/auth/delete");
check(del.ok, "G deleted the account");
const crMars3 = await A.get(`/api/credits?mission=${mars}`);
check(!crMars3.names.some((n) => n.name === name) && crMars3.crew === crMars.crew, `the Mars credits drop G's name but keep the count (${crMars3.crew} crew)`);
const tourG2 = await G.get("/api/tour");
check(!tourG2.legs.find((l) => l.missionId === mars)?.helped, "G, a fresh guest now, has no stamps");

// ---------- Tour 2: the reset clears the tech; Mars in 33 days (Bronze); Ceres in 10 (Gold): offline cap +40 min ----------
for (const x of [a, b, g]) x.close();
await admin("reset", {});
await admin("signal", { seconds: 200 * 3600 });
st = await admin("state");
check(Object.values(st.probe.tech).every((v) => v === 0), "the launch reset clears the planet tech");
const a2 = await A.connect();
await wait(1100);
await a2.taps(5);
st = await arriveAfter(33);
check(near(st.probe.tech.tapCredits, 0.02, 1e-9) && (await A.get(`/api/credits?mission=${st.probe.lastArrival.missionId}`)).medal === "bronze", "Mars on day 33: Bronze, tap credits +2%");
st = await chooseBranch([A], 0);
check(st.probe.stop === "ceres", "the crew chose Ceres");
st = await arriveAfter(10);
check(st.probe.lastArrival.stop === "ceres" && st.probe.tech.offlineMin === 40, `Ceres on day 10: Gold, offline cap +${st.probe.tech.offlineMin} min`);
const auto = a2.hello.me.autoKmS;
check(auto > 0, `A has auto-thrust (${auto} km/s) for the offline check`);
a2.close();
await wait(1500);
const distBefore = (await admin("state")).probe.distanceKm;
await admin("signal", { seconds: 200 * 3600 });
await admin("clock", { hours: 10 });
const a3 = await A.connect();
const w = a3.hello.welcome;
check(w && w.countedMs === 8 * 3_600_000 + 40 * 60_000, `away 10 hours: ${w ? (w.countedMs / 3_600_000).toFixed(2) : "no"} hours counted (8 h + 40 min)`);
check(w && near(w.km, (auto * w.countedMs) / 1000, 0.5), `welcome back: ${w?.km.toFixed(1)} km of auto-thrust`);
const st2 = await admin("state");
console.log(`   (probe moved ${(st2.probe.distanceKm - distBefore).toFixed(0)} km while A was away; only 8 hours of A's thrust reach it)`);
a3.close();

await admin("reset", {});
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
