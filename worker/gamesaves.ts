// Phase A1c-1 (prompt 129): the Save states tab. The game's save states (worker/savestates.ts saveGame: hourly,
// daily, before every Game-tab control, and when a new version starts), the group files of player save states,
// comparing a game save state with now, and restoring the probe from one (owner; typed phrase; a save state first,
// so it can be undone by restoring that one).
//
//   GET  /api/admin/game-states             → GameStatesList
//   GET  /api/admin/game-state?id=          → { snapshot, then, now }
//   POST /api/admin/game-save   { reason? } → take one now
//   POST /api/admin/game-restore { snapshot, reason, confirm } → put the probe back (players untouched)
//   POST /api/admin/probe-rewind { minutesAgo | bookmark, reason, confirm } → phase A1c-2: the Probe's whole storage
//        (the game AND everyone's progress) back to a minute in the last 30 days, with Cloudflare's point-in-time
//        recovery. The log keeps the bookmark that undoes it. docs/runbook.md says when (rarely) and what to do with D1.

import { ADMIN_TEXT_MAX, GAME_RESTORE_PHRASE, PROBE_REWIND_MAX_MIN, PROBE_REWIND_PHRASE, type AdminLogItem, type AdminWho, type GameStatesList, type SnapshotItem } from "../shared/admin";
import { adminLog } from "./admin";
import { gameSaveNow, loadGame } from "./savestates";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function probe(env: Env) {
  return env.PROBE.get(env.PROBE.idFromName("mission"));
}

const reasonOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, ADMIN_TEXT_MAX) : "");

/** The Game tab's test controls that change the game: each takes a game save state first (worker/index.ts). */
export const GAME_CONTROLS = new Set(["distance", "burn", "goal", "leg-start", "clock", "signal", "give", "close-vote", "reset", "launch-wipe", "maintenance"]);

/** A game save state before a Game-tab control. A failure is logged, never blocks the control. */
export async function gameSaveBefore(env: Env, action: string, admin: string): Promise<void> {
  try {
    await gameSaveNow(env, "before", `before ${action}`, admin);
  } catch (err) {
    console.error("game save state failed", err);
  }
}

async function list(env: Env): Promise<Response> {
  const db = env.DB;
  const [game, groups, restores, rewinds] = await db.batch([
    db.prepare(`SELECT id, at, reason, admin, bytes FROM snapshots WHERE kind = 'game' ORDER BY at DESC LIMIT 300`),
    db.prepare(
      `SELECT file, MAX(reason) AS reason, MAX(at) AS at, COUNT(*) AS players FROM snapshots
       WHERE kind = 'player' AND (file LIKE 'players/daily/%' OR file LIKE 'players/arrival/%') GROUP BY file ORDER BY at DESC LIMIT 120`,
    ),
    db.prepare(`SELECT * FROM admin_log WHERE action = 'game-restore' ORDER BY at DESC LIMIT 20`),
    db.prepare(`SELECT * FROM admin_log WHERE action = 'probe-rewind' ORDER BY at DESC LIMIT 20`),
  ]);
  return json({
    game: game.results as unknown as SnapshotItem[],
    groups: groups.results as GameStatesList["groups"],
    restores: restores.results as unknown as AdminLogItem[],
    rewinds: rewinds.results as unknown as AdminLogItem[],
  } satisfies GameStatesList);
}

async function compare(env: Env, id: number): Promise<Response> {
  const snapshot = await env.DB.prepare(`SELECT id, at, reason, admin, bytes FROM snapshots WHERE id = ? AND kind = 'game'`).bind(id).first<SnapshotItem>();
  if (!snapshot) return json({ error: "No such game save state" }, 404);
  const then = await loadGame(env, id);
  if (!then) return json({ error: "Its file has gone (hourly ones are kept 7 days, the rest 90)." }, 410);
  return json({ snapshot, then, now: await probe(env).adminGameDump() });
}

async function restore(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { snapshot?: unknown; reason?: unknown; confirm?: unknown };
  const reason = reasonOf(b.reason);
  if (!reason) return json({ error: "Give a reason: it goes in the log." }, 400);
  if (b.confirm !== GAME_RESTORE_PHRASE) return json({ error: `Type ${GAME_RESTORE_PHRASE} to confirm.` }, 400);
  const id = Number(b.snapshot);
  const dump = await loadGame(env, id);
  if (!dump) return json({ error: "No such game save state, or its file has gone." }, 404);
  const before = await gameSaveNow(env, "before", "before restore", who.email);
  await probe(env).adminGameRestore(dump);
  await adminLog(env, who.email, "game-restore", null, reason, { from: id, fromAt: dump.at, snapshot: before });
  return json({ ok: true, snapshot: before });
}

/**
 * Phase A1c-2: point-in-time recovery of the Probe (the last resort before D1 Time Travel; docs/runbook.md).
 * A game save state first, then the rewind; maintenance mode, if it was on, is switched back on afterwards (the
 * rewound storage may be from before it was).
 */
async function rewind(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { minutesAgo?: unknown; bookmark?: unknown; reason?: unknown; confirm?: unknown };
  const reason = reasonOf(b.reason);
  if (!reason) return json({ error: "Give a reason: it goes in the log." }, 400);
  if (b.confirm !== PROBE_REWIND_PHRASE) return json({ error: `Type ${PROBE_REWIND_PHRASE} to confirm.` }, 400);
  const bookmark = typeof b.bookmark === "string" && b.bookmark.length > 0 && b.bookmark.length < 512 ? b.bookmark : null;
  const minutes = Number(b.minutesAgo);
  if (!bookmark && !(Number.isFinite(minutes) && minutes >= 1 && minutes <= PROBE_REWIND_MAX_MIN)) {
    return json({ error: `Minutes ago must be between 1 and ${PROBE_REWIND_MAX_MIN} (30 days).` }, 400);
  }
  const to = bookmark ? null : Date.now() - Math.round(minutes * 60_000);
  let snapshot: number | null = null;
  try {
    snapshot = await gameSaveNow(env, "before", "before rewind", who.email);
  } catch (err) {
    console.error("game save state before rewind failed", err);
  }
  const frozen = await probe(env).maintenance();
  let done: { undo: string; bookmark: string };
  try {
    done = await probe(env).adminRewind(to, bookmark);
  } catch (err) {
    return json({ error: `The rewind didn't start: ${String(err).replace(/\.+$/, "")}. (It only works on Cloudflare, not in local dev.)` }, 500);
  }
  await adminLog(env, who.email, "probe-rewind", null, reason, { to, undoOf: bookmark ? true : undefined, bookmark: done.bookmark, undo: done.undo, snapshot });
  // The Probe restarts on the rewound storage; once it's up, maintenance goes back on if it was.
  if (frozen) {
    await new Promise((ok) => setTimeout(ok, 1000));
    try {
      await probe(env).adminMaintenance(true, frozen.message);
    } catch (err) {
      console.error("maintenance after rewind failed", err);
      return json({ ok: true, undo: done.undo, warning: "Rewound, but maintenance didn't switch back on: switch it on in the Game tab." });
    }
  }
  return json({ ok: true, undo: done.undo });
}

/** The Save states tab's routes, or null for anything else. Owner only. */
export async function gameSavesPanel(request: Request, env: Env, action: string, who: AdminWho): Promise<Response | null> {
  if (!["game-states", "game-state", "game-save", "game-restore", "probe-rewind"].includes(action)) return null;
  if (who.role !== "owner") return json({ error: "Only the owner can do that." }, 403);
  const url = new URL(request.url);
  if (action === "game-states" && request.method === "GET") return list(env);
  if (action === "game-state" && request.method === "GET") return compare(env, Number(url.searchParams.get("id")));
  if (action === "game-save" && request.method === "POST") {
    const b = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = reasonOf(b.reason) || "by hand";
    const id = await gameSaveNow(env, "before", reason, who.email);
    await adminLog(env, who.email, "game-save", null, reason, { snapshot: id });
    return json({ ok: true, snapshot: id });
  }
  if (action === "game-restore" && request.method === "POST") return restore(request, env, who);
  if (action === "probe-rewind" && request.method === "POST") return rewind(request, env, who);
  return null;
}
