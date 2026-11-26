// Local check of phase A1b-1: the admin fixes, player save states (R2 + the snapshots index), name history, Undo and
// export. Local only: it signs in by email link (dev) as the ADMIN_EMAILS address in .dev.vars, like check-admin.
//   node scripts/check-fixes.mjs [http://localhost:5173]
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
  const req = async (path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json", ...headers },
      body: body && JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const name = kv.slice(0, kv.indexOf("="));
      const value = kv.slice(kv.indexOf("=") + 1);
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
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

const nav = browser();
await signInGame(nav, ADMIN_EMAIL);
let r = await nav.req("/api/admin/session", { key: KEY });
check(r.status === 200, "the admin signs in");

const stamp = Date.now();
const player = browser();
const ps = await signInGame(player, `fixes-${stamp}@example.com`);
check(!!ps.account, `a test player signs in (${ps.name})`);
const keyOf = async (email) => (await nav.req(`/api/admin/search?q=${encodeURIComponent(email)}`)).body.find((x) => x.email === email).key;
const key = await keyOf(`fixes-${stamp}@example.com`);
const accountId = key.slice(2);
const page = async (k = key) => (await nav.req(`/api/admin/player?key=${encodeURIComponent(k)}`)).body;
const fix = (fix, reason = "check-fixes", confirm, k = key) => nav.req("/api/admin/fix", { key: k, reason, confirm, fix });
const lastLog = async (action, k = key) => (await page(k)).log.find((l) => l.action === action);

// ---------- Rules for every fix ----------
r = await fix({ kind: "set", credits: 5000 }, "");
check(r.status === 400 && /reason/.test(r.body.error), "a fix without a reason is refused");
r = await fix({ kind: "set", credits: 5000 }, "x", undefined, "a:nobody");
check(r.status === 404, "a fix on an unknown player: 404");
const before = (await page()).snapshots.length;

// ---------- Set values ----------
r = await fix({ kind: "set", credits: 5000, levels: { ion: 3 }, patches: 6 }, "credits vanished");
check(r.status === 200 && r.body.ok && r.body.snapshot > 0, "set credits, an upgrade and patches");
let p = await page();
check(p.progress?.credits === 5000 && p.progress.levels.ion === 3 && p.progress.patches === 6, "…the page shows 5,000 cr, ion 3, 6 patches (live from the Probe)");
check(p.snapshots.length === before + 1 && p.snapshots[0].reason === "before set" && p.snapshots[0].admin === ADMIN_EMAIL, "…a save state was taken first, with why and who");
const setLog = p.log.find((l) => l.action === "fix-set");
check(setLog?.reason === "credits vanished" && JSON.parse(setLog.detail).parts.join() === "credits,upgrades,prestige", "…and it's logged with the reason and the parts it changed");
r = await fix({ kind: "set", credits: -5 });
check(r.status === 400, "a negative value is refused");
r = await fix({ kind: "set", levels: { ion: 999 } });
check(r.status === 400, "an upgrade level over 200 is refused");

// ---------- Badges ----------
r = await fix({ kind: "badge", badge: "night-shift", on: true });
p = await page();
check(r.status === 200 && p.badges.some((b) => b.badge === "night-shift"), "give a badge (Night Shift)");
r = await fix({ kind: "badge", badge: "night-shift", on: false });
p = await page();
check(r.status === 200 && !p.badges.some((b) => b.badge === "night-shift"), "…and take it away");
r = await fix({ kind: "badge", badge: "made-up", on: true });
check(r.status === 400, "an unknown badge is refused");

// ---------- Name and country ----------
r = await nav.req("/api/admin/name-offers");
check(r.body.offers?.length === 3, `three fresh name offers (${r.body.offers?.join(", ")})`);
const newName = r.body.offers[0];
const oldName = p.profile.name;
r = await fix({ kind: "name", name: newName, lock: true });
p = await page();
check(r.status === 200 && p.profile.name === newName && p.profile.nameChosen === true, "give a new name, locked");
check(p.nameHistory[0]?.oldName === oldName && p.nameHistory[0]?.newName === newName && p.nameHistory[0]?.by === ADMIN_EMAIL, "…and it's in the name history");
check((await player.req("/api/session")).body.name === newName, "…the player sees the new name");
r = await fix({ kind: "name", name: "Bad Name!", lock: false });
check(r.status === 400, "a name that breaks the rules is refused");
const adminName = (await nav.req("/api/session")).body.name;
r = await fix({ kind: "name", name: adminName, lock: false });
check(r.status === 409, "someone else's name is refused");
r = await fix({ kind: "country", country: "FR", clearCooldown: true });
p = await page();
check(r.status === 200 && p.profile.country === "FR" && p.profile.countryChangedAt === null, "change the country and clear the cooldown");
r = await fix({ kind: "country", country: "ZZ", clearCooldown: false });
check(r.status === 400, "a code that isn't a country is refused");

// ---------- Reset, and Undo ----------
r = await fix({ kind: "reset", parts: ["credits", "upgrades"] });
check(r.status === 400 && /Type the player's name/.test(r.body.error), "a reset needs the name typed out");
r = await fix({ kind: "reset", parts: ["credits", "upgrades"] }, "check-fixes", newName);
p = await page();
check(r.status === 200 && p.progress.credits === 0 && p.progress.levels.ion === 0 && p.progress.patches === 6, "reset credits and upgrades (patches kept)");
const resetLog = p.log.find((l) => l.action === "fix-reset");
r = await nav.req("/api/admin/undo", { logId: resetLog.id, reason: "check undo" });
check(r.status === 400, "an undo needs the name typed out");
r = await nav.req("/api/admin/undo", { logId: resetLog.id, reason: "check undo", confirm: newName });
p = await page();
check(r.status === 200 && p.progress.credits === 5000 && p.progress.levels.ion === 3, "Undo the reset: 5,000 cr and ion 3 are back");
check(p.profile.country === "FR" && p.profile.name === newName, "…and only the reset's parts changed (name and country kept)");
const undoLog = p.log.find((l) => l.action === "undo");
check(undoLog && JSON.parse(undoLog.detail).undid === resetLog.id && p.snapshots[0].reason === "before undo", "…logged, with a save state before it");
r = await nav.req("/api/admin/undo", { logId: undoLog.id, reason: "undo the undo", confirm: newName });
p = await page();
check(r.status === 200 && p.progress.credits === 0, "an undo can be undone too");
const noteLog = p.log.find((l) => l.action === "note");
r = await nav.req("/api/admin/undo", { logId: (await lastLog("export"))?.id ?? 0, reason: "x", confirm: newName });
check(r.status === 400, "a line with nothing to put back can't be undone");

// ---------- Today's km (the leaderboard) ----------
const day = new Date((await nav.req("/api/admin/state")).body.serverNow).toISOString().slice(0, 10);
const devId = p.devices[0].id;
sql(`INSERT INTO daily_km (day, device_id, account_id, km, tap_km, tap_moved_km, taps) VALUES ('${day}', '${devId}', '${accountId}', 123, 100, 50, 40) ON CONFLICT (day, device_id) DO UPDATE SET km = 123, taps = 40, account_id = excluded.account_id`);
r = await fix({ kind: "reset", parts: ["today"] }, "cheat km", newName);
let rows = sqlJson(`SELECT km FROM daily_km WHERE day = '${day}' AND account_id = '${accountId}'`);
check(r.status === 200 && rows.length === 0, "reset today's km and taps: off today's leaderboard");
r = await nav.req("/api/admin/undo", { logId: (await lastLog("fix-reset")).id, reason: "my mistake", confirm: newName });
rows = sqlJson(`SELECT km, taps FROM daily_km WHERE day = '${day}' AND account_id = '${accountId}'`);
check(r.status === 200 && rows[0]?.km === 123 && rows[0]?.taps === 40, "…and Undo puts today's 123 km and 40 taps back");

// ---------- Crew credit ----------
p = await page();
if (p.arrivedLegs.length === 0) {
  r = await fix({ kind: "crew", missionId: 1, on: true });
  check(r.status === 400 && /arrived/.test(r.body.error), "crew credit only for legs that have arrived (none have, here)");
} else {
  const leg = p.arrivedLegs[0].missionId;
  r = await fix({ kind: "crew", missionId: leg, on: true, km: 500 });
  p = await page();
  check(r.status === 200 && p.legs.some((l) => l.missionId === leg && l.km === 500), "add crew credit for an arrived leg");
  r = await fix({ kind: "crew", missionId: leg, on: false });
  p = await page();
  check(r.status === 200 && !p.legs.some((l) => l.missionId === leg), "…and remove it");
}

// ---------- Export ----------
r = await nav.req(`/api/admin/export?key=${encodeURIComponent(key)}`);
check(r.status === 200 && /attachment/.test(r.headers.get("Content-Disposition") ?? "") && r.body.account?.email === `fixes-${stamp}@example.com`, "export: a JSON file with their account");
check(Array.isArray(r.body.kmByDay) && r.body.nameHistory.length >= 1 && r.body.progress?.patches === 6, "…with their km by day, name history and progress");
check(!!(await lastLog("export")), "…and the export is logged");

// ---------- Sign out everywhere ----------
r = await fix({ kind: "signout" });
check(r.status === 200 && (await player.req("/api/session")).body.account === null, "sign out everywhere: the player's browser is signed out");

// ---------- A guest ----------
const guest = browser();
const gs = (await guest.req("/api/session")).body;
const gKey = (await nav.req(`/api/admin/search?q=${encodeURIComponent(gs.name)}`)).body.find((x) => x.name === gs.name && x.kind === "guest").key;
r = await fix({ kind: "set", credits: 250 }, "guest check", undefined, gKey);
check(r.status === 200 && (await page(gKey)).progress?.credits === 250, "a guest's credits can be set");
r = await fix({ kind: "signout" }, "x", undefined, gKey);
check(r.status === 400, "a guest has nothing to sign out");
r = await fix({ kind: "delete" }, "x", gs.name, gKey);
check(r.status === 400, "a guest can't be deleted as an account");

// ---------- Delete ----------
const doomed = browser();
const ds = await signInGame(doomed, `fixes-del-${stamp}@example.com`);
const dKey = await keyOf(`fixes-del-${stamp}@example.com`);
r = await fix({ kind: "delete" }, "asked by email", "wrong", dKey);
check(r.status === 400, "delete needs the name typed out");
r = await fix({ kind: "delete" }, "asked by email", ds.name, dKey);
check(r.status === 200 && r.body.gone, "delete the account");
check((await nav.req(`/api/admin/player?key=${encodeURIComponent(dKey)}`)).status === 404, "…it's gone");
check((await doomed.req("/api/session")).body.account === null, "…and their browser is a guest now");
check(sqlJson(`SELECT COUNT(*) AS n FROM snapshots WHERE player_key = '${dKey}'`)[0].n === 1, "…its save state stays (ages out in 90 days)");
check(sqlJson(`SELECT COUNT(*) AS n FROM admin_log WHERE target = '${dKey}' AND action = 'fix-delete'`)[0].n === 1, "…and the delete is logged");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
