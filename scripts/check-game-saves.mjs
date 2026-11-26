// Local check of phase A1c-1: game save states (by hand, before a Game-tab control, the hourly and daily crons, a new
// version starting), comparing one with now, restoring the probe (and undoing it by restoring the one taken before).
// Local only: it signs in by email link (dev) as the ADMIN_EMAILS address in .dev.vars.
//   node scripts/check-game-saves.mjs [http://localhost:5173]
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
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

const jar = new Map();
const req = async (path, body) => {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), Origin: base, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    if (kv.slice(i + 1)) jar.set(kv.slice(0, i), kv.slice(i + 1));
    else jar.delete(kv.slice(0, i));
  }
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

sql("DELETE FROM network_caps WHERE kind = 'admin'");
sql(`DELETE FROM login_tokens WHERE email = '${ADMIN_EMAIL}'`);
await req("/api/session");
const link = await req("/api/auth/email", { email: ADMIN_EMAIL, token: "XXXX.DUMMY.TOKEN.XXXX" });
await req("/api/auth/confirm", { t: new URL(link.body.devLink).hash.slice(3) });
let r = await req("/api/admin/session", { key: KEY });
check(r.status === 200, "the admin signs in");

const lastMission = (dump) => [...dump.tables.mission].sort((a, b) => a.id - b.id).pop();
const distanceNow = async () => (await req("/api/admin/state")).body.probe.distanceKm;
const near = (a, b) => Math.abs(a - b) <= Math.max(5000, Math.abs(b) * 0.001);

// ---------- Taking them ----------
r = await req("/api/admin/game-save", { reason: "check-game-saves" });
check(r.status === 200 && r.body.snapshot > 0, "take a game save state by hand");
let list = (await req("/api/admin/game-states")).body;
check(list.game?.[0]?.reason === "check-game-saves", "…it's at the top of the Save states tab");

const before = await distanceNow();
const target = Math.round(before + 2_000_000);
r = await req("/api/admin/distance", { km: target });
check(r.status === 200, `move the probe with a Game-tab control (${Math.round(before).toLocaleString("en-GB")} → ${target.toLocaleString("en-GB")} km)`);
list = (await req("/api/admin/game-states")).body;
const pre = list.game.find((s) => s.reason === "before distance");
check(!!pre, "…a game save state was taken before it");

// ---------- Compare ----------
r = await req(`/api/admin/game-state?id=${pre.id}`);
check(r.status === 200 && near(lastMission(r.body.then).distance_km, before) && near(lastMission(r.body.now).distance_km, target), "compare: the save state has the old distance, now has the new one");
check(r.body.then.tables.vote_round && r.body.then.tables.meta && !r.body.then.tables.progress, "…it holds the game's tables, not players' progress");
r = await req(`/api/admin/game-state?id=999999999`);
check(r.status === 404, "an unknown save state: 404");

// ---------- Restore, and undo it ----------
r = await req("/api/admin/game-restore", { snapshot: pre.id, reason: "check", confirm: "restore the probe" });
check(r.status === 400, "a restore needs the phrase typed exactly");
r = await req("/api/admin/game-restore", { snapshot: pre.id, reason: "", confirm: "RESTORE THE PROBE" });
check(r.status === 400, "…and a reason");
r = await req("/api/admin/game-restore", { snapshot: pre.id, reason: "check-game-saves restore", confirm: "RESTORE THE PROBE" });
check(r.status === 200 && r.body.snapshot > 0, "restore the probe from the save state");
await wait(1500);
const after = await distanceNow();
check(near(after, before), `…the probe is back where it was (${Math.round(after).toLocaleString("en-GB")} km)`);
list = (await req("/api/admin/game-states")).body;
check(list.game.some((s) => s.id === r.body.snapshot && s.reason === "before restore"), "…a save state was taken first");
check(list.restores?.[0]?.reason === "check-game-saves restore" && JSON.parse(list.restores[0].detail).snapshot === r.body.snapshot, "…and the restore is logged with it");
r = await req("/api/admin/game-restore", { snapshot: list.restores[0] && JSON.parse(list.restores[0].detail).snapshot, reason: "undo", confirm: "RESTORE THE PROBE" });
await wait(1500);
check(r.status === 200 && near(await distanceNow(), target), "undo: restoring the 'before restore' one puts the moved probe back");

// ---------- The crons, and a new version starting ----------
r = await fetch(`${base}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent("0 * * * *")}`);
await wait(1500);
list = (await req("/api/admin/game-states")).body;
if (r.status === 404) console.log("SKIP  this dev server can't run the cron by hand");
else {
  check(list.game.some((s) => s.reason === "hourly" && Date.now() - s.at < 60_000), "the hourly cron takes a game save state");
  await fetch(`${base}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent("5 0 * * *")}`);
  await wait(2500);
  list = (await req("/api/admin/game-states")).body;
  check(list.game.some((s) => s.reason === "daily" && Date.now() - s.at < 60_000), "the 00:05 cron takes the game's daily one");
}
const deployed = list.game.find((s) => s.reason.startsWith("new version "));
if (deployed) check(true, `a new version starting took one (${deployed.reason})`);
else console.log("SKIP  no 'new version' save state locally (the dev server may not give a version id)");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
