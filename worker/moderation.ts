// Phase A2a (prompts 132-133): moderation. Decisions 36-40 and 45.
//
// D1 `moderation` is the record of every warning, time out, hide and ban. A player's standing is read from it when
// they connect (the Worker passes "paused until" to the Probe, which then credits nothing: no taps, no auto-thrust, no
// offline pay) and before a ping, a vote or a share. An account's time out or ban also covers the devices it had then
// (`moderation_devices`), so signing out doesn't escape it. A ban can also cover a network for up to 7 days: the
// network is taken the next time the banned player visits, as a fixed HMAC (`network_bans`), never the address.
//
//   GET  /api/admin/moderation       ?key= → ModerationView (their records, km removals, km per day)
//   POST /api/admin/moderate         { key, kind, days?, netDays?, reason, confirm? } → warn | timeout | hide | ban
//   POST /api/admin/moderation-lift  { id, reason } → lifts a time out, hide or ban (or withdraws a warning)
//   GET  /api/admin/remove-km        ?key=&day= → KmPreview
//   POST /api/admin/remove-km        { key, day, km, probeKm, reason, confirm, confirmProbe? } → off a day's boards (and the probe)
//   POST /api/admin/remove-km-undo   { logId, reason, confirm } → puts it back
//   POST /api/moderation/ack         { id } → the player tapped OK on a warning

import { utcDay } from "../shared/mission";
import { isAccountKey, type AdminWho, type DayRow } from "../shared/admin";
import {
  MOD_KEEP_MS,
  MOD_REASON_MAX,
  NET_BAN_MAX_DAYS,
  TAKE_OFF_PROBE_PHRASE,
  TIMEOUT_DAYS,
  isModKind,
  type Hold,
  type KmPreview,
  type KmRemoval,
  type ModItem,
  type ModerationView,
  type Standing,
} from "../shared/moderation";
import { adminLog } from "./admin";
import { readSession } from "./auth";
import { clearBoardCache } from "./boards";
import { banHash } from "./caps";
import { readDevice } from "./device";
import { gameSaveBefore } from "./gamesaves";
import { capture, saveState } from "./savestates";

const DAY_MS = 86_400_000;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function probe(env: Env) {
  return env.PROBE.get(env.PROBE.idFromName("mission"));
}

type ModRow = {
  id: number;
  player_key: string;
  kind: string;
  reason: string;
  at: number;
  until: number | null;
  net_days: number | null;
  admin: string;
  lifted_at: number | null;
  lifted_by: string | null;
  lift_reason: string | null;
  acked_at: number | null;
};

/** The records that apply to this browser: its account's, its device's, and those covering the device. */
const MATCH = `(player_key IN (?2, ?3) OR id IN (SELECT mod_id FROM moderation_devices WHERE device_id = ?3))`;

/** A player's standing now, and when their last time out or ban ended (so the Probe doesn't pay for that time). */
export async function standingFor(
  env: Env,
  request: Request,
  deviceId: string,
  accountId: string | null,
): Promise<{ standing: Standing; ended: number | null }> {
  const now = Date.now();
  const net = env.DEVICE_SECRET ? await banHash(request, env.DEVICE_SECRET) : "";
  const a = accountId ? `a:${accountId}` : "";
  const db = env.DB;
  const [direct, netBan, ended] = await db.batch([
    db.prepare(`SELECT * FROM moderation WHERE lifted_at IS NULL AND (until IS NULL OR until > ?1) AND ${MATCH} ORDER BY at`).bind(now, a, deviceId),
    db
      .prepare(
        `SELECT m.id, m.reason, m.at, nb.until FROM network_bans nb JOIN moderation m ON m.id = nb.mod_id
         WHERE nb.net_hash = ? AND nb.until > ? AND m.lifted_at IS NULL LIMIT 1`,
      )
      .bind(net, now),
    db
      .prepare(
        `SELECT MAX(CASE WHEN lifted_at IS NOT NULL AND (until IS NULL OR lifted_at < until) THEN lifted_at ELSE until END) AS ended
         FROM moderation WHERE kind IN ('timeout', 'ban') AND (lifted_at IS NOT NULL OR until <= ?1) AND ${MATCH}`,
      )
      .bind(now, a, deviceId),
  ]);
  const rows = direct.results as ModRow[];
  let hold: Hold | null = null;
  for (const r of rows) {
    if (r.kind !== "timeout" && r.kind !== "ban") continue;
    const h: Hold = { id: r.id, kind: r.kind, reason: r.reason, at: r.at, until: r.until };
    // A ban beats a time out; of two time outs, the later end.
    if (!hold || (h.kind === "ban" && hold.kind !== "ban") || (h.kind === hold.kind && hold.until !== null && (h.until === null || h.until > hold.until))) hold = h;
  }
  // A network ban: this browser is on a banned player's network (until the network's own end).
  const nb = (netBan.results as { id: number; reason: string; at: number; until: number }[])[0];
  if (!hold && nb) hold = { id: nb.id, kind: "ban", reason: nb.reason, at: nb.at, until: nb.until };
  // A ban that covers the network: take this network now (the first time it's seen; it ends net_days from then).
  for (const r of rows) {
    if (r.kind !== "ban" || !r.net_days || !net) continue;
    await db
      .prepare(`INSERT INTO network_bans (net_hash, mod_id, until) VALUES (?, ?, ?) ON CONFLICT (net_hash) DO NOTHING`)
      .bind(net, r.id, now + Math.min(NET_BAN_MAX_DAYS, r.net_days) * DAY_MS)
      .run();
  }
  const hide = rows.find((r) => r.kind === "hide");
  const banned = rows.find((r) => r.kind === "ban");
  const standing: Standing = {
    hold,
    hidden: hide ? { reason: hide.reason } : banned ? { reason: banned.reason } : null,
    warnings: rows
      .filter((r) => r.kind === "warn" && r.acked_at === null && (r.player_key === a || r.player_key === deviceId))
      .map((r) => ({ id: r.id, at: r.at, reason: r.reason })),
  };
  return { standing, ended: (ended.results[0] as { ended: number | null } | undefined)?.ended ?? null };
}

/** True while this browser is timed out or banned (pings, votes and shares are turned away). */
export async function heldNow(env: Env, request: Request, deviceId: string, accountId: string | null): Promise<boolean> {
  return (await standingFor(env, request, deviceId, accountId)).standing.hold !== null;
}

/** The SQL that leaves hidden and banned accounts off the boards: `a.id NOT IN (...)`, with `?` = now. */
export const HIDDEN_ACCOUNTS = `SELECT substr(player_key, 3) FROM moderation
  WHERE kind IN ('hide', 'ban') AND lifted_at IS NULL AND (until IS NULL OR until > ?) AND player_key LIKE 'a:%'`;

/** POST /api/moderation/ack { id }: the player tapped OK on a warning. */
export async function ackWarning(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false }, 403);
  const deviceId = env.DEVICE_SECRET ? await readDevice(request, env.DEVICE_SECRET) : null;
  if (!deviceId) return json({ ok: false }, 401);
  const signedIn = await readSession(request, env);
  const b = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (!Number.isInteger(b.id)) return json({ ok: false }, 400);
  await env.DB.prepare(`UPDATE moderation SET acked_at = ? WHERE id = ? AND kind = 'warn' AND acked_at IS NULL AND player_key IN (?, ?)`)
    .bind(Date.now(), b.id, signedIn ? `a:${signedIn.account.id}` : "", deviceId)
    .run();
  return json({ ok: true });
}

/** Decision 40: records older than a year go, unless they're an active ban or hide. Run daily (the 00:05 cron). */
export async function pruneModeration(env: Env): Promise<void> {
  const cut = Date.now() - MOD_KEEP_MS;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM network_bans WHERE until < ?`).bind(Date.now()),
    env.DB.prepare(
      `DELETE FROM moderation_devices WHERE mod_id IN (SELECT id FROM moderation WHERE at < ? AND NOT (kind IN ('ban', 'hide') AND lifted_at IS NULL))`,
    ).bind(cut),
    env.DB.prepare(`DELETE FROM moderation WHERE at < ? AND NOT (kind IN ('ban', 'hide') AND lifted_at IS NULL)`).bind(cut),
  ]);
}

// ---------- /admin ----------

class ModError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const text = (v: unknown, max = MOD_REASON_MAX) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The devices an account has now (a guest's key is its device). */
async function devicesOf(env: Env, key: string): Promise<string[]> {
  if (!isAccountKey(key)) return [key];
  const r = await env.DB.prepare(`SELECT id FROM devices WHERE account_id = ?`).bind(key.slice(2)).all<{ id: string }>();
  return r.results.map((d) => d.id);
}

/** Their open screens reconnect, so the Probe and the screen pick up the new standing (paid up to now first). */
async function reconnect(env: Env, key: string, extra: string[] = []) {
  const covered = await env.DB.prepare(`SELECT device_id FROM moderation_devices WHERE mod_id IN (SELECT id FROM moderation WHERE player_key = ?)`)
    .bind(key)
    .all<{ device_id: string }>();
  const devices = [...new Set([...(await devicesOf(env, key)), ...covered.results.map((d) => d.device_id), ...extra])];
  await probe(env).adminReconnect([key], devices);
  clearBoardCache();
}

function item(r: ModRow & { networks?: number }, now: number): ModItem {
  return {
    id: r.id,
    playerKey: r.player_key,
    kind: r.kind as ModItem["kind"],
    reason: r.reason,
    at: r.at,
    until: r.until,
    netDays: r.net_days,
    admin: r.admin,
    liftedAt: r.lifted_at,
    liftedBy: r.lifted_by,
    liftReason: r.lift_reason,
    ackedAt: r.acked_at,
    networks: r.networks ?? 0,
    active: r.lifted_at === null && (r.until === null || r.until > now) && (r.kind !== "warn" || r.acked_at === null),
  };
}

async function view(env: Env, key: string): Promise<ModerationView> {
  const now = Date.now();
  const db = env.DB;
  const account = isAccountKey(key);
  const id = account ? key.slice(2) : key;
  const [mods, removals, undos, days] = await db.batch([
    db.prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM network_bans nb WHERE nb.mod_id = m.id) AS networks FROM moderation m
       WHERE m.player_key = ? ORDER BY m.at DESC LIMIT 50`,
    ).bind(key),
    db.prepare(`SELECT id, at, admin, reason, detail FROM admin_log WHERE target = ? AND action = 'remove-km' ORDER BY at DESC LIMIT 20`).bind(key),
    db.prepare(`SELECT detail FROM admin_log WHERE target = ? AND action = 'remove-km-undo'`).bind(key),
    db.prepare(
      `SELECT day, SUM(km) AS km, SUM(tap_moved_km) AS moved FROM daily_km WHERE ${account ? "account_id = ?" : "device_id = ? AND account_id IS NULL"}
       AND day >= ? GROUP BY day ORDER BY day DESC`,
    ).bind(id, utcDay(now - 29 * DAY_MS)),
  ]);
  const undone = new Set(
    (undos.results as { detail: string | null }[]).map((u) => {
      try {
        return (JSON.parse(u.detail ?? "{}") as { logId?: number }).logId;
      } catch {
        return undefined;
      }
    }),
  );
  return {
    items: (mods.results as (ModRow & { networks: number })[]).map((r) => item(r, now)),
    removals: (removals.results as { id: number; at: number; admin: string; reason: string | null; detail: string | null }[]).map((l) => {
      let d: { day?: string; km?: number; probeKm?: number } = {};
      try {
        d = JSON.parse(l.detail ?? "{}");
      } catch {
        // keep empty
      }
      return { logId: l.id, at: l.at, admin: l.admin, reason: l.reason, day: d.day ?? "", km: d.km ?? 0, probeKm: d.probeKm ?? 0, undone: undone.has(l.id) } satisfies KmRemoval;
    }),
    days: (days.results as { day: string; km: number; moved: number }[]).map((d) => ({ day: d.day, km: d.km, tapMovedKm: d.moved })),
  };
}

async function moderate(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; kind?: unknown; days?: unknown; netDays?: unknown; reason?: unknown; confirm?: unknown };
  const key = typeof b.key === "string" ? b.key.slice(0, 80) : "";
  const reason = text(b.reason);
  if (!key || !isModKind(b.kind)) return json({ error: "key and kind" }, 400);
  if (reason.length < 3) return json({ error: "Write the reason: the player sees it." }, 400);
  const kind = b.kind;
  const days = Number(b.days);
  if (kind === "timeout" && !(TIMEOUT_DAYS as readonly number[]).includes(days)) return json({ error: `A time out is ${TIMEOUT_DAYS.join(", ")} days.` }, 400);
  const netDays = kind === "ban" && b.netDays !== undefined && b.netDays !== null && b.netDays !== 0 ? Number(b.netDays) : null;
  if (netDays !== null && !(Number.isInteger(netDays) && netDays >= 1 && netDays <= NET_BAN_MAX_DAYS)) {
    return json({ error: `A network ban is 1 to ${NET_BAN_MAX_DAYS} days.` }, 400);
  }
  const before = await capture(env, key);
  if (!before) return json({ error: "No such player" }, 404);
  if (kind === "ban" && b.confirm !== before.profile.name) return json({ error: `Type the player's name (${before.profile.name}) to confirm.` }, 400);
  // A time out or ban pauses their progress: a save state first, as for every change to it.
  const save = kind === "timeout" || kind === "ban" ? await saveState(env, before, `before ${kind}`, who.email) : null;
  const now = Date.now();
  const until = kind === "timeout" ? now + days * DAY_MS : null;
  const res = await env.DB.prepare(
    `INSERT INTO moderation (player_key, kind, reason, at, until, net_days, admin) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(key, kind, reason, now, until, netDays, who.email)
    .run();
  const id = res.meta.last_row_id;
  if ((kind === "timeout" || kind === "ban") && isAccountKey(key)) {
    const devices = await devicesOf(env, key);
    if (devices.length) {
      await env.DB.batch(devices.map((d) => env.DB.prepare(`INSERT OR IGNORE INTO moderation_devices (mod_id, device_id) VALUES (?, ?)`).bind(id, d)));
    }
  }
  await adminLog(env, who.email, `mod-${kind}`, key, reason, { id, days: kind === "timeout" ? days : undefined, netDays, saveState: save });
  await reconnect(env, key);
  return json({ ok: true, id, ...(await view(env, key)) });
}

async function lift(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; reason?: unknown };
  const reason = text(b.reason);
  if (!Number.isInteger(b.id)) return json({ error: "id" }, 400);
  if (reason.length < 3) return json({ error: "Give a reason: it goes in the log." }, 400);
  const row = await env.DB.prepare(`SELECT * FROM moderation WHERE id = ?`).bind(b.id).first<ModRow>();
  if (!row) return json({ error: "No such record" }, 404);
  if (row.lifted_at !== null) return json({ error: "Already lifted." }, 409);
  const covered = await env.DB.prepare(`SELECT device_id FROM moderation_devices WHERE mod_id = ?`).bind(row.id).all<{ device_id: string }>();
  await env.DB.batch([
    env.DB.prepare(`UPDATE moderation SET lifted_at = ?, lifted_by = ?, lift_reason = ? WHERE id = ?`).bind(Date.now(), who.email, reason, row.id),
    env.DB.prepare(`DELETE FROM network_bans WHERE mod_id = ?`).bind(row.id),
  ]);
  await adminLog(env, who.email, "mod-lift", row.player_key, reason, { id: row.id, kind: row.kind });
  await reconnect(env, row.player_key, covered.results.map((d) => d.device_id));
  return json({ ok: true, ...(await view(env, row.player_key)) });
}

async function preview(env: Env, key: string, day: string): Promise<KmPreview> {
  const rows = await probe(env).adminDayRows(key, day);
  const state = await probe(env).adminState();
  return {
    day,
    km: rows.reduce((s, r) => s + r.km, 0),
    tapMovedKm: rows.reduce((s, r) => s + r.tapMovedKm, 0),
    probeKm: state.probe.distanceKm,
  };
}

const dayOk = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Their rows scaled down so `take` km come off (taps stay: the clicks happened). */
function scaled(rows: DayRow[], take: number): DayRow[] {
  const total = rows.reduce((s, r) => s + r.km, 0);
  const f = total > 0 ? Math.max(0, (total - take) / total) : 1;
  return rows.map((r) => ({ ...r, km: r.km * f, tapKm: r.tapKm * f, tapMovedKm: r.tapMovedKm * f }));
}

async function removeKm(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as {
    key?: unknown;
    day?: unknown;
    km?: unknown;
    probeKm?: unknown;
    reason?: unknown;
    confirm?: unknown;
    confirmProbe?: unknown;
  };
  const key = typeof b.key === "string" ? b.key.slice(0, 80) : "";
  const reason = text(b.reason);
  if (!key || !dayOk(b.day)) return json({ error: "key and day" }, 400);
  if (reason.length < 3) return json({ error: "Give a reason: it goes in the log." }, 400);
  const before = await capture(env, key);
  if (!before) return json({ error: "No such player" }, 404);
  if (b.confirm !== before.profile.name) return json({ error: `Type the player's name (${before.profile.name}) to confirm.` }, 400);
  const stub = probe(env);
  const rows = await stub.adminDayRows(key, b.day);
  const total = rows.reduce((s, r) => s + r.km, 0);
  const km = b.km === undefined || b.km === null || b.km === "" ? total : Number(b.km);
  if (!Number.isFinite(km) || km <= 0 || km > total + 1e-6) return json({ error: `Km must be more than 0 and at most their ${Math.round(total)} km that day.` }, 400);
  const probeKm = b.probeKm === undefined || b.probeKm === null || b.probeKm === "" ? 0 : Number(b.probeKm);
  if (!Number.isFinite(probeKm) || probeKm < 0) return json({ error: "Km off the probe must be 0 or more." }, 400);
  if (probeKm > 0 && b.confirmProbe !== TAKE_OFF_PROBE_PHRASE) return json({ error: `Type ${TAKE_OFF_PROBE_PHRASE} to change everyone's trip.` }, 400);
  const save = await saveState(env, before, "before remove-km", who.email);
  await stub.adminSetPlayer(key, { day: { day: b.day, rows: scaled(rows, km) } });
  let taken = 0;
  if (probeKm > 0) {
    await gameSaveBefore(env, "remove-km", who.email);
    taken = await stub.adminTakeKm(probeKm);
  }
  await adminLog(env, who.email, "remove-km", key, reason, { day: b.day, km, probeKm: taken, rows, saveState: save });
  clearBoardCache();
  return json({ ok: true, ...(await view(env, key)) });
}

async function undoRemoval(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { logId?: unknown; reason?: unknown; confirm?: unknown };
  const reason = text(b.reason);
  if (reason.length < 3) return json({ error: "Give a reason: it goes in the log." }, 400);
  const row = await env.DB.prepare(`SELECT target, detail FROM admin_log WHERE id = ? AND action = 'remove-km'`).bind(Number(b.logId)).first<{ target: string; detail: string }>();
  if (!row) return json({ error: "No such removal" }, 404);
  const done = await env.DB.prepare(`SELECT 1 FROM admin_log WHERE action = 'remove-km-undo' AND target = ? AND json_extract(detail, '$.logId') = ?`)
    .bind(row.target, Number(b.logId))
    .first();
  if (done) return json({ error: "Already undone." }, 409);
  const d = JSON.parse(row.detail) as { day: string; km: number; probeKm: number; rows: DayRow[] };
  const before = await capture(env, row.target);
  if (!before) return json({ error: "No such player" }, 404);
  if (b.confirm !== before.profile.name) return json({ error: `Type the player's name (${before.profile.name}) to confirm.` }, 400);
  const save = await saveState(env, before, "before remove-km-undo", who.email);
  const stub = probe(env);
  // What was taken off each device goes back on top of what they have now (they may have pushed more since).
  const took = scaled(d.rows, d.km);
  const now = await stub.adminDayRows(row.target, d.day);
  const merged = new Map(now.map((r) => [r.deviceId, { ...r }]));
  d.rows.forEach((orig, i) => {
    const back = { km: orig.km - took[i].km, tapKm: orig.tapKm - took[i].tapKm, tapMovedKm: orig.tapMovedKm - took[i].tapMovedKm };
    const cur = merged.get(orig.deviceId);
    if (cur) merged.set(orig.deviceId, { ...cur, km: cur.km + back.km, tapKm: cur.tapKm + back.tapKm, tapMovedKm: cur.tapMovedKm + back.tapMovedKm });
    else merged.set(orig.deviceId, { ...orig, ...back, taps: 0 });
  });
  await stub.adminSetPlayer(row.target, { day: { day: d.day, rows: [...merged.values()] } });
  if (d.probeKm > 0) {
    await gameSaveBefore(env, "remove-km-undo", who.email);
    await stub.adminTakeKm(-d.probeKm);
  }
  await adminLog(env, who.email, "remove-km-undo", row.target, reason, { logId: Number(b.logId), saveState: save });
  clearBoardCache();
  return json({ ok: true, ...(await view(env, row.target)) });
}

/** The moderation routes, or null for anything else. Warn, time out, hide, ban and lift: owner or moderator. Km: owner. */
export async function moderationPanel(request: Request, env: Env, action: string, who: AdminWho): Promise<Response | null> {
  if (!["moderation", "moderate", "moderation-lift", "remove-km", "remove-km-undo"].includes(action)) return null;
  const url = new URL(request.url);
  try {
    if (action === "moderation" && request.method === "GET") return json(await view(env, (url.searchParams.get("key") ?? "").slice(0, 80)));
    if (action === "moderate" && request.method === "POST") return await moderate(request, env, who);
    if (action === "moderation-lift" && request.method === "POST") return await lift(request, env, who);
    if (who.role !== "owner") return json({ error: "Only the owner can do that." }, 403);
    if (action === "remove-km" && request.method === "GET") {
      const day = url.searchParams.get("day");
      if (!dayOk(day)) return json({ error: "day" }, 400);
      return json(await preview(env, (url.searchParams.get("key") ?? "").slice(0, 80), day));
    }
    if (action === "remove-km" && request.method === "POST") return await removeKm(request, env, who);
    if (action === "remove-km-undo" && request.method === "POST") return await undoRemoval(request, env, who);
  } catch (err) {
    if (err instanceof ModError) return json({ error: err.message }, err.status);
    throw err;
  }
  return null;
}
