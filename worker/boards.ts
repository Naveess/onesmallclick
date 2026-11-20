// Phase 8b: the leaderboards (1g) and the profile (1j).
//
//   GET /api/leaderboard?board=players|countries  → BoardResult (km pushed today, UTC)
//   GET /api/profile                              → ProfileInfo (this browser's player)
//
// Both read D1's daily_km, which the Probe fills every 30 seconds. "Today" is the probe's UTC day.
// The top of each board is worked out at most once a minute per Worker instance and reused;
// your own row is looked up for each request.

import { BOARD_TOP, type Board, type BoardResult, type BoardRow, type ProfileInfo } from "../shared/boards";
import { readSession } from "./auth";
import { readDevice } from "./device";

const DAY_MS = 86_400_000;
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; rows: BoardRow[] }>();

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Who's asking: the device, and the account when signed in. */
async function whoIsAsking(request: Request, env: Env) {
  const deviceId = env.DEVICE_SECRET ? await readDevice(request, env.DEVICE_SECRET) : null;
  if (!deviceId) return null;
  const signedIn = await readSession(request, env);
  return { deviceId, account: signedIn?.account ?? null };
}

async function topRows(env: Env, board: Board, day: string): Promise<BoardRow[]> {
  const key = `${board}|${day}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  let rows: BoardRow[];
  if (board === "players") {
    // Signed-in players only (decided for 8): their km from every device, today.
    const res = await env.DB.prepare(
      `SELECT a.name AS name, a.country AS cc, SUM(d.km) AS km FROM daily_km d JOIN accounts a ON a.id = d.account_id
       WHERE d.day = ? GROUP BY a.id HAVING km > 0 ORDER BY km DESC, a.name LIMIT ?`,
    )
      .bind(day, BOARD_TOP)
      .all<{ name: string; cc: string | null; km: number }>();
    rows = res.results.map((r, i) => ({ rank: i + 1, cc: r.cc, name: r.name, km: r.km }));
  } else {
    // Everyone for now (prompt 38): an account counts for its country, a guest for its device's country.
    const res = await env.DB.prepare(
      `SELECT COALESCE(a.country, v.country) AS cc, SUM(d.km) AS km FROM daily_km d
       LEFT JOIN accounts a ON a.id = d.account_id LEFT JOIN devices v ON v.id = d.device_id
       WHERE d.day = ? GROUP BY cc HAVING cc IS NOT NULL AND km > 0 ORDER BY km DESC, cc`,
    )
      .bind(day)
      .all<{ cc: string; km: number }>();
    rows = res.results.map((r, i) => ({ rank: i + 1, cc: r.cc, name: r.cc, km: r.km }));
  }
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

export async function leaderboard(request: Request, env: Env, url: URL, day: string): Promise<Response> {
  const board: Board = url.searchParams.get("board") === "countries" ? "countries" : "players";
  const asking = await whoIsAsking(request, env);
  const all = await topRows(env, board, day);
  let me: BoardRow | null = null;

  if (asking) {
    const device = await env.DB.prepare(`SELECT name, country FROM devices WHERE id = ?`)
      .bind(asking.deviceId)
      .first<{ name: string; country: string | null }>();
    const acct = asking.account;
    const cc = acct?.country ?? device?.country ?? null;
    if (board === "countries") {
      const row = all.find((r) => r.cc === cc);
      me = row ?? (cc ? { rank: null, cc, name: cc, km: 0 } : null);
    } else if (acct) {
      const mine = await env.DB.prepare(`SELECT COALESCE(SUM(km), 0) AS km FROM daily_km WHERE day = ? AND account_id = ?`)
        .bind(day, acct.id)
        .first<{ km: number }>();
      const km = mine?.km ?? 0;
      let rank: number | null = null;
      if (km > 0) {
        const above = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM (SELECT SUM(km) AS s FROM daily_km WHERE day = ? AND account_id IS NOT NULL
             GROUP BY account_id HAVING s > ?)`,
        )
          .bind(day, km)
          .first<{ n: number }>();
        rank = (above?.n ?? 0) + 1;
      }
      me = { rank, cc, name: acct.name, km };
    } else {
      // A guest isn't on the Players board; their row says how to get on it.
      const mine = await env.DB.prepare(`SELECT COALESCE(SUM(km), 0) AS km FROM daily_km WHERE day = ? AND device_id = ?`)
        .bind(day, asking.deviceId)
        .first<{ km: number }>();
      me = { rank: null, cc, name: device?.name ?? "", km: mine?.km ?? 0 };
    }
  }

  const body: BoardResult = {
    board,
    day,
    rows: board === "players" ? all : all.slice(0, BOARD_TOP),
    me,
    signedIn: asking?.account != null,
  };
  return json(body);
}

/** The last 30 UTC days, oldest first, ending with `day`. */
function last30(day: string): string[] {
  const end = Date.parse(`${day}T00:00:00Z`);
  return Array.from({ length: 30 }, (_, i) => new Date(end - (29 - i) * DAY_MS).toISOString().slice(0, 10));
}

export async function profile(request: Request, env: Env, day: string): Promise<Response> {
  const asking = await whoIsAsking(request, env);
  if (!asking) return json({ error: "No device; call /api/session first" }, 401);
  const days = last30(day);
  const db = env.DB;
  const acct = asking.account;
  const device = await db
    .prepare(`SELECT name, country, created_at FROM devices WHERE id = ?`)
    .bind(asking.deviceId)
    .first<{ name: string; country: string | null; created_at: number }>();

  const [total, pings, joined] = acct
    ? await db.batch<{ km?: number; day?: string; t?: number | null }>([
        db.prepare(`SELECT COALESCE(SUM(km), 0) AS km FROM daily_km WHERE account_id = ?`).bind(acct.id),
        db.prepare(`SELECT DISTINCT day FROM pings WHERE account_id = ? AND day >= ?`).bind(acct.id, days[0]),
        db.prepare(`SELECT MIN(created_at) AS t FROM devices WHERE account_id = ? OR id = ?`).bind(acct.id, asking.deviceId),
      ])
    : await db.batch<{ km?: number; day?: string; t?: number | null }>([
        db.prepare(`SELECT COALESCE(SUM(km), 0) AS km FROM daily_km WHERE device_id = ?`).bind(asking.deviceId),
        db.prepare(`SELECT DISTINCT day FROM pings WHERE device_id = ? AND day >= ?`).bind(asking.deviceId, days[0]),
        db.prepare(`SELECT created_at AS t FROM devices WHERE id = ?`).bind(asking.deviceId),
      ]);

  const firstSeen = joined.results[0]?.t ?? Date.now();
  const body: ProfileInfo = {
    name: acct?.name ?? device?.name ?? "",
    country: acct?.country ?? device?.country ?? null,
    joinedAt: acct ? Math.min(acct.created_at, firstSeen) : firstSeen,
    totalKm: total.results[0]?.km ?? 0,
    pingDays: pings.results.map((r) => r.day!).filter((d) => d <= day),
    days,
    signedIn: acct !== null,
  };
  return json(body);
}
