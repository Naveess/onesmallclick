// Phase Q1a (prompt 105): "Report a bug or idea". POST /api/feedback stores it in D1 `feedback`; /admin lists it
// and marks items done. No personal data: the page, screen size and browser. A signed-in player who ticks
// "contact me" leaves their account id (never the email itself), so deleting the account removes it.
// Turnstile and the per-network daily cap keep it from being flooded. Done items go 90 days later (decision 32).

import { FEEDBACK_KEEP_DONE_MS, FEEDBACK_MAX, isFeedbackKind, type FeedbackItem, type FeedbackKind } from "../shared/feedback";
import { readSession } from "./auth";
import { capCheck, capCount } from "./caps";

type Verify = (token: string, request: Request, env: Env, action: "feedback") => Promise<boolean>;

const clip = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
const NO_STORE = { "Cache-Control": "no-store" };

export async function sendFeedback(request: Request, env: Env, turnstileOk: Verify): Promise<Response> {
  const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers: NO_STORE });
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return fail("bad-origin", 403);
  if (!env.TURNSTILE_SECRET || !env.DEVICE_SECRET) return fail("unavailable", 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const message = clip(body.message, FEEDBACK_MAX + 1);
  if (!isFeedbackKind(body.kind) || message.length === 0 || message.length > FEEDBACK_MAX) return fail("invalid", 400);
  // The per-network daily cap first, so a capped network doesn't cost a Turnstile call.
  const ticket = await capCheck(request, env, "feedback");
  if (!ticket) return fail("busy-network", 429);
  if (typeof body.token !== "string" || body.token.length > 4096 || !(await turnstileOk(body.token, request, env, "feedback"))) {
    return fail("bot-check", 403);
  }
  const signedIn = body.contact === true ? await readSession(request, env) : null;
  const page = clip(body.page, 200).replace(/[?#].*$/, "") || null; // the path only: no query, no crew codes
  const info = clip(body.info, 300) || null;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO feedback (at, kind, message, page, info, account_id) VALUES (?, ?, ?, ?, ?, ?)`).bind(
      now,
      body.kind as FeedbackKind,
      message,
      page,
      info,
      signedIn?.account.id ?? null,
    ),
    env.DB.prepare(`DELETE FROM feedback WHERE done_at IS NOT NULL AND done_at < ?`).bind(now - FEEDBACK_KEEP_DONE_MS),
  ]);
  await capCount(env, ticket);
  return Response.json({ ok: true }, { headers: NO_STORE });
}

type Row = {
  id: number;
  at: number;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  info: string | null;
  done_at: number | null;
  email: string | null;
  name: string | null;
};

/** /admin: every open item (newest first, up to 100), then the last 20 done ones. */
export async function feedbackReport(env: Env): Promise<{ open: number; items: FeedbackItem[] }> {
  const select = `SELECT f.id, f.at, f.kind, f.message, f.page, f.info, f.done_at, a.email, a.name
                  FROM feedback f LEFT JOIN accounts a ON a.id = f.account_id`;
  const [, open, done, count] = await env.DB.batch<Row & { n?: number }>([
    env.DB.prepare(`DELETE FROM feedback WHERE done_at IS NOT NULL AND done_at < ?`).bind(Date.now() - FEEDBACK_KEEP_DONE_MS),
    env.DB.prepare(`${select} WHERE f.done_at IS NULL ORDER BY f.at DESC LIMIT 100`),
    env.DB.prepare(`${select} WHERE f.done_at IS NOT NULL ORDER BY f.done_at DESC LIMIT 20`),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE done_at IS NULL`),
  ]);
  const item = (r: Row): FeedbackItem => ({
    id: r.id,
    at: r.at,
    kind: r.kind,
    message: r.message,
    page: r.page,
    info: r.info,
    contact: r.name !== null ? { email: r.email, name: r.name } : null,
    doneAt: r.done_at,
  });
  return { open: count.results[0]?.n ?? 0, items: [...open.results, ...done.results].map(item) };
}

/** /admin: marks one item done (or open again). */
export async function markFeedback(env: Env, id: number, done: boolean): Promise<{ ok: boolean }> {
  const r = await env.DB.prepare(`UPDATE feedback SET done_at = ? WHERE id = ?`).bind(done ? Date.now() : null, id).run();
  return { ok: (r.meta.changes ?? 0) > 0 };
}
