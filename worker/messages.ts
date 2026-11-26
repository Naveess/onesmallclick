// Phase A2b-1 (prompts 138-139; decisions 39 and 40): messages from mission control, and their gifts.
//
// D1 `messages` holds each message: to one player (their key: 'a:<account id>', or a guest's device id) or to everyone
// (to_key NULL), which shows only to players who existed when it was sent. `message_reads` records who opened each one
// and who collected its gift. A gift (credits or a badge) is paid when the player taps Collect, once per player: the
// check looks at all of a player's keys (their account and its devices, or a guest device and the account it was
// signed in to), so collecting as a guest and again after signing in doesn't work. Messages are kept 90 days.
//
// Players:
//   GET  /api/inbox                 → InboxView (the last 90 days, newest first)
//   POST /api/inbox/read    { ids } → marks them opened
//   POST /api/inbox/collect { id }  → CollectResult (not while paused or banned)
// /admin (owner; a moderator may send a message without a gift to one player, and withdraw it):
//   GET  /api/admin/messages         ?key= → AdminMessagesView (one player's, or with no key the everyone ones)
//   POST /api/admin/message-send     { key | null, title, body, template?, gift?, reason } → AdminMessagesView
//   POST /api/admin/message-withdraw { id, reason } → hidden from anyone who hasn't opened it; no more collecting
//   POST /api/admin/gift-undo        { id, reason, confirm?, takeBack? } → one player: takes the collected gift back
//        (typed name) or stops it; everyone: stops further collecting, and with takeBack (typed TAKE THE GIFT BACK)
//        takes it back from everyone who collected it.

import { BADGE_INFO, type BadgeId } from "../shared/badges";
import { isAccountKey, type AdminWho } from "../shared/admin";
import {
  GIFT_CREDITS_MAX,
  MESSAGE_BODY_MAX,
  MESSAGE_KEEP_MS,
  MESSAGE_TEMPLATES,
  MESSAGE_TITLE_MAX,
  TAKE_GIFT_BACK_PHRASE,
  TEMPLATES_APPROVED,
  isGift,
  type AdminMessage,
  type AdminMessagesView,
  type CollectResult,
  type Gift,
  type InboxItem,
  type InboxView,
} from "../shared/messages";
import { adminLog } from "./admin";
import { readSession } from "./auth";
import { readDevice } from "./device";
import { gameSaveBefore } from "./gamesaves";
import { heldNow } from "./moderation";
import { capture, saveState } from "./savestates";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** Gifts to everyone are taken back in groups this size (one Probe call each). */
const TAKE_BACK_GROUP = 200;

function probe(env: Env) {
  return env.PROBE.get(env.PROBE.idFromName("mission"));
}

type MessageRow = {
  id: number;
  to_key: string | null;
  title: string;
  body: string;
  template: string | null;
  gift_credits: number | null;
  gift_badge: string | null;
  at: number;
  admin: string;
  reason: string;
  withdrawn_at: number | null;
  withdrawn_by: string | null;
  gift_stopped_at: number | null;
  gift_stopped_by: string | null;
};

const giftOf = (r: MessageRow): Gift | null =>
  r.gift_credits ? { credits: r.gift_credits } : r.gift_badge ? { badge: r.gift_badge as BadgeId } : null;

// ---------- Who's asking ----------

interface Reader {
  /** Where their reads and collections are written: the account's key when signed in, else the device. */
  key: string;
  /** Every key that counts as them (reads and collections under any of these count). */
  keys: string[];
  /** The earliest this player existed (an everyone message shows if it was sent after this). */
  since: number;
  deviceId: string;
  accountId: string | null;
}

async function reader(env: Env, deviceId: string, accountId: string | null): Promise<Reader> {
  const db = env.DB;
  if (accountId) {
    const [acc, devs] = await db.batch([
      db.prepare(`SELECT created_at FROM accounts WHERE id = ?`).bind(accountId),
      db.prepare(`SELECT id, created_at FROM devices WHERE account_id = ? OR id = ?`).bind(accountId, deviceId),
    ]);
    const devices = devs.results as { id: string; created_at: number }[];
    const created = [(acc.results[0] as { created_at: number } | undefined)?.created_at ?? Date.now(), ...devices.map((d) => d.created_at)];
    return {
      key: `a:${accountId}`,
      keys: [...new Set([`a:${accountId}`, deviceId, ...devices.map((d) => d.id)])],
      since: Math.min(...created),
      deviceId,
      accountId,
    };
  }
  const dev = await db.prepare(`SELECT account_id, created_at FROM devices WHERE id = ?`).bind(deviceId).first<{ account_id: string | null; created_at: number }>();
  return {
    key: deviceId,
    keys: dev?.account_id ? [deviceId, `a:${dev.account_id}`] : [deviceId],
    since: dev?.created_at ?? Date.now(),
    deviceId,
    accountId: null,
  };
}

/** `WITH k(key) AS (VALUES (?), (?), …)`, for "any of this player's keys". */
const keysCte = (keys: string[]) => `WITH k(key) AS (VALUES ${keys.map(() => "(?)").join(", ")})`;

/** The messages this player can see, newest first, with whether they've opened them and collected the gift. */
async function visible(env: Env, r: Reader, only?: number): Promise<(MessageRow & { read_at: number | null; collected_at: number | null })[]> {
  const cut = Date.now() - MESSAGE_KEEP_MS;
  const rows = await env.DB.prepare(
    `${keysCte(r.keys)}
     SELECT m.*,
       (SELECT MAX(read_at) FROM message_reads x WHERE x.message_id = m.id AND x.player_key IN (SELECT key FROM k)) AS read_at,
       (SELECT MAX(collected_at) FROM message_reads x WHERE x.message_id = m.id AND x.player_key IN (SELECT key FROM k)) AS collected_at
     FROM messages m
     WHERE m.at > ? AND (m.to_key IN (SELECT key FROM k) OR (m.to_key IS NULL AND m.at >= ?)) ${only ? "AND m.id = ?" : ""}
     ORDER BY m.at DESC LIMIT 50`,
  )
    .bind(...r.keys, cut, r.since, ...(only ? [only] : []))
    .all<MessageRow & { read_at: number | null; collected_at: number | null }>();
  // Withdrawn: gone for anyone who hadn't opened it.
  return rows.results.filter((m) => m.withdrawn_at === null || m.read_at !== null);
}

async function whoIs(request: Request, env: Env): Promise<Reader | null> {
  const deviceId = env.DEVICE_SECRET ? await readDevice(request, env.DEVICE_SECRET) : null;
  if (!deviceId) return null;
  const signedIn = await readSession(request, env);
  return reader(env, deviceId, signedIn?.account.id ?? null);
}

/** For /api/session: how many unopened messages this browser has. */
export async function unreadCount(env: Env, deviceId: string, accountId: string | null): Promise<number> {
  try {
    const r = await reader(env, deviceId, accountId);
    return (await visible(env, r)).filter((m) => m.read_at === null && m.withdrawn_at === null).length;
  } catch (err) {
    console.error("unread count failed", err); // the envelope just shows no count
    return 0;
  }
}

// ---------- The player's routes ----------

export async function inboxRoute(request: Request, env: Env, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "POST" && origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false }, 403);
  const r = await whoIs(request, env);
  if (!r) return json({ ok: false, error: "No device; call /api/session first" }, 401);

  if (action === "" && request.method === "GET") {
    const items: InboxItem[] = (await visible(env, r)).map((m) => ({
      id: m.id,
      title: m.title,
      body: m.body,
      at: m.at,
      everyone: m.to_key === null,
      read: m.read_at !== null,
      gift: giftOf(m),
      collectedAt: m.collected_at,
      giftClosed: m.withdrawn_at !== null || m.gift_stopped_at !== null,
    }));
    return json({ items } satisfies InboxView);
  }

  if (action === "read" && request.method === "POST") {
    const b = (await request.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(b.ids) ? b.ids.filter((i): i is number => Number.isInteger(i)).slice(0, 50) : [];
    if (ids.length === 0) return json({ ok: true });
    const seen = new Set((await visible(env, r)).map((m) => m.id));
    const now = Date.now();
    const db = env.DB;
    const mine = ids.filter((i) => seen.has(i));
    if (mine.length)
      await db.batch(
        mine.map((id) =>
          db
            .prepare(
              `INSERT INTO message_reads (message_id, player_key, read_at) VALUES (?, ?, ?)
               ON CONFLICT (message_id, player_key) DO UPDATE SET read_at = COALESCE(read_at, excluded.read_at)`,
            )
            .bind(id, r.key, now),
        ),
      );
    return json({ ok: true });
  }

  if (action === "collect" && request.method === "POST") {
    const b = (await request.json().catch(() => ({}))) as { id?: unknown };
    if (!Number.isInteger(b.id)) return json({ ok: false, error: "gone" } satisfies CollectResult, 400);
    return json(await collect(env, request, r, Number(b.id)));
  }
  return json({ error: "Not found" }, 404);
}

async function collect(env: Env, request: Request, r: Reader, id: number): Promise<CollectResult> {
  const [m] = await visible(env, r, id);
  if (!m || m.withdrawn_at !== null || m.gift_stopped_at !== null) return { ok: false, error: "gone" };
  const gift = giftOf(m);
  if (!gift) return { ok: false, error: "no-gift" };
  if (m.collected_at !== null) return { ok: false, error: "collected" };
  // Decision 37: a paused or banned player gets nothing until it ends (the gift waits for them).
  if (await heldNow(env, request, r.deviceId, r.accountId)) return { ok: false, error: "paused" };

  const db = env.DB;
  const now = Date.now();
  // Claim it first, so a double tap (or two tabs) can't pay twice.
  const claim = await db
    .prepare(
      `INSERT INTO message_reads (message_id, player_key, read_at, collected_at) VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT (message_id, player_key) DO UPDATE SET collected_at = ?3, read_at = COALESCE(read_at, ?3) WHERE collected_at IS NULL`,
    )
    .bind(id, r.key, now)
    .run();
  if (!claim.meta.changes) return { ok: false, error: "collected" };

  try {
    // A gift to one player is a change to their account like any other: a save state first (A1 rules).
    let save: number | null = null;
    if (m.to_key !== null) {
      const before = await capture(env, r.key);
      if (before) save = await saveState(env, before, `before gift (message ${id})`, m.admin);
    }
    let credits = 0;
    let badgeNew = false;
    if ("credits" in gift) {
      [credits] = await probe(env).adminGift([{ key: r.key, creditsMilli: gift.credits * 1000 }]);
      credits = Math.round(credits / 1000);
    } else {
      const ins = await db.prepare(`INSERT OR IGNORE INTO badges (player_key, badge, earned_at) VALUES (?, ?, ?)`).bind(r.key, gift.badge, now).run();
      badgeNew = (ins.meta.changes ?? 0) > 0;
      if (badgeNew) await probe(env).adminGift([{ key: r.key, badge: gift.badge, badgeOn: true, at: now }]);
    }
    await db
      .prepare(`UPDATE message_reads SET collected_credits = ?, badge_new = ?, save_state = ? WHERE message_id = ? AND player_key = ?`)
      .bind(credits, badgeNew ? 1 : 0, save === null ? null : String(save), id, r.key)
      .run();
    return { ok: true, credits, badge: "badge" in gift ? gift.badge : null, badgeNew };
  } catch (err) {
    console.error("gift collect failed", err);
    // Not paid: let them try again.
    await db.prepare(`UPDATE message_reads SET collected_at = NULL WHERE message_id = ? AND player_key = ?`).bind(id, r.key).run();
    return { ok: false, error: "busy" };
  }
}

/** Decision 40: messages, and who read them, go after 90 days. Run daily (the 00:05 cron). */
export async function pruneMessages(env: Env): Promise<void> {
  const cut = Date.now() - MESSAGE_KEEP_MS;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM message_reads WHERE message_id IN (SELECT id FROM messages WHERE at < ?)`).bind(cut),
    env.DB.prepare(`DELETE FROM messages WHERE at < ?`).bind(cut),
  ]);
}

// ---------- /admin ----------

class MsgError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** A player key's name (an account's or a guest device's), or null if there's no such player. */
async function nameOf(env: Env, key: string): Promise<string | null> {
  const row = isAccountKey(key)
    ? await env.DB.prepare(`SELECT name FROM accounts WHERE id = ?`).bind(key.slice(2)).first<{ name: string }>()
    : await env.DB.prepare(`SELECT name FROM devices WHERE id = ?`).bind(key).first<{ name: string }>();
  return row?.name ?? null;
}

type ReadRow = {
  read_at: number | null;
  collected_at: number | null;
  collected_credits: number | null;
  taken_back_at: number | null;
  taken_back_credits: number | null;
};

async function view(env: Env, key: string | null): Promise<AdminMessagesView> {
  const db = env.DB;
  const rows = (
    key
      ? await db.prepare(`SELECT * FROM messages WHERE to_key = ? ORDER BY at DESC LIMIT 100`).bind(key).all<MessageRow>()
      : await db.prepare(`SELECT * FROM messages WHERE to_key IS NULL ORDER BY at DESC LIMIT 100`).all<MessageRow>()
  ).results;
  const name = key ? await nameOf(env, key) : null;
  const messages: AdminMessage[] = [];
  for (const m of rows) {
    let one: ReadRow | null = null;
    let reads = 0;
    let collected = 0;
    let takenBack = 0;
    if (key) {
      one = await db
        .prepare(
          `SELECT MAX(read_at) AS read_at, MAX(collected_at) AS collected_at, SUM(collected_credits) AS collected_credits,
             MAX(taken_back_at) AS taken_back_at, SUM(taken_back_credits) AS taken_back_credits
           FROM message_reads WHERE message_id = ?`,
        )
        .bind(m.id)
        .first<ReadRow>();
    } else {
      const c = await db
        .prepare(
          `SELECT COUNT(read_at) AS reads, COUNT(collected_at) AS collected, COUNT(taken_back_at) AS taken_back FROM message_reads WHERE message_id = ?`,
        )
        .bind(m.id)
        .first<{ reads: number; collected: number; taken_back: number }>();
      reads = c?.reads ?? 0;
      collected = c?.collected ?? 0;
      takenBack = c?.taken_back ?? 0;
    }
    messages.push({
      id: m.id,
      toKey: m.to_key,
      toName: name,
      title: m.title,
      body: m.body,
      template: m.template,
      gift: giftOf(m),
      at: m.at,
      admin: m.admin,
      reason: m.reason,
      withdrawnAt: m.withdrawn_at,
      withdrawnBy: m.withdrawn_by,
      giftStoppedAt: m.gift_stopped_at,
      readAt: one?.read_at ?? null,
      collectedAt: one?.collected_at ?? null,
      collectedCredits: one?.collected_credits ?? null,
      takenBackAt: one?.taken_back_at ?? null,
      takenBackCredits: one?.taken_back_credits ?? null,
      reads: key ? (one?.read_at ? 1 : 0) : reads,
      collected: key ? (one?.collected_at ? 1 : 0) : collected,
      takenBack: key ? (one?.taken_back_at ? 1 : 0) : takenBack,
    });
  }
  return { messages, templates: MESSAGE_TEMPLATES, templatesApproved: TEMPLATES_APPROVED };
}

async function send(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; title?: unknown; body?: unknown; template?: unknown; gift?: unknown; reason?: unknown };
  const key = typeof b.key === "string" && b.key ? b.key.slice(0, 80) : null;
  const title = text(b.title, MESSAGE_TITLE_MAX);
  const body = text(b.body, MESSAGE_BODY_MAX);
  const reason = text(b.reason, 300);
  const template = typeof b.template === "string" && MESSAGE_TEMPLATES.some((t) => t.id === b.template) ? b.template : null;
  if (title.length < 2) throw new MsgError("The message needs a title.");
  if (body.length < 2) throw new MsgError("The message needs some text.");
  if (reason.length < 3) throw new MsgError("Say why (for the log).");
  let gift: Gift | null = null;
  if (b.gift !== undefined && b.gift !== null) {
    if (!isGift(b.gift)) throw new MsgError("That gift isn't credits or a badge.");
    if ("credits" in b.gift) {
      if (b.gift.credits < 1 || b.gift.credits > GIFT_CREDITS_MAX) throw new MsgError(`A gift is 1 to ${GIFT_CREDITS_MAX.toLocaleString("en-GB")} credits.`);
      gift = { credits: b.gift.credits };
    } else {
      if (!(b.gift.badge in BADGE_INFO)) throw new MsgError("No such badge.");
      gift = { badge: b.gift.badge };
    }
  }
  if (who.role !== "owner" && (gift || key === null)) throw new MsgError("Only the owner can send gifts or message everyone.", 403);
  if (key !== null && (await nameOf(env, key)) === null) throw new MsgError("No such player.", 404);

  const now = Date.now();
  const res = await env.DB.prepare(
    `INSERT INTO messages (to_key, title, body, template, gift_credits, gift_badge, at, admin, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(key, title, body, template, gift && "credits" in gift ? gift.credits : null, gift && "badge" in gift ? gift.badge : null, now, who.email, reason)
    .run();
  const id = res.meta.last_row_id;
  await adminLog(env, who.email, "msg-send", key, reason, { id, everyone: key === null, title, template, gift });
  // One player: their open screens reconnect, so the envelope shows the new message straight away. Everyone's screens
  // pick it up the next time they connect (opening the game, or coming back to its tab).
  if (key !== null) await probe(env).adminReconnect([key], isAccountKey(key) ? [] : [key]);
  return json(await view(env, key));
}

async function withdraw(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; reason?: unknown };
  const reason = text(b.reason, 300);
  if (!Number.isInteger(b.id)) throw new MsgError("id");
  if (reason.length < 3) throw new MsgError("Say why (for the log).");
  const m = await env.DB.prepare(`SELECT * FROM messages WHERE id = ?`).bind(b.id).first<MessageRow>();
  if (!m) throw new MsgError("No such message.", 404);
  if (who.role !== "owner" && (m.to_key === null || giftOf(m))) throw new MsgError("Only the owner can withdraw that.", 403);
  if (m.withdrawn_at !== null) throw new MsgError("It's already withdrawn.");
  await env.DB.prepare(`UPDATE messages SET withdrawn_at = ?, withdrawn_by = ? WHERE id = ?`).bind(Date.now(), who.email, m.id).run();
  await adminLog(env, who.email, "msg-withdraw", m.to_key, reason, { id: m.id });
  return json(await view(env, m.to_key));
}

/**
 * Where a collector's gift is now: a guest who collected and then signed in had their progress (and badges) merged into
 * the account, so it's taken back from the account.
 */
async function nowHeldBy(env: Env, keys: string[]): Promise<Map<string, string>> {
  const out = new Map(keys.map((k) => [k, k]));
  const guests = keys.filter((k) => !isAccountKey(k));
  for (let i = 0; i < guests.length; i += 50) {
    const group = guests.slice(i, i + 50);
    const rows = await env.DB.prepare(`SELECT id, account_id FROM devices WHERE account_id IS NOT NULL AND id IN (${group.map(() => "?").join(", ")})`)
      .bind(...group)
      .all<{ id: string; account_id: string }>();
    for (const r of rows.results) out.set(r.id, `a:${r.account_id}`);
  }
  return out;
}

/** Takes collected gifts back: credits (as much as they still have) and the badge where it was new to them. */
async function takeBack(env: Env, m: MessageRow, rows: { player_key: string; collected_credits: number | null; badge_new: number | null }[]) {
  const db = env.DB;
  const gift = giftOf(m);
  if (!gift || rows.length === 0) return { players: 0, credits: 0, short: 0 };
  const holder = await nowHeldBy(env, rows.map((r) => r.player_key));
  let credits = 0;
  let short = 0;
  const now = Date.now();
  for (let i = 0; i < rows.length; i += TAKE_BACK_GROUP) {
    const group = rows.slice(i, i + TAKE_BACK_GROUP);
    let taken: number[] = group.map(() => 0);
    if ("credits" in gift) {
      taken = (await probe(env).adminGift(group.map((r) => ({ key: holder.get(r.player_key) ?? r.player_key, creditsMilli: -(r.collected_credits ?? 0) * 1000 })))).map((t) =>
        Math.round(-t / 1000),
      );
      group.forEach((r, j) => {
        credits += taken[j];
        short += Math.max(0, (r.collected_credits ?? 0) - taken[j]);
      });
    } else {
      const newOnes = group.filter((r) => r.badge_new);
      if (newOnes.length) {
        await db.batch(
          newOnes.map((r) =>
            db.prepare(`DELETE FROM badges WHERE player_key IN (?, ?) AND badge = ?`).bind(r.player_key, holder.get(r.player_key) ?? r.player_key, gift.badge),
          ),
        );
        await probe(env).adminGift(newOnes.map((r) => ({ key: holder.get(r.player_key) ?? r.player_key, badge: gift.badge, badgeOn: false })));
      }
    }
    await db.batch(
      group.map((r, j) =>
        db
          .prepare(`UPDATE message_reads SET taken_back_at = ?, taken_back_credits = ? WHERE message_id = ? AND player_key = ?`)
          .bind(now, "credits" in gift ? taken[j] : null, m.id, r.player_key),
      ),
    );
  }
  return { players: rows.length, credits, short };
}

async function giftUndo(request: Request, env: Env, who: AdminWho): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { id?: unknown; reason?: unknown; confirm?: unknown; takeBack?: unknown };
  const reason = text(b.reason, 300);
  if (!Number.isInteger(b.id)) throw new MsgError("id");
  if (reason.length < 3) throw new MsgError("Say why (for the log).");
  const db = env.DB;
  const m = await db.prepare(`SELECT * FROM messages WHERE id = ?`).bind(b.id).first<MessageRow>();
  if (!m) throw new MsgError("No such message.", 404);
  if (!giftOf(m)) throw new MsgError("That message has no gift.");
  const now = Date.now();
  const collected = (
    await db
      .prepare(`SELECT player_key, collected_credits, badge_new FROM message_reads WHERE message_id = ? AND collected_at IS NOT NULL AND taken_back_at IS NULL`)
      .bind(m.id)
      .all<{ player_key: string; collected_credits: number | null; badge_new: number | null }>()
  ).results;
  const stop = db.prepare(`UPDATE messages SET gift_stopped_at = COALESCE(gift_stopped_at, ?), gift_stopped_by = COALESCE(gift_stopped_by, ?) WHERE id = ?`).bind(now, who.email, m.id);

  if (m.to_key !== null) {
    // One player: not collected yet → it can't be any more; collected → take it back (their name typed), save state first.
    await stop.run();
    let result = { players: 0, credits: 0, short: 0 };
    let save: number | null = null;
    if (collected.length) {
      const name = await nameOf(env, m.to_key);
      if (b.confirm !== name) throw new MsgError(`Type the player's name (${name}) to confirm.`);
      const before = await capture(env, (await nowHeldBy(env, [collected[0].player_key])).get(collected[0].player_key) ?? collected[0].player_key);
      if (before) save = await saveState(env, before, `before gift undo (message ${m.id})`, who.email);
      result = await takeBack(env, m, collected);
    }
    await adminLog(env, who.email, "gift-undo", m.to_key, reason, { id: m.id, ...result, saveState: save });
    return json({ ...(await view(env, m.to_key)), result });
  }

  // Everyone: stop further collecting; take it back from those who collected only when asked, with the phrase.
  if (b.takeBack === true && collected.length) {
    if (b.confirm !== TAKE_GIFT_BACK_PHRASE) throw new MsgError(`Type ${TAKE_GIFT_BACK_PHRASE} to take it back from ${collected.length} players.`);
    await gameSaveBefore(env, "gift take-back", who.email);
  }
  await stop.run();
  const result = b.takeBack === true ? await takeBack(env, m, collected) : { players: 0, credits: 0, short: 0 };
  await adminLog(env, who.email, "gift-undo", null, reason, { id: m.id, everyone: true, takeBack: b.takeBack === true, ...result });
  return json({ ...(await view(env, null)), result });
}

/** The message routes, or null for anything else. */
export async function messagesPanel(request: Request, env: Env, action: string, who: AdminWho): Promise<Response | null> {
  if (!["messages", "message-send", "message-withdraw", "gift-undo"].includes(action)) return null;
  try {
    if (action === "messages" && request.method === "GET") {
      const key = new URL(request.url).searchParams.get("key");
      return json(await view(env, key ? key.slice(0, 80) : null));
    }
    if (action === "message-send" && request.method === "POST") return await send(request, env, who);
    if (action === "message-withdraw" && request.method === "POST") return await withdraw(request, env, who);
    if (action === "gift-undo" && request.method === "POST") {
      if (who.role !== "owner") return json({ error: "Only the owner can do that." }, 403);
      return await giftUndo(request, env, who);
    }
  } catch (err) {
    if (err instanceof MsgError) return json({ error: err.message }, err.status);
    throw err;
  }
  return null;
}
