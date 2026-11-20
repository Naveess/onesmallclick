// Local check of phase 8c: arrival, orbit, credits, the branch vote, the next leg, a no-vote stop, the reset.
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf-8"))[1];
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
    return { ws, hello, next, taps: async (n) => (ws.send(JSON.stringify({ t: "taps", n, seq: ++seq })), next("credited")), close: () => ws.close() };
  };
  return { jar, get, post, connect, cookie };
}
const admin = async (action, body) =>
  (
    await fetch(`${base}/api/admin/${action}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    })
  ).json();

await admin("reset", {});
let st = await admin("state");
check(st.probe.stop === "mars" && st.probe.fromStop === "earth" && st.probe.arrivedAt === null && st.probe.routeKm === 480_000_000, `a fresh tour: Earth → Mars, ${st.probe.routeKm} km`);
check(st.probe.coastKmS === 21, `coasting at ${st.probe.coastKmS} km/s on the Mars leg`);
await admin("signal", { seconds: 40 * 3600 });

// --- Three players push: one signed in (named in the credits), two guests ---
const A = browser();
await A.get("/api/session");
const s = await A.post("/api/auth/email", { email: `crew${Date.now()}@example.com`, token: TOKEN });
await A.post("/api/auth/confirm", { t: new URL(s.devLink).hash.slice(3) });
const offers = (await A.get("/api/auth/names")).offers;
await A.post("/api/auth/name", { name: offers[0] });
const B = browser();
await B.get("/api/session");
const C = browser();
await C.get("/api/session");
const sockets = [];
for (const [X, n] of [[A, 20], [B, 10], [C, 5]]) {
  const x = await X.connect();
  await wait(1100);
  await x.taps(n);
  sockets.push(x);
}

// --- Arrive at Mars ---
await admin("distance", { km: 480_000_000 });
await wait(1500);
st = await admin("state");
check(st.probe.arrivedAt !== null && st.probe.stop === "mars", `arrived at Mars (${new Date(st.probe.arrivedAt).toISOString()})`);
check(st.probe.pausedSince !== null && st.probe.coastKmS === 0, "in orbit: the probe holds still");
check(st.probe.vote.kind === "branch" && st.probe.vote.options.map((o) => o.id).join() === "branch:ceres,branch:vesta", `branch vote: ${st.probe.vote.options.map((o) => o.label).join(" or ")}`);
const leftH = (st.probe.vote.closesAt - st.serverNow) / 3_600_000;
check(leftH >= 12 && leftH <= 36 && new Date(st.probe.vote.closesAt).getUTCHours() === 0, `it closes at midnight UTC, ${leftH.toFixed(1)} hours away`);
check(st.probe.lastArrival?.missionId === st.probe.missionId && st.probe.lastArrival.stop === "mars", "the latest arrival is Mars");
const marsMission = st.probe.missionId;

// --- The credits ---
const cr = await A.get(`/api/credits?mission=${marsMission}`);
check(cr.crew >= 3 && cr.names.some((n) => n.name === offers[0]) && cr.guests >= 2 && cr.taps >= 35, `credits: ${cr.crew} crew, ${cr.names.length} named (${cr.names.map((n) => n.name).join(", ")}), ${cr.guests} guests, ${cr.taps} taps`);

// --- Taps in orbit earn credits but don't move the probe or wake it ---
const before = st.probe.distanceKm;
await wait(1100);
const c1 = await sockets[1].taps(5);
st = await admin("state");
check(c1.taps === 5 && c1.km > 0 && st.probe.distanceKm === before && st.probe.pausedSince !== null, `in orbit 5 taps credit ${c1.km} km of credits and the probe stays put`);

// --- Vote: two for Ceres, one for Vesta ---
const round = st.probe.vote.round;
const v1 = await A.post("/api/vote", { token: TOKEN, round, option: 0 });
const v2 = await B.post("/api/vote", { token: TOKEN, round, option: 0 });
const v3 = await C.post("/api/vote", { token: TOKEN, round, option: 1 });
check(v1.ok && v2.ok && v3.ok, "three branch votes counted");
await admin("close-vote", {});
await wait(800);
st = await admin("state");
const ceresKm = 186_400_000;
check(st.probe.stop === "ceres" && st.probe.fromStop === "mars" && st.probe.arrivedAt === null && st.probe.routeKm === ceresKm, `the crew chose Ceres: new leg Mars → Ceres, ${st.probe.routeKm} km`);
check(Math.abs(st.probe.coastKmS - 21 * (ceresKm / 480e6)) < 0.001, `coasting scales with the leg: ${st.probe.coastKmS.toFixed(3)} km/s`);
check(st.probe.vote.kind === "daily", "the daily vote is back");
const log = await A.get("/api/log");
const kinds = log.entries.slice(0, 6).map((e) => e.kind);
check(["leg_start", "branch_result", "branch_open", "arrival"].every((k) => kinds.includes(k)), `log: ${log.entries.slice(0, 5).map((e) => e.title).join(" | ")}`);

// --- Arrive at Ceres: no vote there, so on to Jupiter straight away ---
await admin("distance", { km: ceresKm });
await wait(1500);
st = await admin("state");
check(st.probe.stop === "jupiter" && st.probe.fromStop === "ceres" && st.probe.routeKm === 364_100_000 && st.probe.arrivedAt === null, `arrived at Ceres and set off for Jupiter: ${st.probe.routeKm} km`);
check(st.probe.lastArrival?.stop === "ceres", "the latest arrival is Ceres, so its arrival screen still shows once");
const crCeres = await A.get(`/api/credits?mission=${st.probe.lastArrival.missionId}`);
check(crCeres.stop === "ceres" && crCeres.fromStop === "mars", `Ceres credits: ${crCeres.crew} crew`);

// --- The launch reset goes back to Mars ---
for (const x of sockets) x.close();
await admin("reset", {});
st = await admin("state");
check(st.probe.stop === "mars" && st.probe.lastArrival === null && st.probe.routeKm === 480_000_000, "reset: back to Earth → Mars, no arrival");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
