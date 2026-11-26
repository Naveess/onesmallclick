// Phase A1b-1 (prompt 124): player save states and the admin fixes.
//
// A save state is everything a fix can change about one player (shared/admin.ts PlayerState): progress (from the
// Probe, paid up to now), today's km and taps, badges, crew credit for legs, name and country. Each is one gzipped JSON
// file in the R2 bucket onesmallclick-snapshots (binding SNAPSHOTS) under players/, which a lifecycle rule deletes
// after 90 days; D1 `snapshots` indexes them (pruned at the same age).
//
// Every fix (owner only) needs a reason, saves a save state first, and is logged with that save state and the parts it
// changes, so the log's Undo puts back just those parts. An undo saves a save state first too, so it can be undone.
// Destructive fixes (reset, delete) and undos ask for the player's name typed out.
//
//   POST /api/admin/fix          { key, reason, confirm?, fix: Fix } → { ok, snapshot }
//   POST /api/admin/undo         { logId, reason, confirm } → { ok, snapshot }
//   GET  /api/admin/export       ?key= → everything about the player, as a JSON file (a subject access request)
//   GET  /api/admin/name-offers  → three free generated names
//
// Phase A1b-2 (prompt 127):
//   GET  /api/admin/save-state   ?id=&key= → { snapshot, then, now } (compare a save state with now)
//   POST /api/admin/restore      { key, snapshot, parts, reason, confirm } → put back the ticked parts (undoable)
//   POST /api/admin/merge        { key (a guest), into (an account), reason, confirm } → as if the guest signed in there
//   POST /api/admin/move         { key (an account), device, into (another account), reason, confirm } → the device's history moves
//   POST /api/admin/daily-save   { day?, force? } → the daily save state now (the cron runs it at 00:05 UTC)

import { BADGE_INFO } from "../shared/badges";
import { isCountryCode } from "../shared/account";
import { generateName, isGeneratedName } from "../shared/names";
import { UPGRADE_KEYS } from "../shared/upgrades";
import {
  ADMIN_TEXT_MAX,
  CONFIRM_FIXES,
  fixParts,
  isAccountKey,
  isAdminName,
  MERGE_PARTS,
  STATE_PARTS,
  type AdminWho,
  type DayRow,
  type Fix,
  type PlayerState,
  type StatePart,
} from "../shared/admin";
import { adminLog } from "./admin";
import { freeName, removeAccount } from "./auth";
import { capture, dailySaveStates, loadState, saveState } from "./savestates";

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

function probe(env: Env) {
  return env.PROBE.get(env.PROBE.idFromName("mission"));
}

/** Puts back the ticked parts of a save state. Returns notes on anything it couldn't (a name someone else has taken). */
export async function restore(env: Env, state: PlayerState, parts: StatePart[], admin: string): Promise<string[]> {
  const db = env.DB;
  const key = state.key;
  const account = isAccountKey(key);
  const id = account ? key.slice(2) : key;
  const has = (p: StatePart) => parts.includes(p);
  const notes: string[] = [];

  if (has("name")) {
    const now = await capture(env, key);
    const name = state.profile.name;
    try {
      if (account) await db.prepare(`UPDATE accounts SET name = ?, name_chosen = ? WHERE id = ?`).bind(name, state.profile.nameChosen ? 1 : 0, id).run();
      else await db.prepare(`UPDATE devices SET name = ? WHERE id = ?`).bind(name, id).run();
      if (now && now.profile.name !== name) await nameChanged(env, key, now.profile.name, name, admin);
    } catch {
      notes.push(`The name ${name} is someone else's now, so the name wasn't put back.`);
    }
  }
  if (has("country")) {
    if (account) await db.prepare(`UPDATE accounts SET country = ?, country_changed_at = ? WHERE id = ?`).bind(state.profile.country, state.profile.countryChangedAt, id).run();
    else await db.prepare(`UPDATE devices SET country = ? WHERE id = ?`).bind(state.profile.country, id).run();
  }
  if (has("badges")) {
    await db.batch([
      db.prepare(`DELETE FROM badges WHERE player_key = ?`).bind(key),
      ...state.badges.map((b) => db.prepare(`INSERT INTO badges (player_key, badge, earned_at) VALUES (?, ?, ?)`).bind(key, b.badge, b.at)),
    ]);
  }
  if (has("crew")) {
    await db.batch([
      db.prepare(`DELETE FROM mission_crew WHERE player_key = ?`).bind(key),
      ...state.crew.map((c) =>
        db
          .prepare(`INSERT INTO mission_crew (mission_id, player_key, account_id, name, country, km, taps) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(c.missionId, key, c.accountId, c.name, c.country, c.km, c.taps),
      ),
    ]);
  }
  // The Probe's parts last: it also forgets what it remembers about them and reconnects their tabs.
  const p = state.progress;
  await probe(env).adminSetPlayer(key, {
    ...(has("credits") ? { creditsMilli: p?.creditsMilli ?? 0 } : {}),
    ...(has("upgrades") ? { levels: p?.levels ?? Object.fromEntries(UPGRADE_KEYS.map((k) => [k, 0])) } : {}),
    ...(has("prestige") ? { patches: p?.patches ?? 0, kmSinceShift: p?.kmSinceShift ?? 0 } : {}),
    ...(has("today") ? { day: state.today } : {}),
  });
  return notes;
}

async function nameChanged(env: Env, key: string, oldName: string | null, newName: string, by: string) {
  await env.DB.prepare(`INSERT INTO name_history (player_key, at, old_name, new_name, changed_by) VALUES (?, ?, ?, ?, ?)`)
    .bind(key, Date.now(), oldName, newName, by)
    .run();
}

const ZERO_LEVELS = () => Object.fromEntries(UPGRADE_KEYS.map((k) => [k, 0]));

class FixError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Applies one fix (the save state has already been taken). */
async function apply(env: Env, key: string, before: PlayerState, fix: Fix, admin: string): Promise<string[]> {
  const db = env.DB;
  const account = isAccountKey(key);
  const id = account ? key.slice(2) : key;
  const stub = probe(env);
  switch (fix.kind) {
    case "reset": {
      const parts = new Set(fix.parts);
      if (parts.size === 0) throw new FixError("Tick at least one part to reset.");
      if (parts.has("badges")) await db.prepare(`DELETE FROM badges WHERE player_key = ?`).bind(key).run();
      if (parts.has("crew")) await db.prepare(`DELETE FROM mission_crew WHERE player_key = ?`).bind(key).run();
      await stub.adminSetPlayer(key, {
        ...(parts.has("credits") ? { creditsMilli: 0 } : {}),
        ...(parts.has("upgrades") ? { levels: ZERO_LEVELS() } : {}),
        ...(parts.has("prestige") ? { patches: 0, kmSinceShift: 0 } : {}),
        ...(parts.has("today") ? { day: { day: before.today.day, rows: [] as DayRow[] } } : {}),
      });
      return [];
    }
    case "set": {
      const n = (v: unknown, what: string, max = 1e12) => {
        const x = Number(v);
        if (!Number.isFinite(x) || x < 0 || x > max) throw new FixError(`${what} must be a number from 0 to ${max.toLocaleString("en-GB")}.`);
        return Math.round(x);
      };
      const levels: Record<string, number> = {};
      if (fix.levels) for (const k of UPGRADE_KEYS) if (fix.levels[k] !== undefined) levels[k] = n(fix.levels[k], `The ${k} level`, 200);
      if (fix.credits === undefined && !fix.levels && fix.patches === undefined) throw new FixError("Nothing to set.");
      await stub.adminSetPlayer(key, {
        ...(fix.credits !== undefined ? { creditsMilli: n(fix.credits, "Credits") * 1000 } : {}),
        ...(fix.levels ? { levels } : {}),
        ...(fix.patches !== undefined ? { patches: n(fix.patches, "Patches", 10_000) } : {}),
      });
      return [];
    }
    case "badge": {
      if (!(fix.badge in BADGE_INFO)) throw new FixError("No such badge.");
      if (fix.on) await db.prepare(`INSERT OR IGNORE INTO badges (player_key, badge, earned_at) VALUES (?, ?, ?)`).bind(key, fix.badge, Date.now()).run();
      else await db.prepare(`DELETE FROM badges WHERE player_key = ? AND badge = ?`).bind(key, fix.badge).run();
      await stub.adminSetPlayer(key, {});
      return fix.on ? [] : ["If they still qualify for that badge, the game may give it back the next time it checks."];
    }
    case "crew": {
      const leg = await db.prepare(`SELECT id FROM missions WHERE id = ? AND arrived_at IS NOT NULL`).bind(fix.missionId).first();
      if (!leg) throw new FixError("Crew credit is only for legs that have arrived.");
      if (fix.on) {
        const km = Math.max(0, Number(fix.km) || 0);
        await db
          .prepare(
            `INSERT INTO mission_crew (mission_id, player_key, account_id, name, country, km, taps) VALUES (?, ?, ?, ?, ?, ?, 0)
             ON CONFLICT (mission_id, player_key) DO NOTHING`,
          )
          .bind(fix.missionId, key, account ? id : null, before.profile.name, before.profile.country, km)
          .run();
      } else await db.prepare(`DELETE FROM mission_crew WHERE mission_id = ? AND player_key = ?`).bind(fix.missionId, key).run();
      await stub.adminSetPlayer(key, {});
      return [];
    }
    case "name": {
      const name = String(fix.name ?? "").trim().toLowerCase();
      if (!isGeneratedName(name) && !isAdminName(name)) throw new FixError("A name is 3–24 lower-case letters, digits or underscores.");
      try {
        if (account) await db.prepare(`UPDATE accounts SET name = ?, name_chosen = ? WHERE id = ?`).bind(name, fix.lock ? 1 : 0, id).run();
        else await db.prepare(`UPDATE devices SET name = ? WHERE id = ?`).bind(name, id).run();
      } catch {
        throw new FixError("Someone else has that name.", 409);
      }
      if (name !== before.profile.name) await nameChanged(env, key, before.profile.name, name, admin);
      await stub.adminSetPlayer(key, {});
      return [];
    }
    case "country": {
      const country = fix.country === null || fix.country === "" ? null : String(fix.country).toUpperCase();
      if (country !== null && !isCountryCode(country)) throw new FixError("That isn't a country code (two letters, like GB).");
      if (country === null && !fix.clearCooldown) throw new FixError("Pick a country, or tick clear the cooldown.");
      if (account) {
        await db
          .prepare(`UPDATE accounts SET country = COALESCE(?, country), country_changed_at = CASE WHEN ? THEN NULL ELSE country_changed_at END WHERE id = ?`)
          .bind(country, fix.clearCooldown ? 1 : 0, id)
          .run();
      } else if (country !== null) await db.prepare(`UPDATE devices SET country = ? WHERE id = ?`).bind(country, id).run();
      await stub.adminSetPlayer(key, {});
      return [];
    }
    case "signout": {
      if (!account) throw new FixError("A guest has no sign-ins.");
      await db.batch([
        db.prepare(`DELETE FROM sessions WHERE account_id = ?`).bind(id),
        db.prepare(`UPDATE devices SET account_id = NULL WHERE account_id = ?`).bind(id),
      ]);
      await stub.adminSetPlayer(key, {}); // their open tabs reconnect, signed out
      return [];
    }
    case "delete": {
      if (!account) throw new FixError("Only an account can be deleted.");
      const acc = await db.prepare(`SELECT email FROM accounts WHERE id = ?`).bind(id).first<{ email: string | null }>();
      await removeAccount(env, id, acc?.email ?? null);
      return [];
    }
    default:
      throw new FixError("No such fix.");
  }
}

const reasonOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, ADMIN_TEXT_MAX) : "");

async function fixRoute(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; reason?: unknown; confirm?: unknown; fix?: Fix };
  const key = typeof b.key === "string" ? b.key.slice(0, 80) : "";
  const reason = reasonOf(b.reason);
  const fix = b.fix;
  if (!key || !fix || typeof fix !== "object") return json({ error: "key and fix" }, 400);
  if (!reason) return json({ error: "Give a reason: it goes in the log." }, 400);
  const before = await capture(env, key);
  if (!before) return json({ error: "No such player" }, 404);
  if (CONFIRM_FIXES.includes(fix.kind) && b.confirm !== before.profile.name) return json({ error: `Type the player's name (${before.profile.name}) to confirm.` }, 400);
  const snapshot = await saveState(env, before, `before ${fix.kind}`, who.email);
  try {
    const notes = await apply(env, key, before, fix, who.email);
    await adminLog(env, who.email, `fix-${fix.kind}`, key, reason, { fix, snapshot, parts: fixParts(fix) });
    return json({ ok: true, snapshot, notes, gone: fix.kind === "delete" });
  } catch (err) {
    if (err instanceof FixError) return json({ error: err.message }, err.status);
    throw err;
  }
}

async function undoRoute(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { logId?: unknown; reason?: unknown; confirm?: unknown };
  const reason = reasonOf(b.reason);
  if (!reason) return json({ error: "Give a reason: it goes in the log." }, 400);
  const row = await env.DB.prepare(`SELECT target, action, detail FROM admin_log WHERE id = ?`).bind(Number(b.logId)).first<{ target: string | null; action: string; detail: string | null }>();
  let detail: { snapshot?: number; parts?: StatePart[] } = {};
  try {
    detail = row?.detail ? JSON.parse(row.detail) : {};
  } catch {
    // an old or cut-short line: nothing to undo
  }
  if (row?.target && detail.snapshot && (row.action === "merge" || row.action === "move-device")) {
    return undoMove(env, who, Number(b.logId), row.target, row.action, detail as MoveDetail, reason, b.confirm);
  }
  if (!row?.target || !detail.snapshot || !detail.parts?.length) return json({ error: "That change can't be undone from here." }, 400);
  const state = await loadState(env, detail.snapshot);
  if (!state) return json({ error: "Its save state has gone (they're kept 90 days)." }, 410);
  const now = await capture(env, row.target);
  if (!now) return json({ error: "That player has gone." }, 404);
  if (b.confirm !== now.profile.name) return json({ error: `Type the player's name (${now.profile.name}) to confirm.` }, 400);
  const snapshot = await saveState(env, now, "before undo", who.email);
  const notes = await restore(env, state, detail.parts, who.email);
  await adminLog(env, who.email, "undo", row.target, reason, { undid: Number(b.logId), action: row.action, snapshot, parts: detail.parts, notes });
  return json({ ok: true, snapshot, notes });
}

// ---------- Phase A1b-2 ----------

const isPart = (p: unknown): p is StatePart => STATE_PARTS.some((x) => x.id === p);

type SnapshotItemRow = { id: number; at: number; reason: string; admin: string | null; bytes: number; player_key: string };

/** A save state and the player now, for the compare view. "now" carries the save state's day's km, so they line up. */
async function stateRoute(env: Env, url: URL): Promise<Response> {
  const id = Number(url.searchParams.get("id"));
  const key = (url.searchParams.get("key") ?? "").slice(0, 80);
  const snapshot = await env.DB.prepare(`SELECT id, at, reason, admin, bytes, player_key FROM snapshots WHERE id = ? AND kind = 'player'`)
    .bind(id)
    .first<SnapshotItemRow>();
  if (!snapshot || snapshot.player_key !== key) return json({ error: "No such save state for this player" }, 404);
  const then = await loadState(env, id);
  if (!then) return json({ error: "Its file has gone (they're kept 90 days)." }, 410);
  const now = await capture(env, key);
  if (!now) return json({ error: "That player has gone." }, 404);
  if (now.today.day !== then.today.day) now.today = { day: then.today.day, rows: await dayRowsOf(env, key, then.today.day) };
  const { player_key: _key, ...item } = snapshot;
  return json({ snapshot: item, then, now });
}

async function dayRowsOf(env: Env, key: string, day: string): Promise<DayRow[]> {
  const account = isAccountKey(key);
  const rows = (
    await env.DB.prepare(
      `SELECT device_id, account_id, km, tap_km, tap_moved_km, taps FROM daily_km WHERE day = ? AND ${account ? "account_id = ?" : "device_id = ? AND account_id IS NULL"}`,
    )
      .bind(day, account ? key.slice(2) : key)
      .all<{ device_id: string; account_id: string | null; km: number; tap_km: number; tap_moved_km: number; taps: number }>()
  ).results;
  return rows.map((r) => ({ deviceId: r.device_id, accountId: r.account_id, km: r.km, tapKm: r.tap_km, tapMovedKm: r.tap_moved_km, taps: r.taps }));
}

/** Puts back the ticked parts of any of the player's save states. A save state is taken first, so Undo works. */
async function restoreRoute(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; snapshot?: unknown; parts?: unknown; reason?: unknown; confirm?: unknown };
  const key = typeof b.key === "string" ? b.key.slice(0, 80) : "";
  const reason = reasonOf(b.reason);
  const parts = Array.isArray(b.parts) ? [...new Set(b.parts.filter(isPart))] : [];
  if (!reason) return json({ error: "Give a reason: it goes in the log." }, 400);
  if (parts.length === 0) return json({ error: "Tick at least one part to restore." }, 400);
  const row = await env.DB.prepare(`SELECT player_key FROM snapshots WHERE id = ? AND kind = 'player'`).bind(Number(b.snapshot)).first<{ player_key: string }>();
  if (!row || row.player_key !== key) return json({ error: "No such save state for this player" }, 404);
  const state = await loadState(env, Number(b.snapshot));
  if (!state) return json({ error: "Its file has gone (they're kept 90 days)." }, 410);
  const before = await capture(env, key);
  if (!before) return json({ error: "That player has gone." }, 404);
  if (b.confirm !== before.profile.name) return json({ error: `Type the player's name (${before.profile.name}) to confirm.` }, 400);
  const snapshot = await saveState(env, before, "before restore", who.email);
  const notes = await restore(env, state, parts, who.email);
  await adminLog(env, who.email, "restore", key, reason, { from: Number(b.snapshot), fromAt: state.at, snapshot, parts, notes });
  return json({ ok: true, snapshot, notes });
}

/** What a merge or a move logs, so Undo can reverse it. */
interface MoveDetail {
  snapshot: number;
  device: string;
  /** merge: the guest's save state, put back on undo. */
  guestSnapshot?: number;
  /** move-device: the account the device's history moved to. */
  into?: string;
}

const accountIdOf = (key: string) => (isAccountKey(key) ? key.slice(2) : null);
const HISTORY = ["daily_km", "pings", "votes"];

/**
 * Merges a guest into an account, exactly as if they'd signed in there (decision 18): the higher level of each
 * upgrade and the higher patch count, credits and km added, badges and crew credit combined, the device's km, pings
 * and votes attached. The guest's browser, if it's used again, starts as a fresh guest (they should sign in there).
 */
async function mergeRoute(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; into?: unknown; reason?: unknown; confirm?: unknown };
  const key = typeof b.key === "string" ? b.key.slice(0, 80) : "";
  const into = typeof b.into === "string" ? b.into.slice(0, 80) : "";
  const reason = reasonOf(b.reason);
  if (!reason) return json({ error: "Give a reason: it goes in the log." }, 400);
  if (isAccountKey(key)) return json({ error: "Only a guest can be merged into an account." }, 400);
  const accountId = accountIdOf(into);
  if (!accountId) return json({ error: "Pick the account to merge into." }, 400);
  const guest = await capture(env, key);
  if (!guest) return json({ error: "No such guest (it may be signed in already)." }, 404);
  if (b.confirm !== guest.profile.name) return json({ error: `Type the guest's name (${guest.profile.name}) to confirm.` }, 400);
  const acct = await capture(env, into);
  if (!acct) return json({ error: "No such account." }, 404);
  const guestSnapshot = await saveState(env, guest, `before merge into ${acct.profile.name}`, who.email);
  const snapshot = await saveState(env, acct, `before merge (guest ${guest.profile.name})`, who.email);
  const stub = probe(env);
  await stub.signIn(key, accountId); // the same merge as signing in; the guest's tabs reconnect as a fresh guest
  await stub.adminSetPlayer(into, {}); // the account's open tabs see it at once
  const detail: MoveDetail = { snapshot, device: key, guestSnapshot };
  await adminLog(env, who.email, "merge", into, reason, { ...detail, guest: guest.profile.name, parts: MERGE_PARTS });
  await adminLog(env, who.email, "merged-into", key, reason, { into, account: acct.profile.name });
  return json({ ok: true, snapshot, into });
}

/**
 * Moves one device's history (its km by day, pings and votes) from this account to another, and signs that device
 * out. Credits, upgrades, badges and crew credit stay: they belong to the account, not the device.
 */
async function moveRoute(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; device?: unknown; into?: unknown; reason?: unknown; confirm?: unknown };
  const key = typeof b.key === "string" ? b.key.slice(0, 80) : "";
  const into = typeof b.into === "string" ? b.into.slice(0, 80) : "";
  const device = typeof b.device === "string" ? b.device.slice(0, 80) : "";
  const reason = reasonOf(b.reason);
  if (!reason) return json({ error: "Give a reason: it goes in the log." }, 400);
  const from = accountIdOf(key);
  const to = accountIdOf(into);
  if (!from || !to) return json({ error: "Move a device from one account to another." }, 400);
  if (from === to) return json({ error: "That's the same account." }, 400);
  const db = env.DB;
  const dev = await db.prepare(`SELECT id FROM devices WHERE id = ? AND account_id = ?`).bind(device, from).first();
  if (!dev) return json({ error: "That device isn't signed in to this account." }, 404);
  const before = await capture(env, key); // also flushes the Probe's queue, so the history is all in D1
  const target = await capture(env, into);
  if (!before || !target) return json({ error: "No such account." }, 404);
  if (b.confirm !== before.profile.name) return json({ error: `Type the player's name (${before.profile.name}) to confirm.` }, 400);
  const snapshot = await saveState(env, before, `before moving a device to ${target.profile.name}`, who.email);
  await saveState(env, target, `before a device moved in from ${before.profile.name}`, who.email);
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE device_id = ?`).bind(device),
    db.prepare(`UPDATE devices SET account_id = NULL WHERE id = ?`).bind(device),
    ...HISTORY.map((t) => db.prepare(`UPDATE ${t} SET account_id = ? WHERE device_id = ? AND account_id = ?`).bind(to, device, from)),
  ]);
  const stub = probe(env);
  await stub.adminSetPlayer(key, {}); // the device's tabs reconnect, signed out
  await stub.adminSetPlayer(into, {});
  const detail: MoveDetail = { snapshot, device, into };
  await adminLog(env, who.email, "move-device", key, reason, { ...detail, to: target.profile.name });
  await adminLog(env, who.email, "device-moved-in", into, reason, { device, from: key, account: before.profile.name });
  return json({ ok: true, snapshot });
}

/** Undoes a merge (both players put back as they were, the device's history returned) or a move (the history moves back). */
async function undoMove(env: Env, who: AdminWho, logId: number, target: string, action: string, d: MoveDetail, reason: string, confirm: unknown): Promise<Response> {
  const now = await capture(env, target);
  if (!now) return json({ error: "That account has gone." }, 404);
  if (confirm !== now.profile.name) return json({ error: `Type the player's name (${now.profile.name}) to confirm.` }, 400);
  const db = env.DB;
  const acct = accountIdOf(target);
  if (!acct) return json({ error: "That change can't be undone from here." }, 400);
  const notes: string[] = [];
  if (action === "merge") {
    const [mine, guest] = await Promise.all([loadState(env, d.snapshot), d.guestSnapshot ? loadState(env, d.guestSnapshot) : null]);
    if (!mine || !guest) return json({ error: "A save state for this merge has gone (they're kept 90 days)." }, 410);
    const still = await db.prepare(`SELECT 1 FROM devices WHERE id = ? AND account_id IS NULL`).bind(d.device).first();
    if (!still) return json({ error: "That device is signed in to an account now, so it can't go back to being a guest." }, 409);
    const snapshot = await saveState(env, now, "before undo", who.email);
    await db.batch(HISTORY.map((t) => db.prepare(`UPDATE ${t} SET account_id = NULL WHERE device_id = ? AND account_id = ?`).bind(d.device, acct)));
    notes.push(...(await restore(env, mine, MERGE_PARTS, who.email)));
    notes.push(...(await restore(env, guest, MERGE_PARTS, who.email)));
    notes.push("Recruits the guest brought in stay with the account.");
    await adminLog(env, who.email, "undo", target, reason, { undid: logId, action, snapshot, notes });
    return json({ ok: true, snapshot, notes });
  }
  const to = accountIdOf(d.into ?? "");
  if (!to) return json({ error: "That move can't be undone from here." }, 400);
  const snapshot = await saveState(env, now, "before undo", who.email);
  await db.batch(HISTORY.map((t) => db.prepare(`UPDATE ${t} SET account_id = ? WHERE device_id = ? AND account_id = ?`).bind(acct, d.device, to)));
  const stub = probe(env);
  await stub.adminSetPlayer(target, {});
  await stub.adminSetPlayer(d.into!, {});
  notes.push("The device stays signed out: its player signs in again to use it.");
  await adminLog(env, who.email, "undo", target, reason, { undid: logId, action, snapshot, notes });
  return json({ ok: true, snapshot, notes });
}

/** Everything about one player, for a subject access request. */
async function exportRoute(env: Env, who: AdminWho, key: string): Promise<Response> {
  const state = await capture(env, key);
  if (!state) return json({ error: "No such player" }, 404);
  const db = env.DB;
  const account = isAccountKey(key);
  const id = account ? key.slice(2) : key;
  const col = account ? "account_id" : "device_id";
  const all = async (sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all()).results;
  const out = {
    exported: new Date().toISOString(),
    player: key,
    account: account ? await db.prepare(`SELECT id, email, name, name_chosen, country, country_changed_at, created_at, signup_source FROM accounts WHERE id = ?`).bind(id).first() : null,
    devices: account ? await all(`SELECT id, name, country, created_at, last_seen FROM devices WHERE account_id = ?`, id) : await all(`SELECT id, name, country, created_at, last_seen FROM devices WHERE id = ?`, id),
    progress: state.progress,
    badges: state.badges,
    legsCrewed: state.crew,
    kmByDay: await all(`SELECT day, device_id, km, tap_km, taps FROM daily_km WHERE ${col} = ? ORDER BY day`, id),
    pings: await all(`SELECT * FROM pings WHERE ${col} = ?`, id),
    votes: await all(`SELECT * FROM votes WHERE ${col} = ?`, id),
    crewLink: await all(`SELECT * FROM share_links WHERE player_key = ?`, key),
    recruits: await all(`SELECT device_id, moment, channel, arrived_at, status FROM recruits WHERE recruiter_key = ?`, key),
    feedback: account ? await all(`SELECT * FROM feedback WHERE account_id = ?`, id) : [],
    alerts: await all(`SELECT created_at FROM push_subscriptions WHERE ${col} = ?`, id).catch(() => []),
    nameHistory: await all(`SELECT at, old_name, new_name, changed_by FROM name_history WHERE player_key = ?`, key),
    adminNotes: await all(`SELECT at, admin, text FROM admin_notes WHERE player_key = ?`, key),
    adminLog: await all(`SELECT at, admin, action, reason FROM admin_log WHERE target = ?`, key),
  };
  await adminLog(env, who.email, "export", key, null, null);
  return json(out, 200, { "Content-Disposition": `attachment; filename="onesmallclick-${key.replace(/[^a-z0-9-]/gi, "_")}.json"` });
}

async function nameOffers(env: Env): Promise<Response> {
  const offers: string[] = [];
  for (let i = 0; offers.length < 3 && i < 20; i++) {
    const n = await freeName(env, generateName());
    if (!offers.includes(n)) offers.push(n);
  }
  return json({ offers });
}

/** The fixes' routes, or null for anything else. Fixes, undo and export are for the owner only. */
export async function fixesPanel(request: Request, env: Env, action: string, who: AdminWho): Promise<Response | null> {
  const owner = who.role === "owner";
  if (action === "name-offers" && request.method === "GET") return nameOffers(env);
  if (!["fix", "undo", "export", "save-state", "restore", "merge", "move", "daily-save"].includes(action)) return null;
  if (!owner) return json({ error: "Only the owner can do that." }, 403);
  if (action === "save-state" && request.method === "GET") return stateRoute(env, new URL(request.url));
  if (action === "restore" && request.method === "POST") return restoreRoute(request, env, who);
  if (action === "merge" && request.method === "POST") return mergeRoute(request, env, who);
  if (action === "move" && request.method === "POST") return moveRoute(request, env, who);
  if (action === "daily-save" && request.method === "POST") {
    const b = (await request.json().catch(() => ({}))) as { day?: unknown; force?: unknown };
    const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : undefined;
    const r = await dailySaveStates(env, { day, force: b.force === true });
    await adminLog(env, who.email, "daily-save", null, null, r);
    return json(r);
  }
  if (action === "fix" && request.method === "POST") return fixRoute(request, env, who);
  if (action === "undo" && request.method === "POST") return undoRoute(request, env, who);
  if (action === "export" && request.method === "GET") return exportRoute(env, who, (new URL(request.url).searchParams.get("key") ?? "").slice(0, 80));
  return null;
}
