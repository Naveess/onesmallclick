// Local check of phase B2, the launch wipe: everything goes except accounts, their sign-ins, devices, crew links and
// Early Beta badges, and the probe starts again from Earth. LOCAL TEST DATA ONLY: it wipes the local database.
//   node scripts/check-wipe.mjs [http://localhost:5173]
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
if (!/localhost|127\.0\.0\.1/.test(base)) {
  console.error("check-wipe only runs against a local dev server: it wipes the database.");
  process.exit(1);
}
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
const count = (table, where = "") => sql(`SELECT COUNT(*) AS n FROM ${table} ${where}`)[0].n;

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
    let closed = null;
    ws.onclose = (e) => (closed = e.code);
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
      closed: () => closed,
      taps: async (n) => {
        ws.send(JSON.stringify({ t: "taps", n, seq: ++seq }));
        return next("credited");
      },
      close: () => ws.close(),
    };
  };
  return { get, post, connect };
}
const admin = async (action, body) => {
  const res = await fetch(`${base}/api/admin/${action}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json()) };
};
const ids = (list) => (list ?? []).map((b) => b.id).sort();

// ---------- Before: a guest and an account with progress, pings, votes, badges, km, a burn and an arrival ----------
await admin("reset", {});
await admin("signal", { seconds: 40 * 3600 });
const G = browser();
await G.get("/api/session");
const g = await G.connect();
const B = browser();
await B.get("/api/session");
const s = await B.post("/api/auth/email", { email: `wipe${Date.now()}@example.com`, token: TOKEN });
await B.post("/api/auth/confirm", { t: new URL(s.devLink).hash.slice(3) });
const name = (await B.get("/api/auth/names")).offers[0];
await B.post("/api/auth/name", { name });
await wait(500);
const b = await B.connect();
await wait(1100);
await g.taps(10);
await b.taps(10);
await G.post("/api/ping", { token: TOKEN });
await admin("give", { km: 50_000 }); // the admin's own (nobody's) device: harmless
let st = await admin("state");
const vote = st.probe.vote;
await B.post("/api/vote", { token: TOKEN, round: vote.round, option: 0 });
await admin("leg-start", { days: 20 });
await admin("burn", { minutes: 5, target: 10 });
await wait(1100);
await b.taps(10);
st = await admin("clock", { hours: 0.1 }); // lands: an arrival with medal, stamps and planet tech
check(st.probe.lastArrival !== null && Object.values(st.probe.tech).some((v) => v > 0), "before: an arrival, with planet tech");
await wait(400);
await admin("close-vote", {}); // on to the next leg
const before = {
  accounts: count("accounts"),
  sessions: count("sessions"),
  devices: count("devices"),
  links: count("share_links"),
  beta: count("badges", "WHERE badge = 'early-beta'"),
};
check(count("daily_km") > 0 && count("pings") > 0 && count("votes") > 0 && count("mission_crew") > 0, "before: km, pings, votes and crew in D1");
check(count("badges", "WHERE badge <> 'early-beta'") > 0 && before.beta > 0, `before: badges (${before.beta} Early Beta)`);
st = await admin("state");
const oldId = st.probe.missionId;

// ---------- The wipe ----------
const refused = await admin("launch-wipe", { confirm: "yes" });
check(refused.status === 400, "refused without the phrase typed out");
st = await admin("launch-wipe", { confirm: "WIPE EVERYTHING" });
check(st.status === 200 && st.probe.missionId === oldId + 1, `wiped: mission ${st.probe.missionId} (was ${oldId})`);
check(st.probe.stop === "mars" && st.probe.fromStop === "earth" && st.probe.distanceKm < 1000 && st.probe.arrivedAt === null, "the probe starts again from Earth for Mars");
check(st.probe.lastArrival === null && Object.values(st.probe.tech).every((v) => v === 0) && !st.probe.burn, "no arrival, planet tech or burn");
check(st.clockOffsetMs === 0 && st.probe.milestones.length === 0, "real time, no milestones");
check(st.probe.vote.options.every((o) => o.votes === 0), "a fresh vote");
await wait(300);
check(g.closed() === 4002 && b.closed() === 4002, "open games were closed so they reconnect");

// ---------- After ----------
check(count("daily_km") === 0 && count("pings") === 0 && count("votes") === 0, "D1: no km, pings or votes");
check(count("mission_crew") === 0 && count("milestones") === 0 && count("recruits") === 0 && count("share_counts") === 0 && count("progress") === 0, "D1: no crew, milestones, recruits, share counts or progress");
check(count("missions") === 1 && count("vote_days") === 1, "D1: just the new mission and today's vote");
const logRows = sql(`SELECT kind FROM log_entries`);
check(logRows.length === 1 && logRows[0].kind === "launch", "D1: the log has only Launch day");
check(count("badges", "WHERE badge <> 'early-beta'") === 0 && count("badges", "WHERE badge = 'early-beta'") === before.beta, `D1: only Early Beta badges left (${before.beta})`);
check(
  count("accounts") === before.accounts && count("sessions") === before.sessions && count("devices") === before.devices && count("share_links") === before.links,
  "D1: accounts, sessions, devices and crew links kept",
);

const g2 = await G.connect();
check(g2.hello.me.credits === 0 && Object.values(g2.hello.me.levels).every((v) => v === 0) && g2.hello.badges.length === 0, "the guest reconnects with nothing");
check(!g2.hello.pingedToday && g2.hello.pingStreakDays === 0 && g2.hello.tapsAll === 0, "no ping, streak or clicks");
const b2 = await B.connect();
check(ids(b2.hello.badges).join() === "early-beta", `the account keeps only Early Beta (${ids(b2.hello.badges)})`);
check(b2.hello.me.credits === 0 && b2.hello.tapsAll === 0, "and no credits or clicks");
const sess = await B.get("/api/session");
check(sess.account?.name === name, `still signed in as ${name}`);
await wait(1100);
const c = await b2.taps(5);
check(c.taps === 5 && c.km > 0, "playing works straight away");
const board = await B.get("/api/leaderboard?board=players");
check((board.rows ?? []).every((r) => r.km <= c.km + 1), "the leaderboard starts empty");

for (const x of [g, b, g2, b2]) x.close();
await admin("reset", {});
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
