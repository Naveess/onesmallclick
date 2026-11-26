// Phase A1b: player save states (decision 35). A1b-1 (prompt 124) wrote one file per save state; A1b-2 (prompt 127)
// adds group files: many players in one file (the daily save state, a leg's arrival), so a big crowd stays cheap.
//
// Every file is gzipped JSON in the R2 bucket onesmallclick-snapshots (binding SNAPSHOTS), under players/, which a
// lifecycle rule deletes after 90 days. D1 `snapshots` has one index row per player per save state (kind 'player'),
// so a player's page lists theirs whichever file they're in; a group file's rows all point at the same file.
//
//   players/<key>/<time>-<id>.json.gz      one player (before a fix, an undo, a restore, a merge, a prestige)
//   players/daily/<day>.json.gz            everyone who played that day (00:05 UTC the next day)
//   players/arrival/leg-<id>-<time>.json.gz everyone who crewed a leg, when it arrives
//
// This module imports nothing from the Worker's routes, so the Probe can use it too.

import { isAccountKey, type DayRow, type PlayerState, type ProgressState } from "../shared/admin";

const KEEP_MS = 90 * 86_400_000;
/** Keys per json_each() parameter (D1 caps a bound value's size). */
const CHUNK = 500;

/** A file with many players' save states in it. */
interface GroupFile {
  v: 1;
  kind: "group";
  at: number;
  reason: string;
  players: PlayerState[];
}

function probe(env: Env) {
  return env.PROBE.get(env.PROBE.idFromName("mission"));
}

export async function gzip(value: unknown): Promise<ArrayBuffer> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function gunzip<T>(body: ReadableStream): Promise<T> {
  return new Response(body.pipeThrough(new DecompressionStream("gzip"))).json<T>();
}

/** A player's save state as of now, or null if there's no such player. */
export async function capture(env: Env, key: string): Promise<PlayerState | null> {
  const live = await probe(env).adminCapture(key);
  const [state] = await buildStates(env, [key], { [key]: live.progress }, live.day, live.rows);
  return state ?? null;
}

/**
 * Save states for many players at once: their profile, badges and crew credit from D1, the progress given, and
 * their km and taps on `day` (all of that day's rows are read once, unless given). Players who don't exist are left out.
 */
export async function buildStates(
  env: Env,
  keys: string[],
  progress: Record<string, ProgressState | null>,
  day: string,
  dayRows?: DayRow[],
): Promise<PlayerState[]> {
  const db = env.DB;
  const accounts = keys.filter(isAccountKey).map((k) => k.slice(2));
  const guests = keys.filter((k) => !isAccountKey(k));
  type Prof = { id: string; name: string; name_chosen?: number; country: string | null; country_changed_at?: number | null };
  const profiles = new Map<string, Prof>();
  const badges = new Map<string, PlayerState["badges"]>();
  const crew = new Map<string, PlayerState["crew"]>();
  const chunks = (list: string[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => JSON.stringify(list.slice(i * CHUNK, (i + 1) * CHUNK)));
  const IN = `IN (SELECT value FROM json_each(?))`;
  for (const ids of chunks(accounts)) {
    const r = await db.prepare(`SELECT id, name, name_chosen, country, country_changed_at FROM accounts WHERE id ${IN}`).bind(ids).all<Prof>();
    for (const p of r.results) profiles.set(`a:${p.id}`, p);
  }
  for (const ids of chunks(guests)) {
    const r = await db.prepare(`SELECT id, name, country FROM devices WHERE account_id IS NULL AND id ${IN}`).bind(ids).all<Prof>();
    for (const p of r.results) profiles.set(p.id, p);
  }
  for (const ids of chunks(keys)) {
    const [b, c] = await db.batch([
      db.prepare(`SELECT player_key, badge, earned_at FROM badges WHERE player_key ${IN} ORDER BY earned_at`).bind(ids),
      db.prepare(`SELECT mission_id, player_key, account_id, name, country, km, taps FROM mission_crew WHERE player_key ${IN} ORDER BY mission_id`).bind(ids),
    ]);
    for (const r of b.results as { player_key: string; badge: string; earned_at: number }[]) {
      badges.set(r.player_key, [...(badges.get(r.player_key) ?? []), { badge: r.badge, at: r.earned_at }]);
    }
    for (const r of c.results as { mission_id: number; player_key: string; account_id: string | null; name: string | null; country: string | null; km: number; taps: number }[]) {
      crew.set(r.player_key, [
        ...(crew.get(r.player_key) ?? []),
        { missionId: r.mission_id, accountId: r.account_id, name: r.name, country: r.country, km: r.km, taps: r.taps },
      ]);
    }
  }
  const rows =
    dayRows ??
    (
      await db
        .prepare(`SELECT device_id, account_id, km, tap_km, tap_moved_km, taps FROM daily_km WHERE day = ?`)
        .bind(day)
        .all<{ device_id: string; account_id: string | null; km: number; tap_km: number; tap_moved_km: number; taps: number }>()
    ).results.map((r) => ({ deviceId: r.device_id, accountId: r.account_id, km: r.km, tapKm: r.tap_km, tapMovedKm: r.tap_moved_km, taps: r.taps }));
  const rowsOf = new Map<string, DayRow[]>();
  for (const r of rows) {
    const k = r.accountId ? `a:${r.accountId}` : r.deviceId;
    rowsOf.set(k, [...(rowsOf.get(k) ?? []), r]);
  }
  const at = Date.now();
  const out: PlayerState[] = [];
  for (const key of keys) {
    const p = profiles.get(key);
    if (!p) continue;
    const account = isAccountKey(key);
    out.push({
      v: 1,
      key,
      at,
      kind: account ? "account" : "guest",
      profile: {
        name: p.name,
        nameChosen: account ? !!p.name_chosen : null,
        country: p.country,
        countryChangedAt: p.country_changed_at ?? null,
      },
      progress: progress[key] ?? null,
      badges: badges.get(key) ?? [],
      crew: crew.get(key) ?? [],
      today: { day, rows: dayRows ? rows : (rowsOf.get(key) ?? []) },
    });
  }
  return out;
}

/** Indexes `keys` as being in `file`, a few hundred rows a statement. */
async function index(env: Env, keys: string[], at: number, reason: string, admin: string | null, file: string, bytes: number) {
  const db = env.DB;
  const stmts = [];
  for (let i = 0; i < keys.length; i += CHUNK) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO snapshots (kind, player_key, at, reason, admin, file, bytes)
           SELECT 'player', value, ?, ?, ?, ?, ? FROM json_each(?)`,
        )
        .bind(at, reason.slice(0, 200), admin, file, bytes, JSON.stringify(keys.slice(i, i + CHUNK))),
    );
  }
  if (stmts.length) await db.batch(stmts);
  // The files age out by the bucket's lifecycle rule; the index follows now and then.
  if (Math.random() < 0.05) await db.prepare(`DELETE FROM snapshots WHERE kind = 'player' AND at < ?`).bind(Date.now() - KEEP_MS).run();
}

/** Writes one player's save state to R2 and indexes it. Returns its id. */
export async function saveState(env: Env, state: PlayerState, reason: string, admin: string | null): Promise<number> {
  const file = `players/${state.key}/${state.at}-${crypto.randomUUID().slice(0, 8)}.json.gz`;
  const bytes = await gzip(state);
  await env.SNAPSHOTS.put(file, bytes, { httpMetadata: { contentType: "application/gzip" }, customMetadata: { reason } });
  const row = await env.DB.prepare(
    `INSERT INTO snapshots (kind, player_key, at, reason, admin, file, bytes) VALUES ('player', ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(state.key, state.at, reason.slice(0, 200), admin, file, bytes.byteLength)
    .first<{ id: number }>();
  if (Math.random() < 0.05) await env.DB.prepare(`DELETE FROM snapshots WHERE kind = 'player' AND at < ?`).bind(Date.now() - KEEP_MS).run();
  return row!.id;
}

/** Writes many players' save states as one file and indexes each of them. */
export async function saveGroup(env: Env, states: PlayerState[], file: string, reason: string, admin: string | null = null): Promise<number> {
  if (states.length === 0) return 0;
  const at = states[0].at;
  const body: GroupFile = { v: 1, kind: "group", at, reason, players: states };
  const bytes = await gzip(body);
  await env.SNAPSHOTS.put(file, bytes, { httpMetadata: { contentType: "application/gzip" }, customMetadata: { reason } });
  await index(
    env,
    states.map((s) => s.key),
    at,
    reason,
    admin,
    file,
    bytes.byteLength,
  );
  return states.length;
}

/** One player's save state by its index id (picked out of a group file if it's in one). */
export async function loadState(env: Env, id: number): Promise<PlayerState | null> {
  const row = await env.DB.prepare(`SELECT file, player_key FROM snapshots WHERE id = ? AND kind = 'player'`).bind(id).first<{ file: string; player_key: string }>();
  if (!row) return null;
  const obj = await env.SNAPSHOTS.get(row.file);
  if (!obj) return null;
  const data = await gunzip<PlayerState | GroupFile>(obj.body);
  if ("players" in data) return data.players.find((p) => p.key === row.player_key) ?? null;
  return data;
}

/**
 * The daily save state: everyone who played on `day` (by the probe's clock; yesterday unless given), in one file.
 * Run by the Worker's cron at 00:05 UTC, or from /admin. Skipped if that day's file exists, unless `force`.
 */
export async function dailySaveStates(env: Env, opts: { day?: string; force?: boolean } = {}): Promise<{ day: string; players: number; skipped?: boolean }> {
  const stub = probe(env);
  const day = opts.day ?? new Date((await stub.adminClock()) - 86_400_000).toISOString().slice(0, 10);
  const file = `players/daily/${day}.json.gz`;
  if (!opts.force && (await env.SNAPSHOTS.head(file))) return { day, players: 0, skipped: true };
  const keys = (
    await env.DB.prepare(
      `SELECT DISTINCT CASE WHEN account_id IS NOT NULL THEN 'a:' || account_id ELSE device_id END AS k FROM daily_km WHERE day = ?`,
    )
      .bind(day)
      .all<{ k: string }>()
  ).results.map((r) => r.k);
  if (keys.length === 0) return { day, players: 0 };
  const { progress } = await stub.adminProgressMany(keys, true);
  const states = await buildStates(env, keys, progress, day);
  if (opts.force) await env.DB.prepare(`DELETE FROM snapshots WHERE file = ?`).bind(file).run();
  return { day, players: await saveGroup(env, states, file, `daily (${day})`) };
}
