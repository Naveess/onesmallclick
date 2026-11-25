// The OneSmallClick Worker. Static files (the React app, sprites, fonts) are served
// before this runs; only /api/* reaches it, plus from phase S1 the crew links and content pages
// that get link previews (see run_worker_first in wrangler.jsonc).
//
//   GET  /api/health          { ok: true }
//   GET  /api/session         sets the signed device cookie if needed; returns SessionInfo (name, crew number, account)
//   /api/auth/*               sign-in, names, country, sign-out, delete account (worker/auth.ts)
//   GET  /api/probe           WebSocket to the shared Probe (needs the device cookie)
//   POST /api/ping            { token } (Turnstile) → today's Ping for this device (or account, signed in)
//   POST /api/vote            { token, round, option } (Turnstile) → this device's (or account's) vote in today's round
//   GET  /api/log             ?before=<id> → the current mission's log, newest first (30 at a time)
//   GET  /api/leaderboard     ?board=players|countries → today's top km and your row (worker/boards.ts)
//   GET  /api/credits         ?mission=<id> → the mission credits for an arrived leg (phase 8c)
//   GET  /api/tour            the legs flown so far and which you helped on (E1, the campaign map)
//   GET  /api/profile         this browser's player: name, country, total km, pings in the last 30 days
//   POST /api/report          { message, stack, component, path } → a crash in the app, written to the Workers Logs (phase 9a)
//   POST /api/feedback        { token, kind, message, contact, page, info } (Turnstile) → "Report a bug or idea" (phase Q1a, worker/feedback.ts)
//   /api/push/*, POST /api/notice   opt-in notifications: subscribe, switches, test, and what to show (phase Q1b-2, worker/push.ts)
//   GET  /api/crew-link, POST /api/share, GET /api/crew/<code>   crew links and share counts (phase S1, worker/share.ts)
//   GET  /c/<code>            the game with that crew link's link preview (phase S1; run_worker_first in wrangler.jsonc)
//   GET  /milestones/*, /destinations/*, /how-to-play   content pages with absolute preview links (phase S1)
//   GET  /api/admin/state       } /admin's test controls, behind
//   POST /api/admin/distance    }   Authorization: Bearer <ADMIN_KEY>
//   POST /api/admin/clock       }
//   POST /api/admin/leg-start   }   (E4b: the current leg launched { days } ago, for testing medals)
//   POST /api/admin/burn        }   (E4b part 2b: start the landing burn now { minutes, target })
//   POST /api/admin/goal        }   (phase Q1a: today's crew goal target { km })
//   POST /api/admin/discord-test }  (phase Q1b-1: queue a test post for the Discord channel)
//   POST /api/admin/signal      }
//   POST /api/admin/clear-ping  }   (lets the admin's own device ping again today)
//   POST /api/admin/give        }   (gives the admin's own device km: credits and prestige progress)
//   POST /api/admin/close-vote  }   (closes today's vote now; its effect applies)
//   POST /api/admin/clear-vote  }   (lets the admin's own device vote again)
//   POST /api/admin/reset       }   (Reset mission (keep players): decision 6, the launch reset)
//   POST /api/admin/launch-wipe }   (phase B2: the launch wipe, { confirm: "WIPE EVERYTHING" }; back up D1 first)
//   GET  /api/admin/networks    }   (phase 9a: today's busiest networks against the per-network cap)
//   GET  /api/admin/shares      }   (phase S1: shares and crew-link visits, last 7 days)
//   GET  /api/admin/beta        }   (prompts 82-83: the accounts with the Early Beta badge)
//   GET  /api/admin/players     }   (phase G1: the Players card, counts only)
//   GET  /api/admin/feedback    }   (phase Q1a: bug reports and ideas)
//   POST /api/admin/feedback-done } (phase Q1a: { id, done } marks one done)

import { feedbackReport, markFeedback, sendFeedback } from "./feedback";
import { pushRoute } from "./push";
import type { SessionInfo } from "../shared/account";
import { LAST_SEEN_EVERY_MS, type PingResult } from "../shared/mission";
import type { VoteResult } from "../shared/votes";
import { accountInfo, auth, readSession, renewSession } from "./auth";
import { emailReady } from "./email";
import { LAUNCH_WIPE_PHRASE } from "../shared/beta";
import { BURN_TARGET_KM } from "../shared/burn";
import { betaReport, credits, leaderboard, playersReport, profile, tour } from "./boards";
import { capCheck, capCount, capReport } from "./caps";
import { deviceCookie, generateName, readDevice } from "./device";
import { contentPage, countShare, crewInfo, crewLink, crewPage, shareReport } from "./share";

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

    // Phase S1: pages the Worker sees first, for their link previews (run_worker_first in wrangler.jsonc).
    if (path.startsWith("/c/") && request.method === "GET") return crewPage(request, env, url);
    if (/^\/(milestones|destinations)\/|^\/how-to-play\/?$/.test(path)) return contentPage(request, env, url);

    if (path === "/api/health") return json({ ok: true });
    if (path === "/api/session" && request.method === "GET") return session(request, env);
    if (path === "/api/probe") return connect(request, env, url);
    if (path === "/api/ping" && request.method === "POST") return ping(request, env);
    if (path === "/api/vote" && request.method === "POST") return vote(request, env);
    if (path === "/api/log" && request.method === "GET") return missionLog(env, url);
    if (path === "/api/leaderboard" && request.method === "GET") return leaderboard(request, env, url, await probe(env).boardDay());
    if (path === "/api/credits" && request.method === "GET") return credits(env, url);
    if (path === "/api/tour" && request.method === "GET") return tour(request, env);
    if (path === "/api/profile" && request.method === "GET") return profile(request, env, await probe(env).boardDay());
    if (path === "/api/report" && request.method === "POST") return crashReport(request, url);
    if (path === "/api/feedback" && request.method === "POST") return sendFeedback(request, env, turnstileOk);
    if (path === "/api/notice" && request.method === "POST") return pushRoute(request, env, "notice");
    if (path.startsWith("/api/push/")) return pushRoute(request, env, path.slice("/api/push/".length));
    if (path === "/api/crew-link" && request.method === "GET") return crewLink(request, env);
    if (path === "/api/share" && request.method === "POST") return countShare(request, env);
    if (path.startsWith("/api/crew/") && request.method === "GET") return crewInfo(request, env, path.slice("/api/crew/".length), url);
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
    // At most hourly: an unchanged row isn't a row written (storage is billed by those).
    await env.DB.prepare(`UPDATE devices SET last_seen = ? WHERE id = ? AND last_seen < ?`).bind(now, id, now - LAST_SEEN_EVERY_MS).run();
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
    emailSignIn: emailReady(env) || env.DEV_SIGN_IN_LINKS === "1",
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
  // The player's time zone from Cloudflare's location, for the Night Shift badge (never from the browser).
  headers.delete("X-Timezone");
  const tz = (request.cf as IncomingRequestCfProperties | undefined)?.timezone;
  if (tz) headers.set("X-Timezone", tz);
  return probe(env).fetch(new Request(request.url, { headers }));
}

/** Checks the invisible Turnstile token with Cloudflare. */
async function turnstileOk(token: string, request: Request, env: Env, action: "ping" | "vote" | "feedback"): Promise<boolean> {
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
  // The per-network daily cap (phase 9a), before the bot check so a capped network doesn't cost a Turnstile call.
  const ticket = await capCheck(request, env, "ping");
  if (!ticket) return fail("busy-network", 429);
  if (typeof body.token !== "string" || body.token.length > 4096 || !(await turnstileOk(body.token, request, env, "ping"))) {
    return fail("bot-check", 403);
  }
  const signedIn = await readSession(request, env);
  const row = signedIn ? null : await env.DB.prepare(`SELECT name FROM devices WHERE id = ?`).bind(id).first<{ name: string }>();
  const name = signedIn?.account.name ?? row?.name ?? "a crew member";
  const result = await probe(env).ping(id, signedIn?.account.id ?? null, name);
  if (result.ok) await capCount(env, ticket);
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
  const ticket = await capCheck(request, env, "vote");
  if (!ticket) return fail("busy-network", 429);
  if (typeof body.token !== "string" || body.token.length > 4096 || !(await turnstileOk(body.token, request, env, "vote"))) {
    return fail("bot-check", 403);
  }
  const signedIn = await readSession(request, env);
  const result = await probe(env).castVote(id, signedIn?.account.id ?? null, body.round, body.option as number);
  if (result.ok) await capCount(env, ticket);
  return json(result);
}

/** A crash in the app (src/components/CrashScreen.tsx), logged for Workers Logs. Size-capped; nothing is stored. */
async function crashReport(request: Request, url: URL): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== url.host) return new Response(null, { status: 403 });
  const text = (await request.text()).slice(0, 4000);
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // keep it empty
  }
  const field = (k: string, n: number) => (typeof body[k] === "string" ? (body[k] as string).slice(0, n) : "");
  console.error(
    JSON.stringify({
      event: "app-crash",
      message: field("message", 300),
      path: field("path", 200),
      stack: field("stack", 1200),
      component: field("component", 600),
      ua: (request.headers.get("User-Agent") ?? "").slice(0, 200),
    }),
  );
  return new Response(null, { status: 204 });
}

const LOG_PAGE = 30;

/** The current mission's log, newest first. Public: everything in it is shared anyway. */
async function missionLog(env: Env, url: URL): Promise<Response> {
  const before = Number(url.searchParams.get("before"));
  const cursor = Number.isInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER;
  // The whole tour since the launch reset (phase 8c): every leg from the latest Earth → Mars start.
  // Each entry's day counts from its own leg's start, as the log shows it.
  const rows = await env.DB.prepare(
    `SELECT l.id, l.at, l.kind, l.title, l.body, l.data, m.started_at FROM log_entries l
     LEFT JOIN missions m ON m.id = l.mission_id
     WHERE l.mission_id >= (SELECT MAX(id) FROM missions WHERE stop IS NULL OR stop = 'mars') AND l.id < ?
     ORDER BY l.id DESC LIMIT ?`,
  )
    .bind(cursor, LOG_PAGE + 1)
    .all<{ id: number; at: number; kind: string; title: string; body: string; data: string | null; started_at: number | null }>();
  const list = rows.results.slice(0, LOG_PAGE).map((r) => {
    let data: unknown = null;
    try {
      data = r.data ? JSON.parse(r.data) : null;
    } catch {
      // keep null
    }
    const day = r.started_at === null ? null : Math.floor((r.at - r.started_at) / 86_400_000) + 1;
    return { id: r.id, at: r.at, day, kind: r.kind, title: r.title, body: r.body, data };
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
  if (action === "networks" && request.method === "GET") return json(await capReport(env));
  if (action === "shares" && request.method === "GET") return json(await shareReport(env));
  if (action === "beta" && request.method === "GET") return json(await betaReport(env));
  if (action === "players" && request.method === "GET") return json(await playersReport(env));
  if (action === "feedback" && request.method === "GET") return json(await feedbackReport(env));
  if (request.method !== "POST") return json({ error: "Not found" }, 404);

  const body = (await request.json().catch(() => ({}))) as { km?: unknown; hours?: unknown };
  if (action === "distance") {
    const km = Number(body.km);
    if (!Number.isFinite(km) || km < 0) return json({ error: "km must be a number, 0 or more" }, 400);
    return json(await stub.adminSetDistance(km));
  }
  if (action === "burn") {
    const b = body as { minutes?: unknown; target?: unknown };
    const minutes = b.minutes === undefined ? 60 : Number(b.minutes);
    const target = b.target === undefined ? BURN_TARGET_KM : Number(b.target);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) return json({ error: "minutes must be between 1 and 60" }, 400);
    if (!Number.isFinite(target) || target < 1 || target > 1e9) return json({ error: "target must be between 1 and 1,000,000,000 km" }, 400);
    return json(await stub.adminStartBurn(minutes, target));
  }
  if (action === "feedback-done") {
    const b = body as { id?: unknown; done?: unknown };
    if (!Number.isInteger(b.id)) return json({ error: "id must be a whole number" }, 400);
    return json(await markFeedback(env, b.id as number, b.done !== false));
  }
  if (action === "discord-test") return json(await stub.adminDiscordTest());
  if (action === "goal") {
    const km = Number((body as { km?: unknown }).km);
    if (!Number.isFinite(km) || km < 1 || km > 1e12) return json({ error: "km must be between 1 and 1,000,000,000,000" }, 400);
    return json(await stub.adminSetGoal(Math.round(km)));
  }
  if (action === "leg-start") {
    const days = Number((body as { days?: unknown }).days);
    if (!Number.isFinite(days) || days < 0 || days > 400) return json({ error: "days must be between 0 and 400" }, 400);
    return json(await stub.adminSetLegStart(days));
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
  // Phase B2: the launch wipe. It can't be undone, so it needs the phrase typed out as well as the key.
  if (action === "launch-wipe") {
    if ((body as { confirm?: unknown }).confirm !== LAUNCH_WIPE_PHRASE) {
      return json({ error: `Type ${LAUNCH_WIPE_PHRASE} to confirm` }, 400);
    }
    return json(await stub.adminLaunchWipe());
  }
  return json({ error: "Not found" }, 404);
}
