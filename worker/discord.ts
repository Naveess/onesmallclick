// Phase Q1b-1 (prompts 105 and 110): the Discord bot. The Probe turns the big moments into short posts, queues them
// in its own SQLite (`discord_out`) and sends them to Nav's webhook (the secret DISCORD_WEBHOOK_URL), at most one
// post a minute, several moments to a post (Discord shows up to 10 embeds in one). Nothing is lost while waiting, and
// a post is only dropped if it's six hours late or Discord keeps refusing it. Posts carry generated names only, never
// emails. With no webhook (local dev) the posts are only listed in /admin.
//
// Pure functions here (what to post, how to batch); the queue and the alarm live in worker/probe.ts.

import type { Medal } from "../shared/medals";

// shared/medals.ts's names, repeated so the check script can load this file with no imports of its own.
const MEDAL_NAMES: Record<Medal, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };

export type DiscordTone = "blue" | "orange";

export interface DiscordPost {
  title: string;
  text: string;
  tone: DiscordTone;
}

/** A queued post (the `discord_out` table). */
export interface DiscordRow extends DiscordPost {
  id: number;
  /** Real ms when it was queued. */
  at: number;
  tries: number;
}

/** The two accent colours from docs/tokens.css: light blue for action, light orange for signal and celebration. */
const COLOURS: Record<DiscordTone, number> = { blue: 0x8ccfff, orange: 0xffb37a };

/** The least time between two posts (real ms). */
export const DISCORD_GAP_MS = 60_000;
/** Discord's limit: embeds in one message. */
export const DISCORD_MAX_EMBEDS = 10;
/** A post still unsent after this long is dropped: yesterday's milestone isn't news. */
export const DISCORD_STALE_MS = 6 * 3_600_000;
/** After this many refusals a post is dropped. */
export const DISCORD_MAX_TRIES = 5;
/** Sent posts kept for /admin. */
export const DISCORD_KEEP = 30;

/**
 * The moments the log already records, as Discord posts (null: not posted). The vote opening and the signal's final
 * hour aren't log entries, so the Probe queues those itself.
 */
export function postForLog(kind: string, title: string, body: string, data: Record<string, unknown>): DiscordPost | null {
  switch (kind) {
    case "milestone":
    case "goal":
    case "launch":
    case "burn_start":
      return { tone: "orange", title, text: body };
    case "arrival": {
      const medal = data.medal as Medal | undefined;
      return { tone: "orange", title: medal && MEDAL_NAMES[medal] ? `${title} · ${MEDAL_NAMES[medal]} medal` : title, text: body };
    }
    case "signal_lost":
      return { tone: "orange", title: "Signal lost: the probe is in safe mode", text: body };
    case "close_save":
    case "signal_restored":
    case "vote_result":
    case "branch_open":
    case "branch_result":
      return { tone: "blue", title, text: body };
    default:
      return null;
  }
}

/** What to send now, given the queue (oldest first), the time of the last post and the earliest retry. */
export function nextBatch<T extends { at: number }>(
  rows: T[],
  now: number,
  lastSentAt: number,
  retryAt = 0,
): { send: T[]; waitMs: number } {
  if (rows.length === 0) return { send: [], waitMs: 0 };
  const waitMs = Math.max(0, lastSentAt + DISCORD_GAP_MS - now, retryAt - now);
  return { send: waitMs > 0 ? [] : rows.slice(0, DISCORD_MAX_EMBEDS), waitMs };
}

export type DiscordOutcome =
  | { status: "sent" }
  | { status: "off" } // no webhook set
  | { status: "retry"; retryAfterMs: number; detail: string }
  | { status: "failed"; code: number; detail: string };

/** The webhook secret as pasted: spaces, line breaks or quotes around it are dropped (prompt 113). */
export function cleanWebhook(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^["'<]+|["'>]+$/g, "").trim();
}

/** What Discord said, short enough for /admin: "HTTP 404 {"message": "Unknown Webhook", ...}". Never the URL itself. */
async function said(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
  return `HTTP ${res.status}${text ? ` ${text}` : ""}`;
}

/** One webhook message with these posts as embeds. Each title links back to the game. */
export async function sendToDiscord(
  webhookUrl: string | undefined,
  posts: DiscordPost[],
  siteUrl: string,
  /** Local checks only: a stand-in webhook on this computer. */
  allowLocal = false,
): Promise<DiscordOutcome> {
  webhookUrl = cleanWebhook(webhookUrl);
  if (!webhookUrl) return { status: "off" };
  const local = allowLocal && /^http:\/\/127\.0\.0\.1:\d+\//.test(webhookUrl);
  if (!local && !/^https:\/\/(?:[\w-]+\.)?(?:discord|discordapp)\.com\/api\/(?:v\d+\/)?webhooks\//.test(webhookUrl)) {
    return { status: "failed", code: 0, detail: "the DISCORD_WEBHOOK_URL secret isn't a Discord webhook address (https://discord.com/api/webhooks/...)" };
  }
  const body = {
    username: "OSC-1 Mission Control",
    // Whatever the text says, never ping anyone.
    allowed_mentions: { parse: [] },
    embeds: posts.map((p) => ({
      title: p.title.slice(0, 250),
      description: p.text.slice(0, 3900),
      color: COLOURS[p.tone],
      url: siteUrl,
    })),
  };
  let res: Response;
  try {
    res = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (err) {
    return { status: "retry", retryAfterMs: DISCORD_GAP_MS, detail: `couldn't reach Discord: ${String(err).slice(0, 120)}` };
  }
  if (res.ok) return { status: "sent" };
  if (res.status === 429) {
    const detail = await said(res.clone());
    const j = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const s = Number(j.retry_after ?? res.headers.get("Retry-After") ?? 60);
    return { status: "retry", retryAfterMs: Math.max(1_000, Math.min(10 * 60_000, Math.ceil((Number.isFinite(s) ? s : 60) * 1000))), detail };
  }
  if (res.status >= 500) return { status: "retry", retryAfterMs: DISCORD_GAP_MS, detail: await said(res) };
  return { status: "failed", code: res.status, detail: await said(res) }; // a deleted or wrong webhook: retrying won't help
}
