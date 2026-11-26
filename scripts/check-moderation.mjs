// Local check of phase A2a: moderation. Warn (and the OK), time out (a complete pause: taps, auto-thrust, offline pay,
// pings, votes, upgrades), lift, hide from the boards, ban (and its network), remove a cheat's km (and from the probe),
// with undo, and an appeal. Local only (dev sign-in links, the Bearer key):
//   node scripts/check-moderation.mjs [http://localhost:5173]
import { execSync } from "node:child_process";
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
const sqlJson = (q) => JSON.parse(execSync(`npx wrangler d1 execute onesmallclick --local --json --command "${q}"`, { cwd: ROOT, encoding: "utf-8" }))[0].results;
const sql = (q) => execSync(`npx wrangler d1 execute onesmallclick --local --command "${q}"`, { cwd: ROOT, stdio: "ignore" });

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const req = async (path, body) => {
    const res = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const name = kv.slice(0, kv.indexOf("="));
      const value = kv.slice(kv.indexOf("=") + 1);
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
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
      taps: async (n) => (ws.send(JSON.stringify({ t: "taps", n, seq: ++seq })), next("credited")),
      buy: async (key) => (ws.send(JSON.stringify({ t: "buy", key, seq: ++seq })), next("me")),
      close: () => ws.close(),
    };
  };
  return { req, connect };
}
const admin = async (action, body) => {
  const res = await fetch(`${base}/api/admin/${action}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Origin: base },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};
async function signInGame(b, email) {
  await b.req("/api/session");
  const r = await b.req("/api/auth/email", { email, token: TOKEN });
  await b.req("/api/auth/confirm", { t: new URL(r.devLink).hash.slice(3) });
  return b.req("/api/session");
}

// A probe on its way, signal on, maintenance off.
let st = await admin("state");
if (st.probe.maintenance) await admin("maintenance", { on: false, reason: "check-moderation: start clean" });
if (st.probe.arrivedAt !== null || st.probe.burn) await admin("reset", {});
await admin("signal", { seconds: 6 * 3600 });
// Earlier runs' network bans would catch this run's browsers (locally every browser is the same network).
sql("DELETE FROM network_bans");

const stamp = Date.now();
const P = browser();
const s0 = await signInGame(P, `mod-${stamp}@example.com`);
check(!!s0.account && s0.standing?.hold === null && s0.standing.warnings.length === 0, `a test player signs in, standing clean (${s0.name})`);
const key = `a:${sqlJson(`SELECT id FROM accounts WHERE email = 'mod-${stamp}@example.com'`)[0].id}`;
const name = s0.name;
// Credits as the game pays them: a fresh connection settles the player up to now (or not, while paused).
const credits = async () => {
  const x = await P.connect();
  x.close();
  return x.hello.me.credits;
};

let g = await P.connect();
let c = await g.taps(10);
check(c && c.taps > 0, `taps count (${c?.taps} credited)`);
// Some auto-thrust, to see it stop while paused.
await admin("fix", { key, reason: "check-moderation", fix: { kind: "set", levels: { sail: 50 }, credits: 0 } }); // 15 km/s of auto-thrust
await wait(300);
g = await P.connect();

// ---------- Warn ----------
let r = await admin("moderate", { key, kind: "warn", reason: "x" });
check(r.status === 400, "a warning needs a reason");
r = await admin("moderate", { key, kind: "warn", reason: "Please don't tap with a script (check)" });
check(r.status === 200 && r.items?.[0]?.kind === "warn" && r.items[0].active, "warn: recorded and active");
let s = await P.req("/api/session");
check(s.standing.warnings.length === 1 && s.standing.warnings[0].reason.includes("script"), "…the player's session carries it");
await P.req("/api/moderation/ack", { id: s.standing.warnings[0].id });
s = await P.req("/api/session");
const v1 = await admin(`moderation?key=${encodeURIComponent(key)}`);
check(s.standing.warnings.length === 0 && v1.items[0].ackedAt !== null, "…they tap OK: gone, and mission control sees when");
check(s.standing.hold === null, "…a warning doesn't pause anything");

// ---------- Time out ----------
r = await admin("moderate", { key, kind: "timeout", days: 2, reason: "check" });
check(r.status === 400, "a time out is 1, 3, 7 or 14 days");
await wait(1500);
r = await admin("moderate", { key, kind: "timeout", days: 1, reason: "Autoclicker (check)" });
check(r.status === 200, "time out for 1 day");
await wait(500);
// (Their open screens are closed with 4001 to reconnect, the same way as the A1b fixes; Node's test socket doesn't
// report a close the local server starts, so it isn't checked here. The browser pass checks it.)
const before = await credits();
s = await P.req("/api/session");
const until = s.standing.hold?.until ?? 0;
check(s.standing.hold?.kind === "timeout" && Math.abs(until - (Date.now() + 86_400_000)) < 60_000, "…the session says paused, until tomorrow");
const covered = sqlJson(`SELECT COUNT(*) AS n FROM moderation_devices WHERE mod_id = ${s.standing.hold.id}`)[0].n;
check(covered >= 1, `…it covers the account's devices (${covered})`);
g = await P.connect();
c = await g.taps(20);
check(c && c.taps === 0, `taps count for nothing (${c?.taps} credited)`);
const b = await g.buy("cold");
check(b && b.ok === false, "an upgrade is refused");
await wait(2500);
const during = await credits();
check(before > 0 && Math.abs(during - before) < 1, `auto-thrust pays nothing (${Math.round(before)} → ${Math.round(during)} cr)`);
r = await P.req("/api/ping", { token: TOKEN });
check(r.ok === false && r.reason === "paused", `a ping is turned away (${r.reason})`);
r = await P.req("/api/vote", { token: TOKEN, round: st.probe.vote.round, option: 0 });
check(r.ok === false && r.reason === "paused", `a vote is turned away (${r.reason})`);
g.close();
await wait(2500); // time "away" while paused: no offline pay for it later

// ---------- Lift ----------
r = await admin("moderation-lift", { id: s.standing.hold.id, reason: "check: lifted" });
check(r.status === 200 && r.items.find((m) => m.kind === "timeout").liftedAt !== null, "lift the time out");
s = await P.req("/api/session");
check(s.standing.hold === null, "…the session is clear");
g = await P.connect();
const after = await credits();
check(after - during < 5, `…no offline pay for the paused time (${Math.round(during)} → ${Math.round(after)} cr)`);
c = await g.taps(5);
check(c && c.taps > 0, "…taps count again");
await wait(2000);
check((await credits()) > after, "…and auto-thrust pays again");
await admin("fix", { key, reason: "check-moderation: no more auto-thrust", fix: { kind: "set", levels: { sail: 0 } } });

// ---------- Hide ----------
const onBoard = async () => ((await P.req("/api/leaderboard?board=players")).rows ?? []).some((row) => row.name === name);
check(await onBoard(), "they're on today's board");
r = await admin("moderate", { key, kind: "hide", reason: "Climbing too fast (check)" });
check(r.status === 200, "hide from the boards");
check(!(await onBoard()), "…they're off the board");
s = await P.req("/api/session");
check(s.standing.hidden?.reason.includes("Climbing") && s.standing.hold === null, "…they're told, and can still play");
c = await (await P.connect()).taps(3);
check(c && c.taps > 0, "…their taps still count");
r = await admin("moderation-lift", { id: r.items.find((m) => m.kind === "hide").id, reason: "check" });
check(await onBoard(), "…lifted: back on the board");

// ---------- Ban, with the network ----------
r = await admin("moderate", { key, kind: "ban", netDays: 3, reason: "Cheating (check)", confirm: "wrong" });
check(r.status === 400, "a ban needs the name typed");
r = await admin("moderate", { key, kind: "ban", netDays: 9, reason: "Cheating (check)", confirm: name });
check(r.status === 400, "…and a network ban is at most 7 days");
r = await admin("moderate", { key, kind: "ban", netDays: 3, reason: "Cheating (check)", confirm: name });
check(r.status === 200, "ban, and their network for 3 days");
const banId = r.items.find((m) => m.kind === "ban").id;
s = await P.req("/api/session");
check(s.standing.hold?.kind === "ban" && s.standing.hold.until === null && s.standing.hidden !== null, "…the session says banned, no end, off the boards");
check(!(await onBoard()), "…off the board");
const nets = sqlJson(`SELECT until FROM network_bans WHERE mod_id = ${banId}`);
check(nets.length === 1 && Math.abs(nets[0].until - (Date.now() + 3 * 86_400_000)) < 120_000, "…their network was caught on that visit, for 3 days");
const Q = browser();
const q = await Q.req("/api/session");
check(q.standing.hold?.kind === "ban" && q.standing.hold.until !== null, "a new browser on that network is banned too (until the network ban ends)");
const qg = await Q.connect();
const qc = await qg.taps(5);
check(qc && qc.taps === 0, "…its taps count for nothing");
qg.close();
r = await Q.req("/api/feedback", { token: TOKEN, kind: "appeal", message: "It wasn't me (check-moderation)", page: "/" });
check(r.ok === true, "an appeal goes through while banned");
const fb = sqlJson(`SELECT player_key FROM feedback WHERE kind = 'appeal' ORDER BY id DESC LIMIT 1`)[0];
check(!!fb?.player_key, "…with who's appealing");
r = await admin("moderation-lift", { id: banId, reason: "check: unban" });
check(r.status === 200 && sqlJson(`SELECT COUNT(*) AS n FROM network_bans WHERE mod_id = ${banId}`)[0].n === 0, "unban: the network ban goes too");
check((await Q.req("/api/session")).standing.hold === null && (await P.req("/api/session")).standing.hold === null, "…both are clear");

// ---------- Remove a cheat's km ----------
g = await P.connect();
await g.taps(30);
await wait(300);
const day = (await admin(`moderation?key=${encodeURIComponent(key)}`)).days[0]?.day;
const pv = await admin(`remove-km?key=${encodeURIComponent(key)}&day=${day}`);
check(pv.km > 0 && pv.probeKm > 0, `preview: ${Math.round(pv.km)} km on the boards ${day}, the probe at ${Math.round(pv.probeKm)} km`);
r = await admin("remove-km", { key, day, km: pv.km, reason: "check", confirm: "wrong" });
check(r.status === 400, "removing km needs the name typed");
r = await admin("remove-km", { key, day, km: pv.km, probeKm: 1000, reason: "check", confirm: name });
check(r.status === 400, "…and the probe part needs the phrase");
r = await admin("remove-km", { key, day, probeKm: 1000, reason: "Autoclicker km (check)", confirm: name, confirmProbe: "TAKE IT OFF THE PROBE" });
check(r.status === 200, "remove the day's km, and 1,000 km off the probe");
const pv2 = await admin(`remove-km?key=${encodeURIComponent(key)}&day=${day}`);
check(pv2.km < 1, `…their km that day: ${pv2.km.toFixed(2)}`);
check(Math.abs(pv.probeKm - pv2.probeKm - 1000) < 200, `…the probe went back ${Math.round(pv.probeKm - pv2.probeKm)} km`);
check(((await P.req("/api/leaderboard?board=players")).rows ?? []).every((row) => row.name !== name || row.km < 1), "…they're off today's board (or under 1 km)");
const rem = r.removals[0];
r = await admin("remove-km-undo", { logId: rem.logId, reason: "check undo", confirm: name });
check(r.status === 200 && r.removals[0].undone, "undo the removal");
const pv3 = await admin(`remove-km?key=${encodeURIComponent(key)}&day=${day}`);
check(pv3.km >= pv.km - 1, `…their km are back (${Math.round(pv3.km)})`);
check(pv3.probeKm - pv2.probeKm > 900, "…and the probe's 1,000 km");
r = await admin("remove-km-undo", { logId: rem.logId, reason: "again", confirm: name });
check(r.status === 409, "…an undo only once");

// ---------- A guest ----------
const G = browser();
const gcrew = (await G.req("/api/session")).crew;
const gk = sqlJson(`SELECT id FROM devices WHERE rowid = ${gcrew}`)[0]?.id;
check(!!gk, "a guest to time out");
r = await admin("moderate", { key: gk, kind: "timeout", days: 3, reason: "check guest" });
const gs = await G.req("/api/session");
check(r.status === 200 && gs.standing.hold?.kind === "timeout", "a guest can be timed out (by device)");
await admin("moderation-lift", { id: r.items[0].id, reason: "check" });

// ---------- The pages ----------
const terms = await (await fetch(`${base}/terms`)).text();
check(terms.includes('id="crew-rules"') && terms.includes("Appeal"), "the terms page has the crew rules and appeals");
const privacy = await (await fetch(`${base}/privacy`)).text();
check(privacy.includes("Moderation records"), "the privacy page has moderation records");
const log = await (await fetch(`${base}/api/admin/log?target=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
check(["mod-warn", "mod-timeout", "mod-hide", "mod-ban", "mod-lift", "remove-km", "remove-km-undo"].every((a) => log.some((l) => l.action === a)), "every action is in their admin log");

g.close();
console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
