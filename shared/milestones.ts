// The milestones (phase 7b; per leg from E3), shared by the Worker and the app. Content: content/milestones/<stop>.json,
// listed in shared/content.ts. The fact pages (/milestones/<slug>) are built from the same files by scripts/build-pages.mjs.

import { LEG_MILESTONES } from "./content";

export interface Milestone {
  n: number;
  slug: string;
  /** Short name, for the track and lists. */
  name: string;
  /** Km travelled from the start of the leg. */
  km: number;
  /** The milestone moment's big title. */
  title: string;
  fact: string;
  sub: string;
  /** The Halfway Crew badge's milestone on this leg. */
  halfway?: boolean;
}

const pick = ({ n, slug, name, km, title, fact, sub, halfway }: Milestone): Milestone => ({ n, slug, name, km, title, fact, sub, halfway });

// Built once, so the same leg always gives the same objects (the flight view compares them: `m === next`).
const BY_STOP: Record<string, Milestone[]> = Object.fromEntries(Object.entries(LEG_MILESTONES).map(([stop, list]) => [stop, list.map(pick)]));
const NONE: Milestone[] = [];

/** The milestones on the leg to `stop` (none on a leg whose content isn't written yet). */
export function milestonesFor(stop: string): Milestone[] {
  return BY_STOP[stop] ?? NONE;
}

/** One milestone on the leg to `stop`, by its number. */
export function milestoneOf(stop: string, n: number): Milestone | undefined {
  return milestonesFor(stop).find((m) => m.n === n);
}

/** The first leg's (Earth → Mars) milestones: How to play and /kit show these. */
export const MILESTONES: Milestone[] = milestonesFor("mars");

export const MILESTONE_COUNT = MILESTONES.length;

/** The share detail for a milestone: "3" on the Mars leg (as since phase S1), "ceres-3" on the others. */
export function milestoneDetail(stop: string, n: number): string {
  return stop === "mars" ? String(n) : `${stop}-${n}`;
}

/** Reads a share detail back: [stop, n], or null. */
export function parseMilestoneDetail(d: string): [string, number] | null {
  const m = /^(?:([a-z]+)-)?(\d{1,2})$/.exec(d);
  return m ? [m[1] ?? "mars", Number(m[2])] : null;
}

/** A milestone the current mission has reached, and when (server time). */
export interface ReachedMilestone {
  n: number;
  at: number;
}
