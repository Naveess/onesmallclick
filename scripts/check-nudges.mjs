// Local check of phase G1's server side: the guest's ghost rank on the Players board, the countries board counting
// signed-in crew only, the sign-up source (a nudge's ?from= kept in the osc_from cookie) saved on new accounts,
// email sign-in reported by /api/session, and the /admin Players card.
//   node scripts/check-nudges.mjs [http://localhost:5173]
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
const sql = (q) =>
  JSON.parse(execSync(`npx wrangler d1 execute onesmallclick --local --json --command "${q.replace(/"/g, '\\"')}"`, { cwd: ROOT, encoding: "utf-8" }))[0]
    .results;

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
    await next("hello");
    return {
      taps: async (n) => {
        ws.send(JSON.stringify({ t: "taps", n, seq: ++seq }));
        return next("credited");
      },
      close: () => ws.close(),
    };
  };
  const signIn = async () => {
    const s = await post("/api/auth/email", { email: `nudge${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`, token: TOKEN });
    await post("/api/auth/confirm", { t: new URL(s.devLink).hash.slice(3) });
    const name = (await get("/api/auth/names")).offers[0];
    await post("/api/auth/name", { name });
    return name;
  };
  return { jar, get, post, connect, signIn };
}
const admin = async (action) => {
  const res = await fetch(`${base}/api/admin/${action}`, { headers: { Authorization: `Bearer ${KEY}` } });
  return { status: res.status, body: await res.json() };
};

// ---------- /api/session says whether email sign-in works (locally: yes, through the dev links) ----------
const G = browser();
const sess = await G.get("/api/session");
check(sess.emailSignIn === true, "/api/session: emailSignIn true locally");

// ---------- A signed-in player (from the ghost row) and a guest, both pushing today ----------
const B = browser();
await B.get("/api/session");
B.jar.set("osc_from", "ghost");
const bName = await B.signIn();
const acct = sql(`SELECT signup_source FROM accounts WHERE name = '${bName}'`)[0];
check(acct?.signup_source === "ghost", `a sign-up from the ghost row is saved as "ghost" (${acct?.signup_source})`);

const C = browser();
await C.get("/api/session");
C.jar.set("osc_from", "not-a-nudge");
const cName = await C.signIn();
check(sql(`SELECT signup_source FROM accounts WHERE name = '${cName}'`)[0]?.signup_source === null, "an unknown ?from= is saved as nothing");

// Today's km, written straight into the local D1 (the probe sends them every 5 minutes): the guest out-pushes the account.
const day = new Date().toISOString().slice(0, 10);
const gDev = G.jar.get("osc_device").split(".")[0];
const bAcct = sql(`SELECT id FROM accounts WHERE name = '${bName}'`)[0].id;
const bDev = B.jar.get("osc_device").split(".")[0];
const top = sql(`SELECT COALESCE(MAX(s), 0) AS m FROM (SELECT SUM(km) AS s FROM daily_km WHERE day = '${day}' AND account_id IS NOT NULL GROUP BY account_id)`)[0].m;
sql(`INSERT INTO daily_km (day, device_id, account_id, km, tap_km, taps) VALUES ('${day}', '${bDev}', '${bAcct}', ${top + 500}, ${top + 500}, 10)`);
sql(`INSERT INTO daily_km (day, device_id, km, tap_km, taps) VALUES ('${day}', '${gDev}', ${top + 9000}, ${top + 9000}, 20)`);

const players = await G.get("/api/leaderboard?board=players");
check(players.signedIn === false && players.me && players.me.km > 0, `guest row: ${players.me?.km} km today`);
check(players.ghostRank === 1, `the guest's ghost rank is #1 (they out-pushed everyone signed in): ${players.ghostRank}`);
const bBoard = await B.get("/api/leaderboard?board=players");
check(bBoard.signedIn === true && !bBoard.ghostRank, "a signed-in player gets no ghost rank");

const countries = await G.get("/api/leaderboard?board=countries");
const total = countries.rows.reduce((s, r) => s + r.km, 0);
check(total < players.me.km, `the countries board counts signed-in crew only: ${total.toFixed(0)} km in all, under the guest's own ${players.me.km.toFixed(0)} km (cached up to a minute)`);

// ---------- The /admin Players card ----------
const denied = await fetch(`${base}/api/admin/players`);
check(denied.status === 401, "/api/admin/players needs the admin key");
const rep = (await admin("players")).body;
check(rep.accounts.total === sql(`SELECT COUNT(*) AS n FROM accounts`)[0].n, `accounts: ${rep.accounts.total} (matches D1), ${rep.accounts.day} new today`);
check(rep.devices.total === sql(`SELECT COUNT(*) AS n FROM devices`)[0].n, `devices: ${rep.devices.total} (matches D1)`);
check(rep.signups.some((x) => x.source === "ghost" && x.n >= 1), `sign-ups by nudge include ghost: ${JSON.stringify(rep.signups)}`);
check(Array.isArray(rep.pushed) && rep.pushed.some((x) => x.day === players.day && x.players >= 2), `players who pushed today: ${rep.pushed.at(-1)?.players}`);
check(JSON.stringify(rep).search(/@|"id"/) === -1, "the report has no emails or ids");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
