// Phase S1 (prompt 62): crew links, share counts and link previews. Rules and texts in shared/share.ts
// and content/share.json; tables in migrations/0012_sharing.sql.
//
//   GET  /api/crew-link     this player's crew code (made the first time they share)
//   POST /api/share         { m, v } → one share counted (a share button pressed)
//   GET  /api/crew/<code>   ?m&v → { name, own } for the invite banner; counts one visit (not for your own link)
//   GET  /c/<code>          the game, with the link preview's title, description and image for that crew link
//   GET  /milestones/*, /destinations/*, /how-to-play   the content page, with its preview links made absolute
//
// Link-preview robots only fetch /c/<code>; visits are counted by the app (robots don't run it).

import { BADGE_INFO, type BadgeId } from "../shared/badges";
import { stop as campaignStop, stopName } from "../shared/campaign";
import { MILESTONES } from "../shared/milestones";
import { utcDay } from "../shared/mission";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_PATTERN,
  DETAIL_PATTERN,
  PREVIEW_IMAGES,
  isChannel,
  isMoment,
  previewImage,
  previewText,
  sentence,
  type Moment,
} from "../shared/share";
import mars from "../content/facts/mars.json";
import { readSession } from "./auth";
import { readDevice } from "./device";

const FACTS: Record<string, { n: number; fact: string }[]> = { mars: mars.facts };
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || new URL(origin).host === new URL(request.url).host;
}

/** Who is asking: the account (a:<id>) when signed in, else the device. Null with no device cookie. */
async function playerKey(request: Request, env: Env): Promise<{ key: string; deviceId: string; accountId: string | null } | null> {
  if (!env.DEVICE_SECRET) return null;
  const deviceId = await readDevice(request, env.DEVICE_SECRET);
  if (!deviceId) return null;
  const s = await readSession(request, env);
  return { key: s ? `a:${s.account.id}` : deviceId, deviceId, accountId: s?.account.id ?? null };
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** This player's crew code, made on first use. A guest's code moves to their account when they sign in
 * and the account has none yet (so links shared as a guest keep working, under the account's name). */
export async function crewLink(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: "Wrong origin" }, 403);
  const who = await playerKey(request, env);
  if (!who) return json({ error: "No device; call /api/session first" }, 401);
  const db = env.DB;
  const found = await db.prepare(`SELECT code FROM share_links WHERE player_key = ?`).bind(who.key).first<{ code: string }>();
  if (found) return json({ code: found.code });
  if (who.accountId) {
    const moved = await db
      .prepare(`UPDATE share_links SET player_key = ? WHERE player_key = ? RETURNING code`)
      .bind(who.key, who.deviceId)
      .first<{ code: string }>();
    if (moved) return json({ code: moved.code });
  }
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const res = await db
      .prepare(`INSERT INTO share_links (code, player_key, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`)
      .bind(code, who.key, Date.now())
      .run();
    if (res.meta.changes) return json({ code });
    // A clash on the code (rare), or another tab made this player's code a moment ago.
    const again = await db.prepare(`SELECT code FROM share_links WHERE player_key = ?`).bind(who.key).first<{ code: string }>();
    if (again) return json({ code: again.code });
  }
  return json({ error: "Couldn't make a code" }, 503);
}

async function count(env: Env, column: "shares" | "visits", moment: Moment, channel: string) {
  await env.DB.prepare(
    `INSERT INTO share_counts (day, moment, channel, ${column}) VALUES (?, ?, ?, 1)
     ON CONFLICT (day, moment, channel) DO UPDATE SET ${column} = ${column} + 1`,
  )
    .bind(utcDay(Date.now()), moment, channel)
    .run();
}

/** One share counted. Counters only: nothing about who shared. */
export async function countShare(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { m?: unknown; v?: unknown };
  if (!isMoment(body.m) || !isChannel(body.v)) return new Response(null, { status: 400 });
  await count(env, "shares", body.m, body.v);
  return new Response(null, { status: 204 });
}

/** The crew link's owner: their name, and all-time km (for the preview text). */
async function owner(env: Env, code: string): Promise<{ key: string; name: string; km: number } | null> {
  const link = await env.DB.prepare(`SELECT player_key FROM share_links WHERE code = ?`).bind(code).first<{ player_key: string }>();
  if (!link) return null;
  const key = link.player_key;
  const isAccount = key.startsWith("a:");
  const id = isAccount ? key.slice(2) : key;
  const [name, km] = await env.DB.batch<{ name?: string; km?: number }>([
    isAccount
      ? env.DB.prepare(`SELECT name FROM accounts WHERE id = ?`).bind(id)
      : env.DB.prepare(`SELECT name FROM devices WHERE id = ?`).bind(id),
    isAccount
      ? env.DB.prepare(`SELECT COALESCE(SUM(km), 0) AS km FROM daily_km WHERE account_id = ?`).bind(id)
      : env.DB.prepare(`SELECT COALESCE(SUM(km), 0) AS km FROM daily_km WHERE device_id = ?`).bind(id),
  ]);
  const n = name.results[0]?.name;
  if (!n) return null; // a deleted account or a wiped device
  return { key, name: n, km: Math.round(km.results[0]?.km ?? 0) };
}

/** The invite banner: whose link this is. Counts a visit unless it's your own link. */
export async function crewInfo(request: Request, env: Env, code: string, url: URL): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: "Wrong origin" }, 403);
  if (!CODE_PATTERN.test(code)) return json({ error: "Not found" }, 404);
  const who = await owner(env, code);
  if (!who) return json({ error: "Not found" }, 404);
  const me = await playerKey(request, env);
  const own = me !== null && (me.key === who.key || me.deviceId === who.key);
  if (!own) {
    const m = url.searchParams.get("m");
    const v = url.searchParams.get("v");
    await count(env, "visits", isMoment(m) ? m : "invite", isChannel(v) ? v : "copy");
  }
  return json({ name: who.name, own });
}

/** Where the probe is heading now, for "{dest}" (the newest leg; NULL is the first, Mars). */
async function currentStop(env: Env): Promise<string> {
  const row = await env.DB.prepare(`SELECT stop FROM missions ORDER BY id DESC LIMIT 1`).first<{ stop: string | null }>();
  return row?.stop ?? "mars";
}

/** The fill-ins the preview needs for a moment and its detail. */
function detailFill(moment: Moment, detail: string | null, stopNow: string): Record<string, string> {
  const d = detail && DETAIL_PATTERN.test(detail) ? detail : "";
  const fill: Record<string, string> = { stop: stopNow, dest: stopName(stopNow) };
  if (moment === "milestone") {
    const m = MILESTONES.find((x) => String(x.n) === d);
    if (m) Object.assign(fill, { milestone: sentence(m.title), slug: m.slug });
  } else if (moment === "arrival" || moment === "branch") {
    const s = campaignStop(d);
    if (s) {
      fill.stop = d;
      fill.dest = s.name;
      const [a, b] = s.branchVote ?? [];
      if (a && b) Object.assign(fill, { a: stopName(a), b: stopName(b) });
    }
  } else if (moment === "badge") {
    const b = BADGE_INFO[d as BadgeId];
    if (b) fill.badge = b.name;
  } else if (moment === "fact") {
    const [stop, n] = d.split("-");
    const f = FACTS[stop]?.find((x) => String(x.n) === n);
    if (f) Object.assign(fill, { fact: f.fact, stop });
  }
  return fill;
}

/** Turns the page's relative preview links (og:url, og:image, twitter:image) into absolute ones for this site. */
function absolutize(rewriter: HTMLRewriter, origin: string): HTMLRewriter {
  return rewriter.on('meta[property="og:image"], meta[property="og:url"], meta[name="twitter:image"]', {
    element(el) {
      const v = el.getAttribute("content");
      if (v?.startsWith("/")) el.setAttribute("content", origin + v);
    },
  });
}

/** /c/<code>: the game itself, with this crew link's preview. An unknown code still gets the game. */
export async function crewPage(request: Request, env: Env, url: URL): Promise<Response> {
  const code = url.pathname.split("/")[2] ?? "";
  const page = await env.ASSETS.fetch(new Request(new URL("/", url), { headers: request.headers }));
  let rewriter = absolutize(new HTMLRewriter(), url.origin).on("head", {
    element(el) {
      // Every crew link is the same game: keep them out of search results (previews still work).
      el.append(`<meta name="robots" content="noindex" />`, { html: true });
    },
  });

  const who = CODE_PATTERN.test(code) ? await owner(env, code).catch(() => null) : null;
  if (who) {
    const m = url.searchParams.get("m");
    const moment: Moment = isMoment(m) ? m : "invite";
    const fill = { ...detailFill(moment, url.searchParams.get("d"), await currentStop(env)), name: who.name, km: who.km.toLocaleString("en-GB") };
    const { title, description } = previewText(moment, fill, who.km);
    const image = previewImage(moment, fill);
    const imagePath = `/share/${(PREVIEW_IMAGES as readonly string[]).includes(image) ? image : "default"}.png`;
    const linkPath = `/c/${code}${url.search}`;
    const set = (selector: string, value: string) =>
      rewriter.on(selector, {
        element(el) {
          el.setAttribute("content", value);
        },
      });
    rewriter = rewriter.on("title", {
      element(el) {
        el.setInnerContent(title);
      },
    });
    rewriter = set('meta[name="description"]', description);
    rewriter = set('meta[property="og:title"]', title);
    rewriter = set('meta[property="og:description"]', description);
    rewriter = set('meta[property="og:image"]', url.origin + imagePath);
    rewriter = set('meta[property="og:url"]', url.origin + linkPath);
  }
  const res = rewriter.transform(page);
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, { status: 200, headers });
}

/** A content page with its preview links made absolute. */
export async function contentPage(request: Request, env: Env, url: URL): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  if (!(res.headers.get("Content-Type") ?? "").includes("text/html")) return res;
  return absolutize(new HTMLRewriter(), url.origin).transform(res);
}

/** /admin: shares and visits per day, moment and channel over the last 7 days. */
export async function shareReport(env: Env) {
  const since = utcDay(Date.now() - 6 * 86_400_000);
  const rows = await env.DB.prepare(
    `SELECT day, moment, channel, shares, visits FROM share_counts WHERE day >= ? ORDER BY day DESC, shares + visits DESC`,
  )
    .bind(since)
    .all<{ day: string; moment: string; channel: string; shares: number; visits: number }>();
  const links = await env.DB.prepare(`SELECT COUNT(*) AS n FROM share_links`).first<{ n: number }>();
  return { since, rows: rows.results, crewLinks: links?.n ?? 0 };
}
