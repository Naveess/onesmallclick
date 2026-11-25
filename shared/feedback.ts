// Phase Q1a (prompt 105): "Report a bug or idea". Both the app and the Worker use this file.

export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_NAMES: Record<FeedbackKind, string> = { bug: "Bug", idea: "Idea", other: "Other" };
export const FEEDBACK_MAX = 1000;
/** Done items are deleted this long after they were marked done (decision 32). */
export const FEEDBACK_KEEP_DONE_MS = 90 * 86_400_000;

export function isFeedbackKind(x: unknown): x is FeedbackKind {
  return typeof x === "string" && (FEEDBACK_KINDS as readonly string[]).includes(x);
}

/** One item, as /admin's Feedback card shows it. */
export interface FeedbackItem {
  id: number;
  at: number;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  info: string | null;
  /** The account's email and name, when a signed-in player ticked "contact me" (and the account still exists). */
  contact: { email: string | null; name: string } | null;
  doneAt: number | null;
}
