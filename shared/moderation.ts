// Phase A2a (prompts 132-133): moderation. Both the app and the Worker use this file.
// Decisions 36-40 and 45: time outs of 1, 3, 7 or 14 days and a permanent ban (the account and its devices; the network by
// hand, at most 7 days). Timed out or banned is a complete pause: no taps, no auto-thrust, no offline pay, no pings,
// votes or shares. Hidden players are told (no shadow bans). Appeals go through "Report a bug or idea".

export const MOD_KINDS = ["warn", "timeout", "hide", "ban"] as const;
export type ModKind = (typeof MOD_KINDS)[number];
export const TIMEOUT_DAYS = [1, 3, 7, 14] as const;
export const NET_BAN_MAX_DAYS = 7;
export const MOD_REASON_MAX = 300;
/** Decision 40: moderation records are kept 1 year (an active ban or hide stays while it's active). */
export const MOD_KEEP_MS = 365 * 86_400_000;

export function isModKind(x: unknown): x is ModKind {
  return typeof x === "string" && (MOD_KINDS as readonly string[]).includes(x);
}

/** A time out or a ban: the player is paused. `until` is real ms, or null for a ban (until it's lifted). */
export interface Hold {
  id: number;
  kind: "timeout" | "ban";
  reason: string;
  at: number;
  until: number | null;
}

/** What /api/session tells the player about their standing (null fields: nothing of that kind). */
export interface Standing {
  hold: Hold | null;
  /** Hidden from the leaderboards (or banned, which hides too). */
  hidden: { reason: string } | null;
  /** Warnings not yet acknowledged, oldest first. */
  warnings: { id: number; at: number; reason: string }[];
}

/** One record, as /admin's Moderation card lists it. */
export interface ModItem {
  id: number;
  playerKey: string;
  kind: ModKind;
  reason: string;
  at: number;
  until: number | null;
  netDays: number | null;
  admin: string;
  liftedAt: number | null;
  liftedBy: string | null;
  liftReason: string | null;
  ackedAt: number | null;
  /** How many networks a ban has caught so far. */
  networks: number;
  /** Active now (not lifted, not run out). */
  active: boolean;
}

/** One km removal (logged as 'remove-km'), with its undo. */
export interface KmRemoval {
  logId: number;
  at: number;
  admin: string;
  reason: string | null;
  day: string;
  km: number;
  probeKm: number;
  undone: boolean;
}

export interface ModerationView {
  items: ModItem[];
  removals: KmRemoval[];
  /** Their km per day (last 30 days), for picking a day to remove. */
  days: { day: string; km: number; tapMovedKm: number }[];
}

/** GET /api/admin/remove-km: what removing a day's km would do. */
export interface KmPreview {
  day: string;
  /** Their km on the boards that day, and what their taps moved the probe that day. */
  km: number;
  tapMovedKm: number;
  /** The probe now, and after taking `take` off it. */
  probeKm: number;
}

/** Phrase typed to take km off the probe's distance (it changes everyone's trip). */
export const TAKE_OFF_PROBE_PHRASE = "TAKE IT OFF THE PROBE";

/** "until 7:00 pm, Fri 4 Dec" in the player's own time. */
export function untilText(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `${time}, ${day}`;
}
