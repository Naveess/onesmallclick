// The daily crew vote (phase 7a), shared by the Worker and the app.
// The pool: content/vote-options.json (the faster and steady options every leg shares) and, from E3, each
// leg's own detours (content/detours/<stop>.json, via shared/content.ts). Each round picks one of each kind.

import pool from "../content/vote-options.json";
import { LEG_DETOURS } from "./content";

export type VoteKind = "faster" | "steady" | "detour";

export interface VoteOptionDef {
  id: string;
  kind: VoteKind;
  /** Effect on the arrival date in hours (negative = sooner), applied to the route at coasting speed. */
  hours: number;
  label: string;
  /** The result line for the mission log. */
  result: string;
  /** Detours only: a true fact for the log, with its source. */
  fact?: string;
  source?: string;
}

export const VOTE_QUESTION: string = pool.question;
const SHARED = pool.options as VoteOptionDef[];
const DETOURS: Record<string, VoteOptionDef[]> = Object.fromEntries(
  Object.entries(LEG_DETOURS).map(([stop, list]) => [stop, list.map((d) => ({ ...d, kind: "detour" as const }))]),
);
/** Every option on every leg (a round's ids are looked up here, whatever leg it opened on). */
export const VOTE_OPTIONS: VoteOptionDef[] = [...SHARED, ...Object.values(DETOURS).flat()];
const BY_ID = new Map(VOTE_OPTIONS.map((o) => [o.id, o]));

/** Options picked in the last this-many rounds aren't picked again. */
export const VOTE_RECENT_ROUNDS = 3;

export function voteOption(id: string): VoteOptionDef | undefined {
  return BY_ID.get(id);
}

/** FNV-1a: a small, stable hash, so a round's options don't depend on when the server woke up. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The options a leg's vote picks from: the shared faster and steady ones, and that leg's detours. */
export function optionsFor(stop: string, kind: VoteKind): VoteOptionDef[] {
  return kind === "detour" ? (DETOURS[stop] ?? []) : SHARED.filter((o) => o.kind === kind);
}

/** One faster, one steady and one detour option for the leg to `stop`, in a shuffled order, avoiding `recent`
 * ids. A leg with no detours written yet gets a second steady option instead. */
export function pickOptions(round: string, recent: string[], stop = "mars"): string[] {
  const kinds: VoteKind[] = ["faster", "steady", "detour"];
  const picked: string[] = [];
  for (const want of kinds) {
    const kind = want === "detour" && optionsFor(stop, "detour").length === 0 ? "steady" : want;
    const all = optionsFor(stop, kind).filter((o) => !picked.includes(o.id));
    const fresh = all.filter((o) => !recent.includes(o.id));
    const from = fresh.length > 0 ? fresh : all;
    picked.push(from[hash(`${round}|${want}`) % from.length].id);
  }
  // Shuffle the three so the fast one isn't always first.
  const order = [...picked].sort((a, b) => hash(`${round}|${a}`) - hash(`${round}|${b}`));
  return order;
}

const TIE_ORDER: Record<VoteKind, number> = { steady: 0, detour: 1, faster: 2 };

/** The winning option's index: most votes; a tie goes to the safest (steady, then detour, then faster). */
export function winnerIndex(ids: string[], tallies: number[]): number {
  let best = 0;
  for (let i = 1; i < ids.length; i++) {
    const a = tallies[i] ?? 0;
    const b = tallies[best] ?? 0;
    if (a > b) best = i;
    else if (a === b) {
      const ka = TIE_ORDER[voteOption(ids[i])?.kind ?? "faster"];
      const kb = TIE_ORDER[voteOption(ids[best])?.kind ?? "faster"];
      if (ka < kb) best = i;
    }
  }
  return best;
}

/** "Burn hard: arrive about a day sooner" → "burn hard" (for "Crew chose: …"). */
export function shortLabel(label: string): string {
  const head = label.split(":")[0].trim();
  return head.charAt(0).toLowerCase() + head.slice(1);
}

/** Today's vote, as everyone sees it. */
export interface LiveVote {
  /** "2026-11-19" (a UTC day), or "2026-11-19.2" after /admin closed one early. */
  round: string;
  question: string;
  options: { id: string; label: string; votes: number }[];
  /** Server time it closes (00:00 UTC). */
  closesAt: number;
  /** "branch" on arrival (phase 8c): the crew picks the next stop; option ids are "branch:<stop id>". */
  kind?: "daily" | "branch";
}

/** What POST /api/vote answers. */
export type VoteResult =
  | { ok: true; option: number; tallies: number[] }
  | { ok: false; reason: "already-voted" | "closed" | "bot-check" | "busy-network" | "no-device" | "unavailable" | "maintenance" | "paused"; option?: number };
