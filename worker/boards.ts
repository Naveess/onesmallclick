// Phase 8b: the leaderboards (1g) and the profile (1j).
//
//   GET /api/leaderboard?board=players|countries  → BoardResult (km pushed today, UTC)
//   GET /api/profile                              → ProfileInfo (this browser's player)
//
// Both read D1's daily_km, which the Probe fills every 30 seconds. "Today" is the probe's UTC day.
// The top of each board is worked out at most once a minute per Worker instance and reused;
// your own row is looked up for each request.

import { BURN_TARGET_KM } from "../shared/burn";
import type { PlayersReport } from "../shared/nudges";
import { BOARD_TOP, type Board, type BoardResult, type BoardRow, type CreditsInfo, type ProfileInfo, type TourInfo } from "../shared/boards";
import { readSession } from "./auth";
import { readDevice } from "./device";
import { HIDDEN_ACCOUNTS } from "./moderation";
import { medalFor, type Medal } from "../shared/medals";

const DAY_MS = 86_400_000;
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; rows: BoardRow[] }>();

/** Phase A2a: someone was hidden, banned, lifted or had km removed: the boards are worked out again next time. */
export function clearBoardCache() {
  cache.clear();
}

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
       WHERE d.day = ? AND a.id NOT IN (${HIDDEN_ACCOUNTS}) GROUP BY a.id HAVING km > 0 ORDER BY km DESC, a.name LIMIT ?`,
    )
      .bind(day, Date.now(), BOARD_TOP)
      .all<{ name: string; cc: string | null; km: number }>();
    rows = res.results.map((r, i) => ({ rank: i + 1, cc: r.cc, name: r.name, km: r.km }));
  } else {
    // Signed-in crew only (Nav, prompt 91: it promotes signing up), each for their account's country.
    const res = await env.DB.prepare(
      `SELECT a.country AS cc, SUM(d.km) AS km FROM daily_km d JOIN accounts a ON a.id = d.account_id
       WHERE d.day = ? AND a.id NOT IN (${HIDDEN_ACCOUNTS}) GROUP BY cc HAVING cc IS NOT NULL AND km > 0 ORDER BY km DESC, cc`,
    )
      .bind(day, Date.now())
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
  let ghostRank: number | null = null;

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
      // A guest isn't on the Players board; their row says how to get on it, and where they'd be (phase G1).
      const mine = await env.DB.prepare(`SELECT COALESCE(SUM(km), 0) AS km FROM daily_km WHERE day = ? AND device_id = ?`)
        .bind(day, asking.deviceId)
        .first<{ km: number }>();
      const km = mine?.km ?? 0;
      me = { rank: null, cc, name: device?.name ?? "", km };
      if (km > 0) {
        const above = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM (SELECT SUM(km) AS s FROM daily_km WHERE day = ? AND account_id IS NOT NULL
             GROUP BY account_id HAVING s > ?)`,
        )
          .bind(day, km)
          .first<{ n: number }>();
        ghostRank = (above?.n ?? 0) + 1;
      }
    }
  }

  const body: BoardResult = {
    board,
    day,
    rows: board === "players" ? all : all.slice(0, BOARD_TOP),
    me,
    signedIn: asking?.account != null,
    ghostRank,
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

  // Your recruits (phase S2) and the km they've pushed (on the device that came through your link).
  const key = acct ? `a:${acct.id}` : asking.deviceId;
  const [recruitCount, recruitKm] = await db.batch<{ n?: number; km?: number }>([
    db.prepare(`SELECT COUNT(*) AS n FROM recruits WHERE recruiter_key = ? AND status = 'recruit'`).bind(key),
    db
      .prepare(
        `SELECT COALESCE(SUM(km), 0) AS km FROM daily_km
         WHERE device_id IN (SELECT device_id FROM recruits WHERE recruiter_key = ? AND status = 'recruit')`,
      )
      .bind(key),
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
    recruits: recruitCount.results[0]?.n ?? 0,
    recruitKm: Math.round(recruitKm.results[0]?.km ?? 0),
  };
  return json(body);
}

/**
 * E1, the campaign map: every leg the crew has arrived at this tour (since the latest Earth → Mars start, which
 * the launch reset makes), oldest first, with its medal and whether you helped on it (your passport stamp, E4b).
 */
export async function tour(request: Request, env: Env): Promise<Response> {
  const asking = await whoIsAsking(request, env);
  const key = asking ? (asking.account ? `a:${asking.account.id}` : asking.deviceId) : null;
  const db = env.DB;
  const [legs, mine] = await db.batch<{
    id?: number;
    stop?: string | null;
    from_stop?: string | null;
    started_at?: number;
    arrived_at?: number;
    branch?: string | null;
    medal?: string | null;
    mission_id?: number;
  }>([
    db.prepare(
      `SELECT id, stop, from_stop, started_at, arrived_at, branch, medal FROM missions
       WHERE arrived_at IS NOT NULL AND id >= (SELECT MAX(id) FROM missions WHERE stop IS NULL OR stop = 'mars') ORDER BY id`,
    ),
    db.prepare(`SELECT mission_id FROM mission_crew WHERE player_key = ?`).bind(key ?? ""),
  ]);
  const helped = new Set(mine.results.map((r) => r.mission_id));
  const body: TourInfo = {
    legs: legs.results.map((r) => ({
      missionId: r.id!,
      stop: r.stop ?? "mars",
      fromStop: r.from_stop ?? "earth",
      startedAt: r.started_at!,
      arrivedAt: r.arrived_at!,
      branch: r.branch ?? null,
      helped: helped.has(r.id),
      medal: (r.medal as Medal | null) ?? medalFor((r.arrived_at! - r.started_at!) / DAY_MS),
    })),
  };
  return Response.json(body, { headers: { "Cache-Control": "private, max-age=60" } });
}

/** The credits for one arrived leg. They never change after arrival, so browsers may keep them a while. */
export async function credits(env: Env, url: URL): Promise<Response> {
  const id = Number(url.searchParams.get("mission"));
  if (!Number.isInteger(id) || id < 1) return json({ error: "mission must be a mission id" }, 400);
  const m = await env.DB.prepare(
    `SELECT id, stop, from_stop, started_at, arrived_at, crew_count, taps, medal, burn_km, burn_target, burn_ok, burn_spare_ms
       FROM missions WHERE id = ? AND arrived_at IS NOT NULL`,
  )
    .bind(id)
    .first<{
      id: number;
      stop: string | null;
      from_stop: string | null;
      started_at: number;
      arrived_at: number;
      crew_count: number | null;
      taps: number | null;
      medal: string | null;
      burn_km: number | null;
      burn_target: number | null;
      burn_ok: number | null;
      burn_spare_ms: number | null;
    }>();
  if (!m) return json({ error: "No arrival for that mission yet" }, 404);
  const named = await env.DB.prepare(
    `SELECT name, country AS cc, km FROM mission_crew WHERE mission_id = ? AND account_id IS NOT NULL ORDER BY km DESC, name`,
  )
    .bind(id)
    .all<{ name: string | null; cc: string | null; km: number }>();
  const names = named.results.map((r) => ({ name: r.name ?? "crew", cc: r.cc, km: r.km }));
  const crew = m.crew_count ?? names.length;
  const body: CreditsInfo = {
    missionId: m.id,
    stop: m.stop ?? "mars",
    fromStop: m.from_stop ?? "earth",
    startedAt: m.started_at,
    arrivedAt: m.arrived_at,
    crew,
    taps: m.taps ?? 0,
    names,
    guests: Math.max(0, crew - names.length),
    medal: (m.medal as Medal | null) ?? medalFor((m.arrived_at - m.started_at) / DAY_MS),
    // The landing burn (E4b part 2b); legs before it had none.
    burn:
      m.burn_km === null || m.burn_ok === null
        ? null
        : { km: m.burn_km, target: m.burn_target ?? BURN_TARGET_KM, ok: m.burn_ok === 1, spareMs: m.burn_spare_ms },
  };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}

/** /admin (prompts 82-83): every account with the Early Beta badge, oldest first, and how many accounts there are. */
export async function betaReport(env: Env) {
  const db = env.DB;
  const [rows, all] = await db.batch<{ name?: string; country?: string | null; at?: number; n?: number }>([
    db.prepare(
      `SELECT a.name, a.country, b.earned_at AS at FROM badges b JOIN accounts a ON b.player_key = 'a:' || a.id
       WHERE b.badge = 'early-beta' ORDER BY b.earned_at`,
    ),
    db.prepare(`SELECT COUNT(*) AS n FROM accounts`),
  ]);
  return {
    accounts: all.results[0]?.n ?? 0,
    players: rows.results.map((r) => ({ name: r.name!, country: r.country ?? null, at: r.at! })),
  };
}

/** /admin's Players card (phase G1): counts only, never emails or device ids. */
export async function playersReport(env: Env): Promise<PlayersReport> {
  const db = env.DB;
  const now = Date.now();
  const dayAgo = now - DAY_MS;
  const weekAgo = now - 7 * DAY_MS;
  const today = new Date(now).toISOString().slice(0, 10);
  const from14 = new Date(now - 13 * DAY_MS).toISOString().slice(0, 10);
  const r = await db.batch<Record<string, number | string | null>>([
    db.prepare(`SELECT COUNT(*) AS total, SUM(created_at > ?) AS day, SUM(created_at > ?) AS week FROM accounts`).bind(dayAgo, weekAgo),
    db.prepare(`SELECT COUNT(*) AS total, SUM(created_at > ?) AS newDay, SUM(last_seen > ?) AS activeDay FROM devices`).bind(dayAgo, dayAgo),
    db.prepare(
      `SELECT day, COUNT(DISTINCT COALESCE('a:' || account_id, device_id)) AS players FROM daily_km
       WHERE day >= ? AND taps > 0 GROUP BY day ORDER BY day`,
    ).bind(from14),
    db.prepare(`SELECT country AS cc, COUNT(*) AS n FROM devices WHERE created_at > ? GROUP BY country ORDER BY n DESC, cc LIMIT 20`).bind(dayAgo),
    db.prepare(`SELECT COALESCE(SUM(shares), 0) AS shares FROM share_counts WHERE day = ?`).bind(today),
    db.prepare(`SELECT COUNT(*) AS n FROM recruits WHERE status = 'recruit' AND converted_at >= ?`).bind(Date.parse(`${today}T00:00:00Z`)),
    db.prepare(`SELECT signup_source AS source, COUNT(*) AS n FROM accounts GROUP BY signup_source ORDER BY n DESC`),
    db.prepare(
      `SELECT COUNT(*) AS newPlayers, SUM(v.account_id IS NOT NULL) AS signedIn FROM devices v
       WHERE v.created_at > ? AND EXISTS (SELECT 1 FROM daily_km d WHERE d.device_id = v.id AND d.taps > 0)`,
    ).bind(weekAgo),
  ]);
  const one = (i: number) => r[i].results[0] ?? {};
  const n = (v: unknown) => Number(v ?? 0);
  return {
    accounts: { total: n(one(0).total), day: n(one(0).day), week: n(one(0).week) },
    devices: { total: n(one(1).total), newDay: n(one(1).newDay), activeDay: n(one(1).activeDay) },
    pushed: r[2].results.map((x) => ({ day: String(x.day), players: n(x.players) })),
    newByCountry: r[3].results.map((x) => ({ cc: (x.cc as string | null) ?? null, n: n(x.n) })),
    today: { shares: n(one(4).shares), recruits: n(one(5).n) },
    signups: r[6].results.map((x) => ({ source: (x.source as string | null) ?? null, n: n(x.n) })),
    conversion: { newPlayers: n(one(7).newPlayers), signedIn: n(one(7).signedIn) },
  };
}
