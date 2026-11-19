// The OneSmallClick Worker. Static files (the React app, sprites, fonts) are served
// before this runs; only /api/* reaches it (see run_worker_first in wrangler.jsonc).
//
//   GET  /api/health          { ok: true }
//   GET  /api/session         sets the signed device cookie if needed; returns SessionInfo (name, crew number, account)
//   /api/auth/*               sign-in, names, country, sign-out, delete account (worker/auth.ts)
//   GET  /api/probe           WebSocket to the shared Probe (needs the device cookie)
//   POST /api/ping            { token } (Turnstile) → today's Ping for this device (or account, signed in)
//   POST /api/vote            { token, round, option } (Turnstile) → this device's (or account's) vote in today's round
//   GET  /api/log             ?before=<id> → the current mission's log, newest first (30 at a time)
//   GET  /api/admin/state       } /admin's test controls, behind
//   POST /api/admin/distance    }   Authorization: Bearer <ADMIN_KEY>
//   POST /api/admin/clock       }
//   POST /api/admin/signal      }
//   POST /api/admin/clear-ping  }   (lets the admin's own device ping again today)
//   POST /api/admin/give        }   (gives the admin's own device km: credits and prestige progress)
//   POST /api/admin/close-vote  }   (closes today's vote now; its effect applies)
//   POST /api/admin/clear-vote  }   (lets the admin's own device vote again)
//   POST /api/admin/reset       }   (Reset mission (keep players): decision 6, the launch reset)

import type { SessionInfo } from "../shared/account";
import type { PingResult } from "../shared/mission";
import type { VoteResult } from "../shared/votes";
import { accountInfo, auth, readSession, renewSession } from "./auth";
import { deviceCookie, generateName, readDevice } from "./device";

export { Probe } from "./probe";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200, headers: HeadersInit = {}, cookies: string[] = []) {
  const res = Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}

function probe(env: Env) {
  return env.PROBE.get(env.PROBE.idFromName("mission"));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health") return json({ ok: true });
    if (path === "/api/session" && request.method === "GET") return session(request, env);
    if (path === "/api/probe") return connect(request, env, url);
    if (path === "/api/ping" && request.method === "POST") return ping(request, env);
    if (path === "/api/vote" && request.method === "POST") return vote(request, env);
    if (path === "/api/log" && request.method === "GET") return missionLog(env, url);
    if (path.startsWith("/api/auth/")) return auth(request, env, path.slice("/api/auth/".length), url);
    if (path.startsWith("/api/admin/")) return admin(request, env, path.slice("/api/admin/".length));

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/**
 * Makes sure this browser has a device id (and a row in D1), and says who it is: the device's
 * name and crew number, and the signed-in account (renewing an old session as it goes).
 */
async function session(request: Request, env: Env): Promise<Response> {
  if (!env.DEVICE_SECRET) return json({ error: "DEVICE_SECRET is not set" }, 503);
  const now = Date.now();
  const country = (request.cf as IncomingRequestCfProperties | undefined)?.country ?? null;
  const cookies: string[] = [];

  let id = await readDevice(request, env.DEVICE_SECRET);
  let row = id
    ? await env.DB.prepare(`SELECT rowid AS crew, name FROM devices WHERE id = ?`).bind(id).first<{ crew: number; name: string }>()
    : null;
  if (id && row) {
    await env.DB.prepare(`UPDATE devices SET last_seen = ? WHERE id = ?`).bind(now, id).run();
  } else {
    // A new browser, or a valid cookie whose row was wiped (test data cleared).
    const fresh = !id;
    id ??= crypto.randomUUID();
    const name = generateName();
    const res = await env.DB.prepare(`INSERT INTO devices (id, name, country, created_at, last_seen) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, name, country, now, now)
      .run();
    row = { crew: res.meta.last_row_id ?? 0, name };
    if (fresh) cookies.push(await deviceCookie(id, env.DEVICE_SECRET));
  }

  const signedIn = await readSession(request, env);
  if (signedIn) {
    const renewed = await renewSession(request, env, signedIn);
    if (renewed) cookies.push(renewed);
  }
  const body: SessionInfo = {
    name: signedIn?.account.name ?? row.name,
    crew: row.crew,
    account: signedIn ? accountInfo(signedIn.account) : null,
  };
  return json(body, 200, {}, cookies);
}

/** Hands the WebSocket to the Probe, with the device id from the signed cookie. */
async function connect(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") return json({ error: "Expected a WebSocket" }, 426);
  // Only our own pages may open the socket.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== url.host) return json({ error: "Wrong origin" }, 403);
  if (!env.DEVICE_SECRET) return json({ error: "DEVICE_SECRET is not set" }, 503);

  const id = await readDevice(request, env.DEVICE_SECRET);
  if (!id) return json({ error: "No device; call /api/session first" }, 401);

  const headers = new Headers(request.headers);
  headers.set("X-Device-Id", id);
  // Signed in: the probe keeps this player's progress, pings and votes under the account.
  const signedIn = await readSession(request, env);
  headers.delete("X-Account-Id");
  if (signedIn) headers.set("X-Account-Id", signedIn.account.id);
  return probe(env).fetch(new Request(request.url, { headers }));
}

/** Checks the invisible Turnstile token with Cloudflare. */
async function turnstileOk(token: string, request: Request, env: Env, action: "ping" | "vote"): Promise<boolean> {
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = (await res.json()) as { success?: boolean; action?: string };
    return out.success === true && (!out.action || out.action === action);
  } catch (err) {
    console.error("turnstile check failed", err);
    return false;
  }
}

/** Today's Ping for this device: bot check, then the Probe decides (once a day, first one wins). */
async function ping(request: Request, env: Env): Promise<Response> {
  const fail = (reason: Extract<PingResult, { ok: false }>["reason"], status: number) =>
    json({ ok: false, reason } satisfies PingResult, status);
  if (!env.DEVICE_SECRET || !env.TURNSTILE_SECRET) return fail("unavailable", 503);
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return fail("no-device", 403);

  const id = await readDevice(request, env.DEVICE_SECRET);
  if (!id) return fail("no-device", 401);
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  if (typeof body.token !== "string" || body.token.length > 4096 || !(await turnstileOk(body.token, request, env, "ping"))) {
    return fail("bot-check", 403);
  }
  const signedIn = await readSession(request, env);
  const row = signedIn ? null : await env.DB.prepare(`SELECT name FROM devices WHERE id = ?`).bind(id).first<{ name: string }>();
  const name = signedIn?.account.name ?? row?.name ?? "a crew member";
  const result = await probe(env).ping(id, signedIn?.account.id ?? null, name);
  return json(result);
}

/** Today's vote for this device: bot check, then the Probe decides (once per round, while it's open). */
async function vote(request: Request, env: Env): Promise<Response> {
  const fail = (reason: Extract<VoteResult, { ok: false }>["reason"], status: number) =>
    json({ ok: false, reason } satisfies VoteResult, status);
  if (!env.DEVICE_SECRET || !env.TURNSTILE_SECRET) return fail("unavailable", 503);
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return fail("no-device", 403);

  const id = await readDevice(request, env.DEVICE_SECRET);
  if (!id) return fail("no-device", 401);
  const body = (await request.json().catch(() => ({}))) as { token?: unknown; round?: unknown; option?: unknown };
  if (typeof body.round !== "string" || body.round.length > 20 || !Number.isInteger(body.option)) return fail("closed", 400);
  if (typeof body.token !== "string" || body.token.length > 4096 || !(await turnstileOk(body.token, request, env, "vote"))) {
    return fail("bot-check", 403);
  }
  const signedIn = await readSession(request, env);
  return json(await probe(env).castVote(id, signedIn?.account.id ?? null, body.round, body.option as number));
}

const LOG_PAGE = 30;

/** The current mission's log, newest first. Public: everything in it is shared anyway. */
async function missionLog(env: Env, url: URL): Promise<Response> {
  const before = Number(url.searchParams.get("before"));
  const cursor = Number.isInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER;
  const rows = await env.DB.prepare(
    `SELECT id, at, kind, title, body, data FROM log_entries
     WHERE mission_id = (SELECT MAX(id) FROM missions) AND id < ?
     ORDER BY id DESC LIMIT ?`,
  )
    .bind(cursor, LOG_PAGE + 1)
    .all<{ id: number; at: number; kind: string; title: string; body: string; data: string | null }>();
  const list = rows.results.slice(0, LOG_PAGE).map((r) => {
    let data: unknown = null;
    try {
      data = r.data ? JSON.parse(r.data) : null;
    } catch {
      // keep null
    }
    return { id: r.id, at: r.at, kind: r.kind, title: r.title, body: r.body, data };
  });
  return json({ entries: list, more: rows.results.length > LOG_PAGE });
}

const enc = new TextEncoder();

/** Compares the key in constant time (both sides hashed first, so lengths match). */
async function keyMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function admin(request: Request, env: Env, action: string): Promise<Response> {
  if (!env.ADMIN_KEY) return json({ error: "ADMIN_KEY is not set" }, 503);
  const given = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!given || !(await keyMatches(given, env.ADMIN_KEY))) return json({ error: "Wrong key" }, 401);

  const stub = probe(env);
  if (action === "state" && request.method === "GET") return json(await stub.adminState());
  if (request.method !== "POST") return json({ error: "Not found" }, 404);

  const body = (await request.json().catch(() => ({}))) as { km?: unknown; hours?: unknown };
  if (action === "distance") {
    const km = Number(body.km);
    if (!Number.isFinite(km) || km < 0) return json({ error: "km must be a number, 0 or more" }, 400);
    return json(await stub.adminSetDistance(km));
  }
  if (action === "clock") {
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 366) {
      return json({ error: "hours must be between 0 and 8784" }, 400);
    }
    return json(await stub.adminMoveClock(hours));
  }
  if (action === "signal") {
    const seconds = Number((body as { seconds?: unknown }).seconds);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30 * 86_400) {
      return json({ error: "seconds must be between 0 and 2592000" }, 400);
    }
    return json(await stub.adminSetSignal(seconds));
  }
  // These act on the admin's own browser: its device, or its account when signed in.
  const mine = async () => {
    const id = env.DEVICE_SECRET ? await readDevice(request, env.DEVICE_SECRET) : null;
    const signedIn = id ? await readSession(request, env) : null;
    return id ? { id, accountId: signedIn?.account.id ?? null } : null;
  };
  const noDevice = () => json({ error: "This browser has no device yet; open the game first" }, 400);
  if (action === "clear-ping") {
    const me = await mine();
    if (!me) return noDevice();
    return json(await stub.adminClearPing(me.id, me.accountId));
  }
  if (action === "give") {
    const me = await mine();
    if (!me) return noDevice();
    const km = Number(body.km);
    if (!Number.isFinite(km) || km <= 0 || km > 1e12) return json({ error: "km must be between 0 and 1,000,000,000,000" }, 400);
    return json(await stub.adminGive(me.id, me.accountId, km));
  }
  if (action === "close-vote") return json(await stub.adminCloseVote());
  if (action === "clear-vote") {
    const me = await mine();
    if (!me) return noDevice();
    return json(await stub.adminClearVote(me.id, me.accountId));
  }
  if (action === "reset") return json(await stub.adminResetMission());
  return json({ error: "Not found" }, 404);
}
