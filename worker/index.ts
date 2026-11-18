// The OneSmallClick Worker. Static files (the React app, sprites, fonts) are served
// before this runs; only /api/* reaches it (see run_worker_first in wrangler.jsonc).
//
//   GET  /api/health          { ok: true }
//   GET  /api/session         sets the signed device cookie if needed; returns { name }
//   GET  /api/probe           WebSocket to the shared Probe (needs the device cookie)
//   GET  /api/admin/state     } /admin's test controls, behind
//   POST /api/admin/distance  }   Authorization: Bearer <ADMIN_KEY>
//   POST /api/admin/clock     }
//   POST /api/admin/reset     }

import { deviceCookie, generateName, readDevice } from "./device";

export { Probe } from "./probe";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
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
    if (path.startsWith("/api/admin/")) return admin(request, env, path.slice("/api/admin/".length));

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/** Makes sure this browser has a device id (and a row in D1), and returns its name. */
async function session(request: Request, env: Env): Promise<Response> {
  if (!env.DEVICE_SECRET) return json({ error: "DEVICE_SECRET is not set" }, 503);
  const now = Date.now();
  const country = (request.cf as IncomingRequestCfProperties | undefined)?.country ?? null;

  const id = await readDevice(request, env.DEVICE_SECRET);
  if (id) {
    const row = await env.DB.prepare(`SELECT name FROM devices WHERE id = ?`).bind(id).first<{ name: string }>();
    if (row) {
      await env.DB.prepare(`UPDATE devices SET last_seen = ? WHERE id = ?`).bind(now, id).run();
      return json({ name: row.name });
    }
    // A valid cookie whose row was wiped (test data cleared): give it a row again.
    const name = generateName();
    await env.DB.prepare(`INSERT INTO devices (id, name, country, created_at, last_seen) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, name, country, now, now)
      .run();
    return json({ name });
  }

  const newId = crypto.randomUUID();
  const name = generateName();
  await env.DB.prepare(`INSERT INTO devices (id, name, country, created_at, last_seen) VALUES (?, ?, ?, ?, ?)`)
    .bind(newId, name, country, now, now)
    .run();
  return json({ name }, 200, { "Set-Cookie": await deviceCookie(newId, env.DEVICE_SECRET) });
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
  return probe(env).fetch(new Request(request.url, { headers }));
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
  if (action === "reset") return json(await stub.adminResetMission());
  return json({ error: "Not found" }, 404);
}
