// Phase A2b-1 (decisions 39 and 40): messages from mission control. The player's inbox (an envelope on the game's header),
// to one player or to everyone, optionally carrying a gift of credits or a badge that the player collects. The
// templates' wording is in content/messages.json.

import messages from "../content/messages.json";
import type { BadgeId } from "./badges";

export const MESSAGE_TITLE_MAX = 80;
export const MESSAGE_BODY_MAX = 800;
/** The biggest gift of credits in one message. */
export const GIFT_CREDITS_MAX = 1_000_000;
/** Decision 40: messages (and who read or collected them) are kept 90 days. */
export const MESSAGE_KEEP_MS = 90 * 86_400_000;
/** Typed to take an everyone gift back from everyone who collected it. */
export const TAKE_GIFT_BACK_PHRASE = "TAKE THE GIFT BACK";

export interface MessageTemplate {
  id: string;
  label: string;
  title: string;
  body: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = messages.templates;
export const TEMPLATES_APPROVED: string | null = messages.approved;

/** A template's text with {name} filled in ("crew" for everyone). */
export function fillTemplate(text: string, name: string | null): string {
  return text.replace(/\{name\}/g, name ?? "crew");
}

export type Gift = { credits: number } | { badge: BadgeId };

/** One message in a player's inbox. */
export interface InboxItem {
  id: number;
  title: string;
  body: string;
  at: number;
  /** Sent to everyone (not just you). */
  everyone: boolean;
  read: boolean;
  gift: Gift | null;
  /** When you collected the gift, or null. */
  collectedAt: number | null;
  /** The gift can't be collected any more (withdrawn or stopped by mission control). */
  giftClosed: boolean;
}

/** GET /api/inbox. */
export interface InboxView {
  items: InboxItem[];
}

/** POST /api/inbox/collect. */
export type CollectResult =
  | { ok: true; credits: number; badge: BadgeId | null; badgeNew: boolean }
  | { ok: false; error: "paused" | "gone" | "collected" | "no-gift" | "busy" };

// ---------- /admin ----------

/** A message as /admin lists it. */
export interface AdminMessage {
  id: number;
  toKey: string | null;
  toName: string | null;
  title: string;
  body: string;
  template: string | null;
  gift: Gift | null;
  at: number;
  admin: string;
  reason: string;
  withdrawnAt: number | null;
  withdrawnBy: string | null;
  giftStoppedAt: number | null;
  /** One player: when they opened it, collected it, and whether the gift was taken back. */
  readAt: number | null;
  collectedAt: number | null;
  collectedCredits: number | null;
  takenBackAt: number | null;
  takenBackCredits: number | null;
  /** Everyone: how many have opened it, and collected (and had it taken back). */
  reads: number;
  collected: number;
  takenBack: number;
}

/** GET /api/admin/message-collectors ?id=: who collected an everyone gift (prompt 141). */
export interface GiftCollector {
  /** The key it was collected under (taking it back from this player sends this). */
  key: string;
  /** Where it is now: a guest who signed in since is their account. */
  nowKey: string;
  name: string | null;
  collectedAt: number;
  credits: number | null;
  badgeNew: boolean;
  takenBackAt: number | null;
  takenBackCredits: number | null;
}

/** GET /api/admin/messages ?key= (one player's) or none (the everyone ones). */
export interface AdminMessagesView {
  messages: AdminMessage[];
  templates: MessageTemplate[];
  templatesApproved: string | null;
}

export const isGift = (g: unknown): g is Gift =>
  !!g &&
  typeof g === "object" &&
  (("credits" in g && Number.isInteger((g as { credits: unknown }).credits)) || ("badge" in g && typeof (g as { badge: unknown }).badge === "string"));
