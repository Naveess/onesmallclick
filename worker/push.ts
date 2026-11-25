// Phase Q1b-2 (prompts 105, 109, 110): opt-in notifications with Web Push, no library.
//
// A browser that turns alerts on gives us its push address (`endpoint`); we keep it in D1 `push_subscriptions` with
// its three on/off switches. The Probe fires the moments (the signal's final hour, the landing burn, the vote's last
// hour) and sends each one as an EMPTY push, signed with our VAPID key (RFC 8292): nothing to encrypt. The browser's
// service worker (public/sw.js) then asks POST /api/notice what to show, and we answer for that browser's address,
// so two alerts close together never swap texts. At most 3 alerts a day per browser (decision 29).
//
// Routes (all under /api/push/, plus /api/notice):
//   GET  /api/push/config       { publicKey, available }
//   POST /api/push/subscribe    { endpoint, prefs? } → the browser's state (adds it, or updates it)
//   POST /api/push/state        { endpoint } → the browser's state
//   POST /api/push/prefs        { endpoint, prefs } → the state
//   POST /api/push/unsubscribe  { endpoint }
//   POST /api/push/test         { endpoint } → sends this browser a test alert (once an hour)
//   POST /api/notice            { endpoint } → { title, body, url }: what to show for the push it just got

import {
  NOTICES,
  PUSH_KINDS,
  PUSH_MAX_PER_DAY,
  PUSH_TEST_GAP_MS,
  isPushEndpoint,
  type NoticeKind,
  type PushKind,
  type PushPrefs,
  type PushState,
} from "../shared/push";
import { readSession } from "./auth";
import { capCheck, capCount } from "./caps";
import { readDevice } from "./device";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const COLUMN: Record<PushKind, string> = { signal: "a_signal", burn: "a_burn", vote: "a_vote" };

// ---------- Sending (VAPID, RFC 8292) ----------

const b64u = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const utf8 = (s: string) => new TextEncoder().encode(s);

let signing: { src: string; key: CryptoKey } | null = null;
const tokens = new Map<string, { jwt: string; exp: number }>();

async function vapidAuth(env: Env, endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const hit = tokens.get(aud);
  if (hit && hit.exp - now > 3600) return `vapid t=${hit.jwt}, k=${env.VAPID_PUBLIC_KEY}`;
  if (!signing || signing.src !== env.VAPID_PRIVATE_KEY) {
    const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    signing = { src: env.VAPID_PRIVATE_KEY, key };
  }
  const exp = now + 12 * 3600; // push services accept up to 24 hours
  const head = b64u(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  // `sub` is how a push service can reach us if we misbehave: the site, not anyone's email.
  const claims = b64u(utf8(JSON.stringify({ aud, exp, sub: env.SITE_URL })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signing.key, utf8(`${head}.${claims}`)); // r||s, as JWS wants
  const jwt = `${head}.${claims}.${b64u(sig)}`;
  tokens.set(aud, { jwt, exp });
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

export type PushResult = "sent" | "gone" | "failed";

/** One empty push. "gone": the push service says this browser is unsubscribed for good (delete it). */
export async function sendPush(env: Env, endpoint: string, ttlS: number): Promise<PushResult> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: await vapidAuth(env, endpoint), TTL: String(ttlS), Urgency: "high" },
    });
    if (res.ok) return "sent";
    if (res.status === 404 || res.status === 410) return "gone";
    console.warn(JSON.stringify({ event: "push-refused", status: res.status, host: new URL(endpoint).host }));
    return "failed";
  } catch (err) {
    console.warn(JSON.stringify({ event: "push-failed", error: String(err) }));
    return "failed";
  }
}

// ---------- The Probe's fan-out ----------

/** Pushes per run: each is a subrequest, and the free plan allows about 50 per run. */
export const PUSH_BATCH = 30;

/**
 * Sends one alert to the next `PUSH_BATCH` browsers after `cursor` that want it: the alert is on, they haven't had 3
 * today, and (for the vote and the signal) they haven't already voted or pinged. Returns where to carry on.
 */
export async function pushBatch(
  env: Env,
  kind: PushKind,
  cursor: number,
  day: string,
  round: string | null,
): Promise<{ next: number; done: boolean; sent: number }> {
  const col = COLUMN[kind];
  const where = [`id > ?`, `${col} = 1`, `NOT (sent_day = ? AND sent_today >= ?)`];
  const binds: (string | number)[] = [cursor, day, PUSH_MAX_PER_DAY];
  if (kind === "vote" && round) {
    where.push(`NOT EXISTS (SELECT 1 FROM votes v WHERE v.round = ? AND (v.device_id = s.device_id OR (s.account_id IS NOT NULL AND v.account_id = s.account_id)))`);
    binds.push(round);
  }
  if (kind === "signal") {
    where.push(`NOT EXISTS (SELECT 1 FROM pings p WHERE p.day = ? AND (p.device_id = s.device_id OR (s.account_id IS NOT NULL AND p.account_id = s.account_id)))`);
    binds.push(day);
  }
  const rows = (
    await env.DB.prepare(`SELECT id, endpoint FROM push_subscriptions s WHERE ${where.join(" AND ")} ORDER BY id LIMIT ?`)
      .bind(...binds, PUSH_BATCH)
      .all<{ id: number; endpoint: string }>()
  ).results;
  if (rows.length === 0) return { next: cursor, done: true, sent: 0 };
  const ids = rows.map((r) => r.id).join(",");
  // Mark first (the count, and which alert to explain): the browser asks the moment the push lands.
  await env.DB.prepare(
    `UPDATE push_subscriptions SET sent_today = CASE WHEN sent_day = ? THEN sent_today + 1 ELSE 1 END, sent_day = ?, pending_kind = ? WHERE id IN (${ids})`,
  )
    .bind(day, day, kind)
    .run();
  const ttl = kind === "burn" ? 1800 : 3600;
  const results = await Promise.all(rows.map((r) => sendPush(env, r.endpoint, ttl)));
  const gone = rows.filter((_, i) => results[i] === "gone").map((r) => r.id);
  if (gone.length > 0) await env.DB.prepare(`DELETE FROM push_subscriptions WHERE id IN (${gone.join(",")})`).run();
  return { next: rows[rows.length - 1].id, done: rows.length < PUSH_BATCH, sent: results.filter((r) => r === "sent").length };
}

// ---------- The routes ----------

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || new URL(origin).host === new URL(request.url).host;
}

interface Row {
  device_id: string;
  a_signal: number;
  a_burn: number;
  a_vote: number;
  test_at: number | null;
}
const stateOf = (row: Row | null): PushState =>
  row
    ? { on: true, prefs: { signal: !!row.a_signal, burn: !!row.a_burn, vote: !!row.a_vote }, testAt: row.test_at }
    : { on: false, prefs: { signal: true, burn: true, vote: true }, testAt: null };

function readPrefs(x: unknown): PushPrefs | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!PUSH_KINDS.every((k) => typeof o[k] === "boolean")) return null;
  return { signal: o.signal as boolean, burn: o.burn as boolean, vote: o.vote as boolean };
}

export async function pushRoute(request: Request, env: Env, action: string): Promise<Response> {
  if (action === "config" && request.method === "GET") {
    return json({ publicKey: env.VAPID_PUBLIC_KEY, available: !!env.VAPID_PRIVATE_KEY });
  }
  if (request.method !== "POST") return json({ error: "Not found" }, 404);
  if (!sameOrigin(request)) return json({ error: "Wrong origin" }, 403);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const local = env.DEV_SIGN_IN_LINKS === "1"; // local dev only: a stand-in push service on this computer
  if (!isPushEndpoint(endpoint, local)) return json({ error: "bad-endpoint" }, 400);

  // /api/notice is asked by the service worker with the endpoint alone: the address is the secret.
  if (action === "notice") {
    const row = await env.DB.prepare(`SELECT pending_kind FROM push_subscriptions WHERE endpoint = ?`).bind(endpoint).first<{ pending_kind: NoticeKind | null }>();
    const kind = row?.pending_kind && row.pending_kind in NOTICES ? row.pending_kind : null;
    if (kind) await env.DB.prepare(`UPDATE push_subscriptions SET pending_kind = NULL WHERE endpoint = ?`).bind(endpoint).run();
    const n = kind ? NOTICES[kind] : { title: "OneSmallClick", body: "The probe could use you. Open the game to see." };
    return json({ ...n, url: "/", tag: kind ?? "osc" });
  }

  const deviceId = env.DEVICE_SECRET ? await readDevice(request, env.DEVICE_SECRET) : null;
  if (!deviceId) return json({ error: "No device; call /api/session first" }, 401);
  const account = (await readSession(request, env))?.account ?? null;
  const mine = () =>
    env.DB.prepare(`SELECT device_id, a_signal, a_burn, a_vote, test_at FROM push_subscriptions WHERE endpoint = ? AND device_id = ?`)
      .bind(endpoint, deviceId)
      .first<Row>();

  if (action === "state") return json(stateOf(await mine()));

  if (action === "subscribe") {
    const prefs = readPrefs(body.prefs) ?? { signal: true, burn: true, vote: true }; // all three on to start (decision 29)
    const existing = await mine();
    if (!existing) {
      const ticket = await capCheck(request, env, "push");
      if (!ticket) return json({ error: "busy-network" }, 429);
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM push_subscriptions WHERE device_id = ? OR endpoint = ?`).bind(deviceId, endpoint), // one browser, one row
        env.DB.prepare(
          `INSERT INTO push_subscriptions (endpoint, device_id, account_id, created_at, a_signal, a_burn, a_vote) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(endpoint, deviceId, account?.id ?? null, Date.now(), +prefs.signal, +prefs.burn, +prefs.vote),
      ]);
      await capCount(env, ticket);
    } else {
      await env.DB.prepare(`UPDATE push_subscriptions SET account_id = ? WHERE endpoint = ?`).bind(account?.id ?? null, endpoint).run();
    }
    return json(stateOf(await mine()));
  }

  if (action === "prefs") {
    const prefs = readPrefs(body.prefs);
    if (!prefs) return json({ error: "invalid" }, 400);
    await env.DB.prepare(`UPDATE push_subscriptions SET a_signal = ?, a_burn = ?, a_vote = ? WHERE endpoint = ? AND device_id = ?`)
      .bind(+prefs.signal, +prefs.burn, +prefs.vote, endpoint, deviceId)
      .run();
    return json(stateOf(await mine()));
  }

  if (action === "unsubscribe") {
    await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND device_id = ?`).bind(endpoint, deviceId).run();
    return json(stateOf(null));
  }

  if (action === "test") {
    const row = await mine();
    if (!row) return json({ error: "not-subscribed" }, 404);
    const now = Date.now();
    if (row.test_at !== null && now - row.test_at < PUSH_TEST_GAP_MS) return json({ error: "wait", retryAt: row.test_at + PUSH_TEST_GAP_MS }, 429);
    // A test isn't one of the day's 3.
    await env.DB.prepare(`UPDATE push_subscriptions SET test_at = ?, pending_kind = 'test' WHERE endpoint = ?`).bind(now, endpoint).run();
    const result = await sendPush(env, endpoint, 300);
    if (result === "gone") await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(endpoint).run();
    return json({ ok: result === "sent", result });
  }

  return json({ error: "Not found" }, 404);
}
