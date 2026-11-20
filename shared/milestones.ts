// The six milestones (phase 7b), shared by the Worker and the app. Content: content/milestones.json.
// The fact pages (/milestones/<slug>) are built from the same file by scripts/build-pages.mjs.

import content from "../content/milestones.json";

export interface Milestone {
  n: number;
  slug: string;
  /** Short name, for the track and lists. */
  name: string;
  /** Km travelled from Earth along the route. */
  km: number;
  /** The milestone moment's big title. */
  title: string;
  fact: string;
  sub: string;
}

export const MILESTONES: Milestone[] = content.milestones.map(({ n, slug, name, km, title, fact, sub }) => ({
  n,
  slug,
  name,
  km,
  title,
  fact,
  sub,
}));

export const MILESTONE_COUNT = MILESTONES.length;

/** The milestones on the leg to `stop`. Only the Earth → Mars leg has them so far; E3 adds the others. */
export function milestonesFor(stop: string): Milestone[] {
  return stop === "mars" ? MILESTONES : [];
}

/** A milestone the current mission has reached, and when (server time). */
export interface ReachedMilestone {
  n: number;
  at: number;
}
