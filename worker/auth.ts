// Accounts and sign-in (phase 8a): email link or Google. Signing in moves this device's progress
// into the account (the Probe merges it: decision 18) and attaches the device's history.
//
//   POST /api/auth/email            { email, token } (Turnstile) → emails a single-use link (15 min)
//   POST /api/auth/confirm          { t } → the link's token: signs this browser in
//   GET  /api/auth/google           → off to Google (no Google script on our pages)
//   GET  /api/auth/google/callback  → back from Google: signs this browser in, then /sign-in
//   GET  /api/auth/names            → three names to pick from
//   POST /api/auth/name             { name } → picks one (once, straight after the first sign-in)
//   POST /api/auth/country          { country } → changes the country (once)
//   POST /api/auth/sign-out         → this browser becomes a fresh guest (progress stays with the account)
//   POST /api/auth/delete           → deletes the account; this browser becomes a fresh guest
//
// Tokens and session ids are random; only their SHA-256 hashes are stored.

import {
  LINK_TTL_MS,
  SESSION_TTL_MS,
  isCountryCode,
  type AccountInfo,
  type ConfirmResult,
  type EmailLinkResult,
  type NameOffers,
} from "../shared/account";
import { generateName, isGeneratedName } from "../shared/names";
import { deviceCookie, readDevice } from "./device";
import { emailReady, sendSignInLink } from "./email";

const SESSION_COOKIE = "osc_session";
const OAUTH_COOKIE = "osc_oauth";
const OAUTH_TTL_S = 600;
/** A session closer than this to running out is renewed. */
const RENEW_WITHIN_MS = 60 * 86_400_000;
/** At most this many links per address per 15 minutes, and per device per hour. */
const LINKS_PER_EMAIL = 3;
const LINKS_PER_DEVICE = 5;

const NO_STORE = { "Cache-Control": "no-store" };
const enc = new TextEncoder();

export interface AccountRow {
  id: string;
  email: string | null;
  google_sub: string | null;
  name: string;
  name_chosen: number;
  country: string | null;
  country_changed_at: number | null;
  created_at: number;
}

export interface SignedIn {
  account: AccountRow;
  idHash: string;
  expiresAt: number;
}

// ---------- Small helpers ----------

function json(body: unknown, status = 200, headers?: Headers) {
  const h = headers ?? new Headers();
  for (const [k, v] of Object.entries(NO_STORE)) h.set(k, v);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: h });
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  return (
    cookie
      .split(/;\s*/)
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

const CLEAR_SESSION = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Same-site requests only (the browser sends Origin on POSTs). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || new URL(origin).host === new URL(request.url).host;
}

function probe(env: Env) {
  return env.PROBE.get(env.PROBE.idFromName("mission"));
}

// ---------- Sessions ----------

/** The signed-in account for this request, or null. */
export async function readSession(request: Request, env: Env): Promise<SignedIn | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const idHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT a.*, s.expires_at AS session_expires FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.id_hash = ? AND s.expires_at > ?`,
  )
    .bind(idHash, Date.now())
    .first<AccountRow & { session_expires: number }>();
  if (!row) return null;
  const { session_expires, ...account } = row;
  return { account, idHash, expiresAt: session_expires };
}

/** Renews a session that's getting old: returns the Set-Cookie to send, or null. */
export async function renewSession(request: Request, env: Env, s: SignedIn): Promise<string | null> {
  const now = Date.now();
  if (s.expiresAt - now > RENEW_WITHIN_MS) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  await env.DB.prepare(`UPDATE sessions SET expires_at = ? WHERE id_hash = ?`).bind(now + SESSION_TTL_MS, s.idHash).run();
  return sessionCookie(token);
}

/** What /api/session says about the account. */
export function accountInfo(a: AccountRow): AccountInfo {
  return {
    name: a.name,
    nameChosen: a.name_chosen === 1,
    email: a.email,
    google: a.google_sub !== null,
    country: a.country,
    countryChangeable: a.country_changed_at === null,
  };
}

/** A name no account has: the wanted one if it's free, else a numbered one. */
async function freeName(env: Env, wanted: string): Promise<string> {
  const taken = async (n: string) =>
    (await env.DB.prepare(`SELECT 1 FROM accounts WHERE name = ?`).bind(n).first()) !== null;
  if (isGeneratedName(wanted) && !(await taken(wanted))) return wanted;
  for (let i = 0; i < 40; i++) {
    const n = i < 10 ? generateName() : generateName(true);
    if (!(await taken(n))) return n;
  }
  return `${generateName()}_${Date.now() % 1000}`;
}

/** Finds the account for this email or Google id, linking the two; or makes a new one. */
async function findOrCreate(
  env: Env,
  request: Request,
  deviceId: string,
  who: { email: string | null; googleSub?: string },
): Promise<AccountRow> {
  if (who.googleSub) {
    const bySub = await env.DB.prepare(`SELECT * FROM accounts WHERE google_sub = ?`).bind(who.googleSub).first<AccountRow>();
    if (bySub) {
      if (!bySub.email && who.email) {
        await env.DB.prepare(`UPDATE accounts SET email = ? WHERE id = ? AND email IS NULL`).bind(who.email, bySub.id).run();
      }
      return bySub;
    }
  }
  if (who.email) {
    const byEmail = await env.DB.prepare(`SELECT * FROM accounts WHERE email = ?`).bind(who.email).first<AccountRow>();
    if (byEmail) {
      // The same address by email and by Google: one account.
      if (who.googleSub && !byEmail.google_sub) {
        await env.DB.prepare(`UPDATE accounts SET google_sub = ? WHERE id = ?`).bind(who.googleSub, byEmail.id).run();
        byEmail.google_sub = who.googleSub;
      }
      return byEmail;
    }
  }
  const device = await env.DB.prepare(`SELECT name FROM devices WHERE id = ?`).bind(deviceId).first<{ name: string }>();
  const country = (request.cf as IncomingRequestCfProperties | undefined)?.country ?? null;
  const account: AccountRow = {
    id: crypto.randomUUID(),
    email: who.email,
    google_sub: who.googleSub ?? null,
    name: await freeName(env, device?.name ?? generateName()),
    name_chosen: 0,
    country: country && isCountryCode(country) ? country : null,
    country_changed_at: null,
    created_at: Date.now(),
  };
  await env.DB.prepare(
    `INSERT INTO accounts (id, email, google_sub, name, name_chosen, country, country_changed_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL, ?)`,
  )
    .bind(account.id, account.email, account.google_sub, account.name, account.country, account.created_at)
    .run();
  return account;
}

/** Signs this browser in: a session, the device linked, and its progress merged into the account. */
async function completeSignIn(env: Env, deviceId: string, account: AccountRow): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sessions (id_hash, account_id, device_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`).bind(
      await sha256(token),
      account.id,
      deviceId,
      now,
      now + SESSION_TTL_MS,
    ),
    env.DB.prepare(`UPDATE devices SET account_id = ? WHERE id = ?`).bind(account.id, deviceId),
  ]);
  await probe(env).signIn(deviceId, account.id);
  return sessionCookie(token);
}

/** A brand-new guest device for this browser (after signing out or deleting the account). */
async function freshDevice(request: Request, env: Env): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const country = (request.cf as IncomingRequestCfProperties | undefined)?.country ?? null;
  await env.DB.prepare(`INSERT INTO devices (id, name, country, created_at, last_seen) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, generateName(), country, now, now)
    .run();
  return deviceCookie(id, env.DEVICE_SECRET);
}

// ---------- Routes ----------

export async function auth(request: Request, env: Env, action: string, url: URL): Promise<Response> {
  if (!env.DEVICE_SECRET) return json({ error: "DEVICE_SECRET is not set" }, 503);
  if (action === "google" && request.method === "GET") return googleStart(request, env, url);
  if (action === "google/callback" && request.method === "GET") return googleCallback(request, env, url);
  if (action === "names" && request.method === "GET") return nameOffers(request, env);
  if (request.method !== "POST" || !sameOrigin(request)) return json({ error: "Not found" }, 404);
  if (action === "email") return emailLink(request, env, url);
  if (action === "confirm") return confirm(request, env);
  if (action === "name") return chooseName(request, env);
  if (action === "country") return changeCountry(request, env);
  if (action === "sign-out") return signOut(request, env);
  if (action === "delete") return deleteAccount(request, env);
  return json({ error: "Not found" }, 404);
}

// --- Email link ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function emailLink(request: Request, env: Env, url: URL): Promise<Response> {
  const fail = (reason: Extract<EmailLinkResult, { ok: false }>["reason"], status: number) =>
    json({ ok: false, reason } satisfies EmailLinkResult, status);
  const deviceId = await readDevice(request, env.DEVICE_SECRET);
  if (!deviceId) return fail("no-device", 401);
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; token?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail("invalid-email", 400);

  const dev = env.DEV_SIGN_IN_LINKS === "1";
  if (!dev && !emailReady(env)) return fail("unavailable", 503);
  if (typeof body.token !== "string" || body.token.length > 4096 || !(await turnstileOk(body.token, request, env))) {
    return fail("bot-check", 403);
  }

  const now = Date.now();
  const counts = await env.DB.batch<{ n: number }>([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?`).bind(email, now - 15 * 60_000),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM login_tokens WHERE device_id = ? AND created_at > ?`).bind(deviceId, now - 3_600_000),
  ]);
  if ((counts[0].results[0]?.n ?? 0) >= LINKS_PER_EMAIL || (counts[1].results[0]?.n ?? 0) >= LINKS_PER_DEVICE) {
    return fail("too-many", 429);
  }

  const token = randomToken();
  await env.DB.prepare(
    `INSERT INTO login_tokens (token_hash, email, device_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(await sha256(token), email, deviceId, now, now + LINK_TTL_MS)
    .run();
  // The token rides in the #fragment, so it never reaches a server log or a Referer header.
  const link = `${url.origin}/sign-in/confirm#t=${token}`;
  if (dev) return json({ ok: true, devLink: link } satisfies EmailLinkResult);
  if (!(await sendSignInLink(env, email, link))) return fail("unavailable", 503);
  return json({ ok: true } satisfies EmailLinkResult);
}

/** The link's page posts its token here when you press "Sign in" (a mail scanner opening the link does nothing). */
async function confirm(request: Request, env: Env): Promise<Response> {
  const fail = (reason: Extract<ConfirmResult, { ok: false }>["reason"], status: number) =>
    json({ ok: false, reason } satisfies ConfirmResult, status);
  const deviceId = await readDevice(request, env.DEVICE_SECRET);
  if (!deviceId) return fail("no-device", 401);
  const body = (await request.json().catch(() => ({}))) as { t?: unknown };
  if (typeof body.t !== "string" || body.t.length > 100) return fail("invalid", 400);
  const hash = await sha256(body.t);
  const now = Date.now();
  // Claim it in one statement, so the same link can't sign in twice.
  const claimed = await env.DB.prepare(
    `UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email`,
  )
    .bind(now, hash, now)
    .first<{ email: string }>();
  if (!claimed) {
    const row = await env.DB.prepare(`SELECT used_at, expires_at FROM login_tokens WHERE token_hash = ?`)
      .bind(hash)
      .first<{ used_at: number | null; expires_at: number }>();
    if (!row) return fail("invalid", 400);
    return fail(row.used_at !== null ? "used" : "expired", 400);
  }
  const account = await findOrCreate(env, request, deviceId, { email: claimed.email });
  const headers = new Headers();
  headers.append("Set-Cookie", await completeSignIn(env, deviceId, account));
  return json({ ok: true } satisfies ConfirmResult, 200, headers);
}

async function turnstileOk(token: string, request: Request, env: Env): Promise<boolean> {
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = (await res.json()) as { success?: boolean; action?: string };
    return out.success === true && (!out.action || out.action === "signin");
  } catch (err) {
    console.error("turnstile check failed", err);
    return false;
  }
}

// --- Google (the server-side code flow, with PKCE) ---

function googleRedirect(url: URL): string {
  return `${url.origin}/api/auth/google/callback`;
}

function back(url: URL, query: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: `${url.origin}/sign-in${query}`, ...NO_STORE });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

async function googleStart(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return back(url, "?error=google-off");
  if (!(await readDevice(request, env.DEVICE_SECRET))) return back(url, "?error=no-device");
  const state = randomToken();
  const verifier = randomToken();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirect(url),
    response_type: "code",
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const headers = new Headers({ Location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, ...NO_STORE });
  headers.append(
    "Set-Cookie",
    `${OAUTH_COOKIE}=${state}.${verifier}; Path=/api/auth/google; Max-Age=${OAUTH_TTL_S}; HttpOnly; Secure; SameSite=Lax`,
  );
  return new Response(null, { status: 302, headers });
}

interface GoogleIdToken {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  exp?: number;
}

async function googleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const clear = `${OAUTH_COOKIE}=; Path=/api/auth/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
  const failed = (why: string) => back(url, `?error=${why}`, [clear]);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return failed("google-off");
  if (url.searchParams.get("error")) return failed("google-cancelled");
  const [state, verifier] = (cookieValue(request, OAUTH_COOKIE) ?? "").split(".");
  const code = url.searchParams.get("code");
  if (!state || !verifier || !code || url.searchParams.get("state") !== state) return failed("google-failed");
  const deviceId = await readDevice(request, env.DEVICE_SECRET);
  if (!deviceId) return failed("no-device");

  let claims: GoogleIdToken;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirect(url),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    const out = (await res.json()) as { id_token?: string };
    if (!res.ok || !out.id_token) throw new Error(`token ${res.status}`);
    // Straight from Google's token endpoint over TLS, so the token needs no signature check;
    // its claims are still checked (Google's OpenID Connect guide).
    const payload = out.id_token.split(".")[1] ?? "";
    const bin = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as GoogleIdToken;
  } catch (err) {
    console.error("google token exchange failed", err);
    return failed("google-failed");
  }
  const issOk = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
  if (!issOk || claims.aud !== env.GOOGLE_CLIENT_ID || !claims.sub || (claims.exp ?? 0) * 1000 < Date.now()) {
    return failed("google-failed");
  }
  const email = claims.email && claims.email_verified ? claims.email.toLowerCase() : null;
  const account = await findOrCreate(env, request, deviceId, { email, googleSub: claims.sub });
  return back(url, "", [clear, await completeSignIn(env, deviceId, account)]);
}

// --- Name, country ---

async function nameOffers(request: Request, env: Env): Promise<Response> {
  const s = await readSession(request, env);
  if (!s) return json({ error: "Not signed in" }, 401);
  const offers = [s.account.name];
  for (let i = 0; offers.length < 3 && i < 20; i++) {
    const n = await freeName(env, generateName());
    if (!offers.includes(n)) offers.push(n);
  }
  return json({ offers } satisfies NameOffers);
}

async function chooseName(request: Request, env: Env): Promise<Response> {
  const s = await readSession(request, env);
  if (!s) return json({ ok: false, reason: "signed-out" }, 401);
  if (s.account.name_chosen === 1) return json({ ok: false, reason: "already-chosen" }, 400);
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  if (!isGeneratedName(name)) return json({ ok: false, reason: "invalid" }, 400);
  try {
    const res = await env.DB.prepare(`UPDATE accounts SET name = ?, name_chosen = 1 WHERE id = ? AND name_chosen = 0`)
      .bind(name, s.account.id)
      .run();
    if (res.meta.changes === 0) return json({ ok: false, reason: "already-chosen" }, 400);
  } catch {
    return json({ ok: false, reason: "taken" }, 409); // the UNIQUE name: someone took it meanwhile
  }
  return json({ ok: true, name });
}

async function changeCountry(request: Request, env: Env): Promise<Response> {
  const s = await readSession(request, env);
  if (!s) return json({ ok: false, reason: "signed-out" }, 401);
  const body = (await request.json().catch(() => ({}))) as { country?: unknown };
  const country = typeof body.country === "string" ? body.country : "";
  if (!isCountryCode(country)) return json({ ok: false, reason: "invalid" }, 400);
  const res = await env.DB.prepare(
    `UPDATE accounts SET country = ?, country_changed_at = ? WHERE id = ? AND country_changed_at IS NULL`,
  )
    .bind(country, Date.now(), s.account.id)
    .run();
  if (res.meta.changes === 0) return json({ ok: false, reason: "already-changed" }, 400);
  return json({ ok: true, country });
}

// --- Sign out, delete ---

async function signOut(request: Request, env: Env): Promise<Response> {
  const s = await readSession(request, env);
  const deviceId = await readDevice(request, env.DEVICE_SECRET);
  if (s) await env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`).bind(s.idHash).run();
  if (deviceId) {
    await env.DB.prepare(`UPDATE devices SET account_id = NULL WHERE id = ?`).bind(deviceId).run();
    await probe(env).signOut(deviceId);
  }
  // Decision (prompt 30): this browser carries on as a brand-new guest; the progress stays with the account.
  const headers = new Headers();
  headers.append("Set-Cookie", CLEAR_SESSION);
  headers.append("Set-Cookie", await freshDevice(request, env));
  return json({ ok: true }, 200, headers);
}

async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const s = await readSession(request, env);
  if (!s) return json({ ok: false, reason: "signed-out" }, 401);
  const id = s.account.id;
  await probe(env).deleteAccount(id);
  // The account goes; the anonymous history stays (devices, km, pings and votes no longer point at it).
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions WHERE account_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM login_tokens WHERE email = ?`).bind(s.account.email ?? ""),
    env.DB.prepare(`UPDATE devices SET account_id = NULL WHERE account_id = ?`).bind(id),
    env.DB.prepare(`UPDATE daily_km SET account_id = NULL WHERE account_id = ?`).bind(id),
    env.DB.prepare(`UPDATE pings SET account_id = NULL WHERE account_id = ?`).bind(id),
    env.DB.prepare(`UPDATE votes SET account_id = NULL WHERE account_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM progress WHERE device_id = ?`).bind(`a:${id}`),
    env.DB.prepare(`DELETE FROM badges WHERE player_key = ?`).bind(`a:${id}`),
    // The mission credits keep the count but lose the name, and the passport stamps go (E4b part 2a).
    env.DB.prepare(
      `UPDATE mission_crew SET player_key = 'gone:' || lower(hex(randomblob(8))), account_id = NULL, name = NULL, country = NULL
       WHERE player_key = ?`,
    ).bind(`a:${id}`),
    env.DB.prepare(`DELETE FROM share_links WHERE player_key = ?`).bind(`a:${id}`),
    env.DB.prepare(`DELETE FROM recruits WHERE recruiter_key = ?`).bind(`a:${id}`),
    env.DB.prepare(`DELETE FROM accounts WHERE id = ?`).bind(id),
  ]);
  const headers = new Headers();
  headers.append("Set-Cookie", CLEAR_SESSION);
  headers.append("Set-Cookie", await freshDevice(request, env));
  return json({ ok: true }, 200, headers);
}
