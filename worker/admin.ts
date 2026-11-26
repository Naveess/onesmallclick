// Phase A1a (prompts 120): the admin panel's sign-in, its log, and the Players tab (search, lists, one player's page,
// notes). The older test controls stay in worker/index.ts's admin() and now sit behind the same sign-in.
//
// Sign-in (decision 34): the player must be signed in to the game with Google, as an email on the ADMIN_EMAILS
// allowlist (a secret, comma-separated), and type ADMIN_KEY. That makes a 12-hour admin session: a cookie scoped to
// /api/admin, SameSite=Strict, separate from the player's session. Locally (DEV_SIGN_IN_LINKS=1) the check scripts may
// still send ADMIN_KEY as a Bearer header, and an email-link account counts as Google. Failed sign-ins are logged and
// capped per network.
//
//   POST /api/admin/session     { key } → signs in (the player's own session must be an allowed account)
//   POST /api/admin/signout
//   GET  /api/admin/whoami      → AdminWho
//   GET  /api/admin/search      ?q= | ?list=newest|active|top|changed → PlayerRow[]
//   GET  /api/admin/player      ?key= → PlayerDetail
//   POST /api/admin/note        { key, text }
//   GET  /api/admin/log         ?target= → AdminLogItem[] (the latest 100)
//   Phase A1b: the fixes, undo, export and name offers are in worker/fixes.ts.

import { BADGE_INFO, type BadgeId } from "../shared/badges";
import { ADMIN_TEXT_MAX, isAccountKey, type AdminLogItem, type AdminRole, type AdminWho, type PlayerDetail, type PlayerList, type PlayerRow, type SnapshotItem } from "../shared/admin";
import { cookieValue, randomToken, readSession, sha256 } from "./auth";
import { capCheck, capCount } from "./caps";
import { fixesPanel } from "./fixes";
import { gameSavesPanel } from "./gamesaves";
import { moderationPanel } from "./moderation";

const ADMIN_COOKIE = "osc_admin";
const ADMIN_TTL_MS = 12 * 3_600_000;
const LOG_KEEP_MS = 365 * 24 * 3_600_000;
const DAY_MS = 86_400_000;

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
const enc = new TextEncoder();
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function keyMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const allowed = (env: Env) =>
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const local = (env: Env) => env.DEV_SIGN_IN_LINKS === "1";

/** Writes one line in the admin log (and now and then clears lines over a year old). Never fails the action. */
export async function adminLog(env: Env, admin: string, action: string, target: string | null, reason: string | null, detail: unknown) {
  try {
    await env.DB.prepare(`INSERT INTO admin_log (at, admin, action, target, reason, detail) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(Date.now(), admin, action, target, reason, detail === undefined || detail === null ? null : JSON.stringify(detail).slice(0, 8000))
      .run();
    if (Math.random() < 0.02) await env.DB.prepare(`DELETE FROM admin_log WHERE at < ?`).bind(Date.now() - LOG_KEEP_MS).run();
  } catch (err) {
    console.error(JSON.stringify({ event: "admin-log-failed", error: String(err) }));
  }
}

/** Who's calling, or null. The admin session cookie; locally, the Bearer key too (the check scripts). */
export async function adminWho(request: Request, env: Env): Promise<AdminWho | null> {
  if (local(env) && env.ADMIN_KEY) {
    const given = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (given && (await keyMatches(given, env.ADMIN_KEY))) return { email: "key", role: "owner", expiresAt: Date.now() + ADMIN_TTL_MS };
  }
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(`SELECT email, role, expires_at FROM admin_sessions WHERE id_hash = ? AND expires_at > ?`)
    .bind(await sha256(token), Date.now())
    .first<{ email: string; role: AdminRole; expires_at: number }>();
  if (!row) return null;
  // Taken off the allowlist: the session stops working at once.
  if (!local(env) && !allowed(env).includes(row.email)) return null;
  return { email: row.email, role: row.role, expiresAt: row.expires_at };
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || new URL(origin).host === new URL(request.url).host;
}

/** POST /api/admin/session: the game's signed-in Google account must be on the allowlist, and the key must match. */
async function signIn(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: "Wrong origin" }, 403);
  if (!env.ADMIN_KEY) return json({ error: "ADMIN_KEY is not set" }, 503);
  const ticket = await capCheck(request, env, "admin");
  if (!ticket) return json({ error: "Too many failed admin sign-ins from this network today." }, 429);
  const fail = async (why: string, who: string, msg: string) => {
    await capCount(env, ticket); // only failures count toward the cap
    await adminLog(env, who, "sign-in-failed", null, why, null);
    return json({ error: msg }, 401);
  };
  const body = (await request.json().catch(() => ({}))) as { key?: unknown };
  const s = await readSession(request, env);
  if (!s) return fail("not signed in to the game", "unknown", "Sign in to the game with your Google account first.");
  const email = (s.account.email ?? "").toLowerCase();
  if (!email || !allowed(env).includes(email)) return fail("account not on the allowlist", email || `a:${s.account.id}`, "This account isn't an admin.");
  if (!s.account.google_sub && !local(env)) return fail("not signed in with Google", email, "Sign in to the game with Google (not an email link) to use the panel.");
  if (typeof body.key !== "string" || !(await keyMatches(body.key, env.ADMIN_KEY))) return fail("wrong key", email, "Wrong key.");

  const token = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO admin_sessions (id_hash, account_id, email, role, created_at, expires_at) VALUES (?, ?, ?, 'owner', ?, ?)`).bind(
      await sha256(token),
      s.account.id,
      email,
      now,
      now + ADMIN_TTL_MS,
    ),
    env.DB.prepare(`DELETE FROM admin_sessions WHERE expires_at < ?`).bind(now),
  ]);
  await adminLog(env, email, "sign-in", null, null, null);
  const who: AdminWho = { email, role: "owner", expiresAt: now + ADMIN_TTL_MS };
  return json(who, 200, {
    "Set-Cookie": `${ADMIN_COOKIE}=${token}; Path=/api/admin; Max-Age=${ADMIN_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function signOut(request: Request, env: Env): Promise<Response> {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (token) await env.DB.prepare(`DELETE FROM admin_sessions WHERE id_hash = ?`).bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": `${ADMIN_COOKIE}=; Path=/api/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
}

// ---------- The Players tab ----------

interface RawRow {
  key: string;
  kind: "account" | "guest";
  name: string;
  country: string | null;
  email: string | null;
  google: number;
  created_at: number;
  last_seen: number | null;
}

// One player per row: accounts (their devices' last visit) and guest devices (no account).
const PLAYERS_SQL = `
  SELECT 'a:' || a.id AS key, 'account' AS kind, a.name, a.country, a.email, (a.google_sub IS NOT NULL) AS google, a.created_at,
         (SELECT MAX(last_seen) FROM devices d WHERE d.account_id = a.id) AS last_seen
  FROM accounts a
  UNION ALL
  SELECT d.id AS key, 'guest' AS kind, d.name, d.country, NULL AS email, 0 AS google, d.created_at, d.last_seen
  FROM devices d WHERE d.account_id IS NULL`;

async function withToday(env: Env, rows: RawRow[]): Promise<PlayerRow[]> {
  if (rows.length === 0) return [];
  const day = utcDay(Date.now());
  const today = (
    await env.DB.prepare(
      `SELECT CASE WHEN account_id IS NOT NULL THEN 'a:' || account_id ELSE device_id END AS key, SUM(km) AS km, SUM(taps) AS taps
       FROM daily_km WHERE day = ? GROUP BY key`,
    )
      .bind(day)
      .all<{ key: string; km: number; taps: number }>()
  ).results;
  const by = new Map(today.map((t) => [t.key, t]));
  return rows.map((r) => ({
    key: r.key,
    kind: r.kind,
    name: r.name,
    country: r.country,
    email: r.email,
    google: !!r.google,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
    kmToday: by.get(r.key)?.km ?? 0,
    tapsToday: by.get(r.key)?.taps ?? 0,
  }));
}

async function search(env: Env, url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const list = url.searchParams.get("list") as PlayerList | null;
  const db = env.DB;
  let rows: RawRow[] = [];
  if (q) {
    const lower = q.toLowerCase();
    const code = await db.prepare(`SELECT player_key FROM share_links WHERE code = ?`).bind(lower.replace(/^.*\/c\//, "")).first<{ player_key: string }>();
    const keys = new Set<string>();
    if (code) keys.add(code.player_key);
    const exact = lower.replace(/^a:/, "");
    const acc = await db.prepare(`SELECT id FROM accounts WHERE id = ?`).bind(exact).first<{ id: string }>();
    if (acc) keys.add(`a:${acc.id}`);
    const dev = await db.prepare(`SELECT id, account_id FROM devices WHERE id = ?`).bind(q).first<{ id: string; account_id: string | null }>();
    if (dev) keys.add(dev.account_id ? `a:${dev.account_id}` : dev.id);
    // Names have underscores, which LIKE treats as "any character": escape them (and %, and the escape itself).
    const like = `%${lower.replace(/[!%_]/g, (c) => `!${c}`)}%`;
    const country = /^[a-z]{2}$/.test(lower) ? lower.toUpperCase() : null;
    rows = (
      await db
        .prepare(
          `SELECT * FROM (${PLAYERS_SQL}) WHERE lower(name) LIKE ? ESCAPE '!' OR lower(COALESCE(email, '')) LIKE ? ESCAPE '!' OR country = ? OR key IN (${[...keys].map(() => "?").join(",") || "''"})
           ORDER BY created_at DESC LIMIT 50`,
        )
        .bind(like, like, country ?? "", ...keys)
        .all<RawRow>()
    ).results;
  } else if (list === "newest") {
    rows = (await db.prepare(`SELECT * FROM (${PLAYERS_SQL}) ORDER BY created_at DESC LIMIT 50`).all<RawRow>()).results;
  } else if (list === "active" || list === "top") {
    const order = list === "active" ? "taps" : "km";
    const top = (
      await db
        .prepare(
          `SELECT CASE WHEN account_id IS NOT NULL THEN 'a:' || account_id ELSE device_id END AS key, SUM(km) AS km, SUM(taps) AS taps
           FROM daily_km WHERE day = ? GROUP BY key ORDER BY ${order} DESC LIMIT 50`,
        )
        .bind(utcDay(Date.now()))
        .all<{ key: string }>()
    ).results.map((r) => r.key);
    if (top.length > 0) {
      const found = (await db.prepare(`SELECT * FROM (${PLAYERS_SQL}) WHERE key IN (${top.map(() => "?").join(",")})`).bind(...top).all<RawRow>()).results;
      const at = new Map(top.map((k, i) => [k, i]));
      rows = found.sort((a, b) => (at.get(a.key) ?? 0) - (at.get(b.key) ?? 0));
    }
  } else if (list === "changed") {
    const keys = (
      await db.prepare(`SELECT target FROM admin_log WHERE target IS NOT NULL GROUP BY target ORDER BY MAX(at) DESC LIMIT 50`).all<{ target: string }>()
    ).results.map((r) => r.target);
    if (keys.length > 0) {
      const found = (await db.prepare(`SELECT * FROM (${PLAYERS_SQL}) WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all<RawRow>()).results;
      const at = new Map(keys.map((k, i) => [k, i]));
      rows = found.sort((a, b) => (at.get(a.key) ?? 0) - (at.get(b.key) ?? 0));
    }
  } else {
    return json({ error: "q or list" }, 400);
  }
  const out = await withToday(env, rows);
  if (list === "top") out.sort((a, b) => b.kmToday - a.kmToday);
  if (list === "active") out.sort((a, b) => b.tapsToday - a.tapsToday);
  return json(out);
}

async function player(env: Env, key: string): Promise<Response> {
  const db = env.DB;
  const account = isAccountKey(key);
  const id = account ? key.slice(2) : key;
  const acc = account
    ? await db.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(id).first<{
        id: string;
        email: string | null;
        google_sub: string | null;
        name: string;
        name_chosen: number;
        country: string | null;
        country_changed_at: number | null;
        created_at: number;
        signup_source: string | null;
      }>()
    : null;
  const guest = account ? null : await db.prepare(`SELECT * FROM devices WHERE id = ? AND account_id IS NULL`).bind(id).first<{ id: string; name: string; country: string | null; created_at: number; last_seen: number }>();
  if (!acc && !guest) return json({ error: "No such player" }, 404);

  // Whose rows: an account's are by account_id; a guest's by device_id.
  const col = account ? "account_id" : "device_id";
  const since = utcDay(Date.now() - 29 * DAY_MS);
  const [devices, sessions, progress, badges, legs, days, pings, totals, votes, code, recruits, push, feedback, log, notes, names, snaps, arrived] = await db.batch([
    account
      ? db.prepare(`SELECT id, name, country, created_at, last_seen FROM devices WHERE account_id = ? ORDER BY last_seen DESC`).bind(id)
      : db.prepare(`SELECT id, name, country, created_at, last_seen FROM devices WHERE id = ?`).bind(id),
    account
      ? db.prepare(`SELECT COUNT(*) AS n, MAX(created_at) AS last FROM sessions WHERE account_id = ? AND expires_at > ?`).bind(id, Date.now())
      : db.prepare(`SELECT 0 AS n, NULL AS last`),
    db.prepare(`SELECT * FROM progress WHERE device_id = ?`).bind(key),
    db.prepare(`SELECT badge, earned_at FROM badges WHERE player_key = ? ORDER BY earned_at`).bind(key),
    db.prepare(`SELECT c.mission_id, m.stop, m.medal, c.km, c.taps FROM mission_crew c LEFT JOIN missions m ON m.id = c.mission_id WHERE c.player_key = ? ORDER BY c.mission_id`).bind(key),
    db.prepare(`SELECT day, SUM(km) AS km, SUM(taps) AS taps FROM daily_km WHERE ${col} = ? AND day >= ? GROUP BY day ORDER BY day DESC`).bind(id, since),
    db.prepare(`SELECT DISTINCT day FROM pings WHERE ${col} = ? AND day >= ?`).bind(id, since),
    db.prepare(`SELECT COALESCE(SUM(km), 0) AS km, COALESCE(SUM(taps), 0) AS taps, (SELECT COUNT(*) FROM pings WHERE ${col} = ?) AS pings FROM daily_km WHERE ${col} = ?`).bind(id, id),
    db.prepare(`SELECT COUNT(*) AS n FROM votes WHERE ${col} = ?`).bind(id),
    db.prepare(`SELECT code FROM share_links WHERE player_key = ?`).bind(key),
    db.prepare(`SELECT COUNT(*) AS arrived, SUM(status = 'recruit') AS recruits FROM recruits WHERE recruiter_key = ?`).bind(key),
    db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE ${col} = ?`).bind(id),
    account ? db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE account_id = ?`).bind(id) : db.prepare(`SELECT 0 AS n`),
    db.prepare(`SELECT * FROM admin_log WHERE target = ? ORDER BY at DESC LIMIT 50`).bind(key),
    db.prepare(`SELECT id, at, admin, text FROM admin_notes WHERE player_key = ? ORDER BY at DESC LIMIT 50`).bind(key),
    // Phase A1b: name history, save states, and the legs crew credit can be given for.
    db.prepare(`SELECT at, old_name, new_name, changed_by FROM name_history WHERE player_key = ? ORDER BY at DESC LIMIT 50`).bind(key),
    db.prepare(`SELECT id, at, reason, admin, bytes FROM snapshots WHERE player_key = ? ORDER BY at DESC LIMIT 50`).bind(key),
    db.prepare(`SELECT id, stop FROM missions WHERE arrived_at IS NOT NULL ORDER BY id`),
  ]);
  type R<T> = { results: T[] };
  const devs = (devices as R<{ id: string; name: string; country: string | null; created_at: number; last_seen: number }>).results;
  // Who recruited them: any of their devices that came through a crew link.
  const devIds = devs.map((d) => d.id);
  const rec = devIds.length
    ? await db
        .prepare(`SELECT r.recruiter_key, r.moment, r.channel, r.arrived_at FROM recruits r WHERE r.device_id IN (${devIds.map(() => "?").join(",")}) ORDER BY r.arrived_at LIMIT 1`)
        .bind(...devIds)
        .first<{ recruiter_key: string; moment: string; channel: string; arrived_at: number }>()
    : null;
  let recruiterName: string | null = null;
  if (rec) {
    const r = isAccountKey(rec.recruiter_key)
      ? await db.prepare(`SELECT name FROM accounts WHERE id = ?`).bind(rec.recruiter_key.slice(2)).first<{ name: string }>()
      : await db.prepare(`SELECT name FROM devices WHERE id = ?`).bind(rec.recruiter_key).first<{ name: string }>();
    recruiterName = r?.name ?? null;
  }
  const saved = (progress as R<Record<string, number>>).results[0];
  // Phase A1b: the live numbers from the Probe (D1's copy can be a few minutes behind a fix); D1's copy if that fails.
  const live = await env.PROBE.get(env.PROBE.idFromName("mission"))
    .adminProgress(key)
    .catch(() => null);
  const prog = live
    ? { credits_milli: live.creditsMilli, ...live.levels, patches: live.patches, km_since_shift: live.kmSinceShift, updated_at: Date.now() }
    : saved;
  const pinged = new Set((pings as R<{ day: string }>).results.map((p) => p.day));
  const t = (totals as R<{ km: number; taps: number; pings: number }>).results[0];
  const s = (sessions as R<{ n: number; last: number | null }>).results[0];
  const rc = (recruits as R<{ arrived: number; recruits: number | null }>).results[0];
  const out: PlayerDetail = {
    key,
    kind: account ? "account" : "guest",
    profile: {
      name: acc?.name ?? guest!.name,
      nameChosen: acc ? !!acc.name_chosen : null,
      country: acc?.country ?? guest!.country,
      countryChangedAt: acc?.country_changed_at ?? null,
      email: acc?.email ?? null,
      google: !!acc?.google_sub,
      createdAt: acc?.created_at ?? guest!.created_at,
      lastSeen: devs.reduce<number | null>((m, d) => Math.max(m ?? 0, d.last_seen), null),
      signupSource: acc?.signup_source ?? null,
      crewCode: (code as R<{ code: string }>).results[0]?.code ?? null,
      recruitedBy: rec ? { key: rec.recruiter_key, name: recruiterName, moment: rec.moment, channel: rec.channel, at: rec.arrived_at } : null,
      recruits: { arrived: rc?.arrived ?? 0, recruits: rc?.recruits ?? 0 },
      alerts: (push as R<{ n: number }>).results[0]?.n ?? 0,
    },
    progress: prog
      ? {
          credits: prog.credits_milli / 1000,
          levels: { cold: prog.cold, ion: prog.ion, sail: prog.sail, hands: prog.hands, chant: prog.chant },
          patches: prog.patches,
          kmSinceShift: prog.km_since_shift,
          savedAt: prog.updated_at,
        }
      : null,
    badges: (badges as R<{ badge: string; earned_at: number }>).results.map((b) => ({
      badge: b.badge,
      name: BADGE_INFO[b.badge as BadgeId]?.name ?? b.badge,
      at: b.earned_at,
    })),
    legs: (legs as R<{ mission_id: number; stop: string | null; medal: string | null; km: number; taps: number }>).results.map((l) => ({
      missionId: l.mission_id,
      stop: l.stop,
      medal: l.medal,
      km: l.km,
      taps: l.taps,
    })),
    days: (days as R<{ day: string; km: number; taps: number }>).results.map((d) => ({ day: d.day, km: d.km, taps: d.taps, pinged: pinged.has(d.day) })),
    totals: {
      km: t?.km ?? 0,
      taps: t?.taps ?? 0,
      pings: t?.pings ?? 0,
      votes: (votes as R<{ n: number }>).results[0]?.n ?? 0,
      feedback: (feedback as R<{ n: number }>).results[0]?.n ?? 0,
    },
    devices: devs.map((d) => ({ id: d.id, name: d.name, country: d.country, createdAt: d.created_at, lastSeen: d.last_seen })),
    sessions: { count: s?.n ?? 0, lastCreated: s?.last ?? null },
    log: (log as R<AdminLogItem>).results,
    notes: (notes as R<{ id: number; at: number; admin: string; text: string }>).results,
    nameHistory: (names as R<{ at: number; old_name: string | null; new_name: string; changed_by: string }>).results.map((n) => ({
      at: n.at,
      oldName: n.old_name,
      newName: n.new_name,
      by: n.changed_by,
    })),
    snapshots: (snaps as R<SnapshotItem>).results,
    arrivedLegs: (arrived as R<{ id: number; stop: string | null }>).results.map((m) => ({ missionId: m.id, stop: m.stop })),
  };
  return json(out);
}

async function addNote(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; text?: unknown };
  const key = typeof b.key === "string" ? b.key.slice(0, 80) : "";
  const text = typeof b.text === "string" ? b.text.trim().slice(0, ADMIN_TEXT_MAX) : "";
  if (!key || !text) return json({ error: "key and text" }, 400);
  await env.DB.prepare(`INSERT INTO admin_notes (player_key, at, admin, text) VALUES (?, ?, ?, ?)`).bind(key, Date.now(), who.email, text).run();
  await adminLog(env, who.email, "note", key, null, { text });
  return player(env, key);
}

/**
 * The panel's own routes. Returns null for the actions it doesn't handle (the test controls in worker/index.ts).
 * `who` is null when not signed in: only the sign-in routes answer then.
 */
export async function adminPanel(request: Request, env: Env, action: string, who: AdminWho | null): Promise<Response | null> {
  const url = new URL(request.url);
  if (action === "session" && request.method === "POST") return signIn(request, env);
  if (action === "signout" && request.method === "POST") return signOut(request, env);
  if (!who) return null;
  if (action === "whoami" && request.method === "GET") return json(who);
  if (action === "search" && request.method === "GET") return search(env, url);
  if (action === "player" && request.method === "GET") return player(env, (url.searchParams.get("key") ?? "").slice(0, 80));
  if (action === "note" && request.method === "POST") return addNote(request, env, who);
  const fixed = await fixesPanel(request, env, action, who); // phase A1b: fixes, undo, export, name offers
  if (fixed) return fixed;
  const saves = await gameSavesPanel(request, env, action, who); // phase A1c-1: game save states
  if (saves) return saves;
  const mod = await moderationPanel(request, env, action, who); // phase A2a: warn, time out, hide, ban, remove km
  if (mod) return mod;
  if (action === "log" && request.method === "GET") {
    const target = url.searchParams.get("target");
    const rows = target
      ? await env.DB.prepare(`SELECT * FROM admin_log WHERE target = ? ORDER BY at DESC LIMIT 100`).bind(target).all<AdminLogItem>()
      : await env.DB.prepare(`SELECT * FROM admin_log ORDER BY at DESC LIMIT 100`).all<AdminLogItem>();
    return json(rows.results);
  }
  return null;
}
