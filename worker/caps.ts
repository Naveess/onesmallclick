// The per-network daily cap on pings and votes (phase 9a, prompt 54; numbers in shared/caps.ts).
// The network is the connecting IPv4 address, or the first half (/64) of an IPv6 one, which is usually one
// home or phone. It's never stored: only an HMAC of it with the day, keyed by DEVICE_SECRET, so the same
// network gets a different hash each day and the hashes can't be turned back into addresses.

import { NETWORK_CAP, type CapKind } from "../shared/caps";

const DAY_MS = 86_400_000;
const enc = new TextEncoder();

/** Expands an IPv6 address and keeps its first four groups (the /64). */
function ipv6Prefix(ip: string): string {
  const [head, tail = ""] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return groups
    .slice(0, 4)
    .map((g) => (parseInt(g || "0", 16) || 0).toString(16))
    .join(":");
}

function network(request: Request): string {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return "local"; // only in local dev, where there's no Cloudflare edge
  return ip.includes(":") ? ipv6Prefix(ip) : ip;
}

async function netHash(secret: string, day: number, net: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`network-cap:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${day}:${net}`));
  return [...new Uint8Array(mac).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Phase A2a: a network ban's hash. Fixed (not per day), so a ban can last up to 7 days; it's only ever stored for a
 * banned player's network (worker/moderation.ts), never for anyone else's, and can't be turned back into an address.
 */
export async function banHash(request: Request, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`network-ban:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(network(request)));
  return [...new Uint8Array(mac).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CapTicket {
  day: number;
  hash: string;
  kind: CapKind;
}

/** Null when this network has used today's allowance of `kind`; otherwise a ticket to count a success with. */
export async function capCheck(request: Request, env: Env, kind: CapKind): Promise<CapTicket | null> {
  const day = Math.floor(Date.now() / DAY_MS);
  const hash = await netHash(env.DEVICE_SECRET, day, network(request));
  const row = await env.DB.prepare(`SELECT count FROM network_caps WHERE day = ? AND net_hash = ? AND kind = ?`)
    .bind(day, hash, kind)
    .first<{ count: number }>();
  if ((row?.count ?? 0) >= NETWORK_CAP[kind]) {
    console.warn(JSON.stringify({ event: "network-cap", kind, net: hash.slice(0, 8), cap: NETWORK_CAP[kind] }));
    return null;
  }
  return { day, hash, kind };
}

/** Counts a ping or vote that went through, and clears out days before yesterday. */
export async function capCount(env: Env, t: CapTicket): Promise<void> {
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO network_caps (day, net_hash, kind, count) VALUES (?, ?, ?, 1)
         ON CONFLICT (day, net_hash, kind) DO UPDATE SET count = count + 1`,
      ).bind(t.day, t.hash, t.kind),
      env.DB.prepare(`DELETE FROM network_caps WHERE day < ?`).bind(t.day - 1),
    ]);
  } catch (err) {
    // The ping or vote already counted in the game; a missed tally only makes the cap a little more generous.
    console.error(JSON.stringify({ event: "network-cap-count-failed", error: String(err) }));
  }
}

/** /admin: today's busiest networks (hash prefixes only) against the cap. */
export async function capReport(env: Env) {
  const day = Math.floor(Date.now() / DAY_MS);
  const rows = await env.DB.prepare(
    `SELECT net_hash,
            SUM(CASE WHEN kind = 'ping' THEN count ELSE 0 END) AS pings,
            SUM(CASE WHEN kind = 'vote' THEN count ELSE 0 END) AS votes
     FROM network_caps WHERE day = ? GROUP BY net_hash ORDER BY MAX(count) DESC LIMIT 10`,
  )
    .bind(day)
    .all<{ net_hash: string; pings: number; votes: number }>();
  const networks = await env.DB.prepare(`SELECT COUNT(DISTINCT net_hash) AS n FROM network_caps WHERE day = ?`)
    .bind(day)
    .first<{ n: number }>();
  return {
    cap: NETWORK_CAP,
    networks: networks?.n ?? 0,
    top: rows.results.map((r) => ({ net: r.net_hash.slice(0, 8), pings: r.pings, votes: r.votes })),
  };
}
