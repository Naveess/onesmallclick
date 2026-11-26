// Local check of phase A1b-2: compare a save state with now, restore ticked parts (and Undo it), the daily save state,
// save states at sign-in merges, merging a guest into an account (and Undo), and moving a device's history to another
// account (and Undo). Local only: it signs in by email link (dev) as the ADMIN_EMAILS address in .dev.vars.
//   node scripts/check-restore.mjs [http://localhost:5173]
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const vars = readFileSync(`${ROOT}/.dev.vars`, "utf-8");
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(vars)[1];
const ADMIN_EMAIL = /^ADMIN_EMAILS\s*=\s*"?([^",\r\n]+)/m.exec(vars)[1].trim();
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const sql = (q) => execSync(`npx wrangler d1 execute onesmallclick --local --command "${q}"`, { cwd: ROOT, stdio: "ignore" });
const sqlJson = (q) => JSON.parse(execSync(`npx wrangler d1 execute onesmallclick --local --json --command "${q}"`, { cwd: ROOT, encoding: "utf-8" }))[0].results;

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
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { req };
}
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
async function signInGame(b, email) {
  await b.req("/api/session");
  const r = await b.req("/api/auth/email", { email, token: TOKEN });
  await b.req("/api/auth/confirm", { t: new URL(r.body.devLink).hash.slice(3) });
  return (await b.req("/api/session")).body;
}

sql("DELETE FROM network_caps WHERE kind = 'admin'");
sql(`DELETE FROM login_tokens WHERE email = '${ADMIN_EMAIL}'`);
sql("DELETE FROM login_tokens WHERE email LIKE 'restore-%'");

const nav = browser();
await signInGame(nav, ADMIN_EMAIL);
let r = await nav.req("/api/admin/session", { key: KEY });
check(r.status === 200, "the admin signs in");

const stamp = Date.now();
const keyOf = async (email) => (await nav.req(`/api/admin/search?q=${encodeURIComponent(email)}`)).body.find((x) => x.email === email).key;
const guestKeyOf = async (name) => (await nav.req(`/api/admin/search?q=${encodeURIComponent(name)}`)).body.find((x) => x.name === name && x.kind === "guest")?.key;
const page = async (k) => (await nav.req(`/api/admin/player?key=${encodeURIComponent(k)}`)).body;
const fix = (k, fix, confirm) => nav.req("/api/admin/fix", { key: k, reason: "check-restore", confirm, fix });
const logOf = async (k, action) => (await page(k)).log.find((l) => l.action === action);
const undo = async (k, action, confirm) => nav.req("/api/admin/undo", { logId: (await logOf(k, action)).id, reason: "check-restore undo", confirm });
const day = new Date((await nav.req("/api/admin/state")).body.serverNow).toISOString().slice(0, 10);

// ---------- Compare and restore ----------
const a = browser();
const as = await signInGame(a, `restore-a-${stamp}@example.com`);
const aKey = await keyOf(`restore-a-${stamp}@example.com`);
await fix(aKey, { kind: "set", credits: 7000, levels: { ion: 4 } });
let p = await page(aKey);
const snap = p.snapshots.find((s) => s.reason === "before set").id;
r = await nav.req(`/api/admin/save-state?id=${snap}&key=${encodeURIComponent(aKey)}`);
check(r.status === 200 && (r.body.then.progress === null || r.body.then.progress.creditsMilli === 0), "compare: the save state from before the fix has 0 credits");
check(r.body.now?.progress?.creditsMilli === 7_000_000 && r.body.now.progress.levels.ion === 4, "…and now has 7,000 credits and ion 4");
check(r.body.snapshot?.reason === "before set" && r.body.then.today.day === r.body.now.today.day, "…with the save state's details and the same day on both sides");
r = await nav.req(`/api/admin/save-state?id=${snap}&key=a:someone-else`);
check(r.status === 404, "a save state can't be opened as another player's");

const restore = (k, id, parts, confirm) => nav.req("/api/admin/restore", { key: k, snapshot: id, parts, reason: "check-restore", confirm });
r = await restore(aKey, snap, ["credits"], "wrong");
check(r.status === 400 && /Type the player's name/.test(r.body.error), "a restore needs the name typed out");
r = await restore(aKey, snap, [], as.name);
check(r.status === 400, "…and at least one part ticked");
r = await restore(aKey, snap, ["credits"], as.name);
p = await page(aKey);
check(r.status === 200 && p.progress.credits === 0 && p.progress.levels.ion === 4, "restore just the credits: 0 credits, ion still 4");
check(p.snapshots[0].reason === "before restore" && JSON.parse((await logOf(aKey, "restore")).detail).parts.join() === "credits", "…a save state first, and logged with its parts");
r = await undo(aKey, "restore", as.name);
p = await page(aKey);
check(r.status === 200 && p.progress.credits === 7000, "Undo the restore: 7,000 credits back");

// ---------- The daily save state ----------
const aDev = p.devices[0].id;
sql(`INSERT INTO daily_km (day, device_id, account_id, km, tap_km, tap_moved_km, taps) VALUES ('${day}', '${aDev}', '${aKey.slice(2)}', 321, 300, 100, 77) ON CONFLICT (day, device_id) DO UPDATE SET km = 321, taps = 77, account_id = excluded.account_id`);
r = await nav.req("/api/admin/daily-save", { day, force: true });
check(r.status === 200 && r.body.day === day && r.body.players >= 1, `the daily save state for ${day}: ${r.body.players} players in one file`);
r = await nav.req("/api/admin/daily-save", { day });
check(r.status === 200 && r.body.skipped === true, "…run again, it's skipped (that day's file exists)");
p = await page(aKey);
const daily = p.snapshots.find((s) => s.reason === `daily (${day})`);
check(!!daily, "…it's on the player's list of save states");
r = await nav.req(`/api/admin/save-state?id=${daily.id}&key=${encodeURIComponent(aKey)}`);
check(r.status === 200 && r.body.then.key === aKey && r.body.then.today.rows.some((x) => x.km === 321 && x.taps === 77), "…and opening it picks this player out of the file (321 km, 77 taps)");
check(sqlJson(`SELECT COUNT(DISTINCT file) AS n FROM snapshots WHERE reason = 'daily (${day})'`)[0].n === 1, "…one file for everyone");

// ---------- Save states when a guest signs in (the merge) ----------
const g2 = browser();
const g2s = (await g2.req("/api/session")).body;
const g2Key = await guestKeyOf(g2s.name);
await fix(g2Key, { kind: "set", credits: 200 });
await signInGame(g2, `restore-c-${stamp}@example.com`);
const cKey = await keyOf(`restore-c-${stamp}@example.com`);
p = await page(cKey);
check(p.progress?.credits === 200, "a guest with 200 credits signs in: the account has them");
check(p.snapshots.some((s) => s.reason === `before sign-in merge (guest ${g2s.name})`), "…and a save state of the account was taken before the merge");
check(sqlJson(`SELECT COUNT(*) AS n FROM snapshots WHERE player_key = '${g2Key}' AND reason = 'before sign-in merge'`)[0].n === 1, "…and one of the guest");

// ---------- Merge a guest into an account ----------
const g = browser();
const gs = (await g.req("/api/session")).body;
const gKey = await guestKeyOf(gs.name);
await fix(gKey, { kind: "set", credits: 300, levels: { sail: 2 } });
await fix(gKey, { kind: "badge", badge: "night-shift", on: true });
sql(`INSERT INTO daily_km (day, device_id, account_id, km, tap_km, tap_moved_km, taps) VALUES ('${day}', '${gKey}', NULL, 50, 50, 10, 9)`);
const bb = browser();
const bs = await signInGame(bb, `restore-b-${stamp}@example.com`);
const bKey = await keyOf(`restore-b-${stamp}@example.com`);
await fix(bKey, { kind: "set", credits: 1000, levels: { sail: 1 } });
const merge = (confirm, into = bKey) => nav.req("/api/admin/merge", { key: gKey, into, reason: "played as a guest first", confirm });
r = await merge("wrong");
check(r.status === 400, "a merge needs the guest's name typed out");
r = await nav.req("/api/admin/merge", { key: bKey, into: aKey, reason: "x", confirm: bs.name });
check(r.status === 400, "only a guest can be merged");
r = await merge(gs.name);
p = await page(bKey);
check(r.status === 200 && p.progress.credits >= 1300 && p.progress.credits < 1400 && p.progress.levels.sail === 2, "merge the guest: credits added (1,300, plus a little auto-thrust), the higher sail level (2)");
check(p.badges.some((x) => x.badge === "night-shift"), "…the guest's badge is the account's");
check(sqlJson(`SELECT account_id FROM daily_km WHERE day = '${day}' AND device_id = '${gKey}'`)[0]?.account_id === bKey.slice(2), "…and the guest's km today count for the account");
check(p.snapshots.some((s) => s.reason === `before merge (guest ${gs.name})`) && !!(await logOf(bKey, "merge")), "…with save states first, and logged on the account");
const gp = await page(gKey);
check(!gp.progress || gp.progress.credits === 0, "…the guest is left empty");
r = await undo(bKey, "merge", bs.name);
p = await page(bKey);
check(r.status === 200 && Math.floor(p.progress.credits / 100) === 10 && p.progress.levels.sail === 1 && !p.badges.some((x) => x.badge === "night-shift"), "Undo the merge: the account is back to 1,000 credits, sail 1, no Night Shift");
const gBack = await page(gKey);
check(Math.floor((gBack.progress?.credits ?? 0) / 100) === 3 && gBack.progress.levels.sail === 2 && gBack.badges.some((x) => x.badge === "night-shift"), "…the guest has its 300 credits, sail 2 and Night Shift back");
check(sqlJson(`SELECT account_id FROM daily_km WHERE day = '${day}' AND device_id = '${gKey}'`)[0]?.account_id === null, "…and its km today are the guest's again");

// ---------- Move a device to another account ----------
const x = browser();
const xs = await signInGame(x, `restore-d-${stamp}@example.com`);
const dKey = await keyOf(`restore-d-${stamp}@example.com`);
const xDev = (await page(dKey)).devices[0].id;
sql(`INSERT INTO daily_km (day, device_id, account_id, km, tap_km, tap_moved_km, taps) VALUES ('${day}', '${xDev}', '${dKey.slice(2)}', 88, 80, 20, 11) ON CONFLICT (day, device_id) DO UPDATE SET km = 88, taps = 11, account_id = excluded.account_id`);
const move = (confirm, into = bKey) => nav.req("/api/admin/move", { key: dKey, device: xDev, into, reason: "signed in to the wrong account", confirm });
r = await move(xs.name, dKey);
check(r.status === 400, "a device can't be moved to the same account");
r = await nav.req("/api/admin/move", { key: dKey, device: aDev, into: bKey, reason: "x", confirm: xs.name });
check(r.status === 404, "…or from an account it isn't signed in to");
r = await move(xs.name);
check(r.status === 200, "move the device to another account");
check(sqlJson(`SELECT account_id FROM daily_km WHERE day = '${day}' AND device_id = '${xDev}'`)[0]?.account_id === bKey.slice(2), "…its 88 km today count for the other account");
check((await x.req("/api/session")).body.account === null, "…and that browser is signed out");
check((await page(dKey)).devices.length === 0 && !!(await logOf(dKey, "move-device")), "…it's off this account's devices, and logged");
r = await undo(dKey, "move-device", xs.name);
check(r.status === 200 && sqlJson(`SELECT account_id FROM daily_km WHERE day = '${day}' AND device_id = '${xDev}'`)[0]?.account_id === dKey.slice(2), "Undo the move: the km are this account's again");

// ---------- Big moments (made by other checks: check-badges hands over a shift, check-arrival lands a leg) ----------
const pre = sqlJson("SELECT id, player_key FROM snapshots WHERE reason = 'before prestige' ORDER BY at DESC LIMIT 1")[0];
if (pre) {
  r = await nav.req(`/api/admin/save-state?id=${pre.id}&key=${encodeURIComponent(pre.player_key)}`);
  check(r.status === 200 && r.body.then.progress.kmSinceShift >= 2_000_000, "a save state from just before a prestige holds the km before the handover");
} else console.log("SKIP  no prestige save state yet (run check-badges first)");
const arr = sqlJson("SELECT reason, COUNT(*) AS n, COUNT(DISTINCT file) AS files FROM snapshots WHERE reason LIKE 'leg % arrived' GROUP BY file ORDER BY MAX(at) DESC LIMIT 1")[0];
if (arr) check(arr.n >= 1 && arr.files === 1, `a leg's arrival saved its crew in one file (${arr.reason}: ${arr.n} players)`);
else console.log("SKIP  no arrival save state yet (run check-arrival first)");

// Tidy up today's test km, so the leaderboard checks (check-nudges) aren't thrown by them.
sql(`DELETE FROM daily_km WHERE day = '${day}' AND (device_id IN ('${gKey}', '${g2Key}', '${xDev}', '${aDev}') OR account_id IN (SELECT id FROM accounts WHERE email LIKE 'restore-%'))`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
