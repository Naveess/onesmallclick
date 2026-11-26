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
  type AdminWho,
  type DayRow,
  type Fix,
  type PlayerState,
  type StatePart,
} from "../shared/admin";
import { adminLog } from "./admin";
import { freeName, removeAccount } from "./auth";

const KEEP_MS = 90 * 86_400_000;

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

function probe(env: Env) {
  return env.PROBE.get(env.PROBE.idFromName("mission"));
}

async function gzip(value: unknown): Promise<ArrayBuffer> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function gunzip<T>(body: ReadableStream): Promise<T> {
  return new Response(body.pipeThrough(new DecompressionStream("gzip"))).json<T>();
}

/** A player's save state as of now, or null if there's no such player. */
export async function capture(env: Env, key: string): Promise<PlayerState | null> {
  const db = env.DB;
  const account = isAccountKey(key);
  const id = account ? key.slice(2) : key;
  const profile = account
    ? await db
        .prepare(`SELECT name, name_chosen, country, country_changed_at FROM accounts WHERE id = ?`)
        .bind(id)
        .first<{ name: string; name_chosen: number; country: string | null; country_changed_at: number | null }>()
    : await db.prepare(`SELECT name, country FROM devices WHERE id = ? AND account_id IS NULL`).bind(id).first<{ name: string; country: string | null }>();
  if (!profile) return null;
  const live = await probe(env).adminCapture(key);
  const [badges, crew] = await db.batch([
    db.prepare(`SELECT badge, earned_at FROM badges WHERE player_key = ? ORDER BY earned_at`).bind(key),
    db.prepare(`SELECT mission_id, account_id, name, country, km, taps FROM mission_crew WHERE player_key = ? ORDER BY mission_id`).bind(key),
  ]);
  const p = profile as { name: string; name_chosen?: number; country: string | null; country_changed_at?: number | null };
  return {
    v: 1,
    key,
    at: Date.now(),
    kind: account ? "account" : "guest",
    profile: {
      name: p.name,
      nameChosen: account ? !!p.name_chosen : null,
      country: p.country,
      countryChangedAt: p.country_changed_at ?? null,
    },
    progress: live.progress,
    badges: (badges.results as { badge: string; earned_at: number }[]).map((b) => ({ badge: b.badge, at: b.earned_at })),
    crew: (crew.results as { mission_id: number; account_id: string | null; name: string | null; country: string | null; km: number; taps: number }[]).map((c) => ({
      missionId: c.mission_id,
      accountId: c.account_id,
      name: c.name,
      country: c.country,
      km: c.km,
      taps: c.taps,
    })),
    today: { day: live.day, rows: live.rows },
  };
}

/** Writes a save state to R2 and indexes it. Returns its id. */
export async function saveState(env: Env, state: PlayerState, reason: string, admin: string | null): Promise<number> {
  const file = `players/${state.key}/${state.at}-${crypto.randomUUID().slice(0, 8)}.json.gz`;
  const bytes = await gzip(state);
  await env.SNAPSHOTS.put(file, bytes, { httpMetadata: { contentType: "application/gzip" }, customMetadata: { reason } });
  const row = await env.DB.prepare(
    `INSERT INTO snapshots (kind, player_key, at, reason, admin, file, bytes) VALUES ('player', ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(state.key, state.at, reason.slice(0, 200), admin, file, bytes.byteLength)
    .first<{ id: number }>();
  // The files age out by the bucket's lifecycle rule; the index follows now and then.
  if (Math.random() < 0.05) await env.DB.prepare(`DELETE FROM snapshots WHERE kind = 'player' AND at < ?`).bind(Date.now() - KEEP_MS).run();
  return row!.id;
}

export async function loadState(env: Env, id: number): Promise<PlayerState | null> {
  const row = await env.DB.prepare(`SELECT file FROM snapshots WHERE id = ? AND kind = 'player'`).bind(id).first<{ file: string }>();
  if (!row) return null;
  const obj = await env.SNAPSHOTS.get(row.file);
  return obj ? gunzip<PlayerState>(obj.body) : null;
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
  if (!["fix", "undo", "export"].includes(action)) return null;
  if (!owner) return json({ error: "Only the owner can do that." }, 403);
  if (action === "fix" && request.method === "POST") return fixRoute(request, env, who);
  if (action === "undo" && request.method === "POST") return undoRoute(request, env, who);
  if (action === "export" && request.method === "GET") return exportRoute(env, who, (new URL(request.url).searchParams.get("key") ?? "").slice(0, 80));
  return null;
}
