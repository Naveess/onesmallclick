// The Destination file (E4b part 1, prompts 49–50): one checked fact a day about the leg's destination,
// from content/facts/<stop>.json (listed in shared/content.ts; E3 added Ceres and Vesta). The card stays hidden
// on a leg without facts. The full list, with sources, is /destinations/<stop> (scripts/build-pages.mjs).

import { LEG_FACTS } from "../../shared/content";

const FACTS = LEG_FACTS;

const DAY_MS = 86_400_000;

export interface FactOfDay {
  /** 1..total, the fact's number in its file (and its anchor on the destination page, #fact-N). */
  n: number;
  total: number;
  fact: string;
}

/** Today's fact for the leg to `stop`. Fact 1 on the leg's launch day (UTC), then one more each midnight UTC,
 * round again after the last. Null when the stop has no facts yet. */
export function factOfDay(stop: string, legStartedAt: number, now: number): FactOfDay | null {
  const facts = FACTS[stop];
  if (!facts?.length) return null;
  const day = Math.max(0, Math.floor(now / DAY_MS) - Math.floor(legStartedAt / DAY_MS));
  const f = facts[day % facts.length];
  return { n: f.n, total: facts.length, fact: f.fact };
}

/** A stop's first fact (the campaign map's card when it isn't the leg's destination), or null. */
export function firstFact(stop: string): string | null {
  return FACTS[stop]?.[0]?.fact ?? null;
}

/** How many facts a stop has (0 when none yet): the map card links "All 30 Ceres facts" when it has some. */
export function factCount(stop: string): number {
  return FACTS[stop]?.length ?? 0;
}

/** Where a fact lives on the site, e.g. /destinations/mars#fact-12. */
export function factPath(stop: string, n: number): string {
  return `/destinations/${stop}#fact-${n}`;
}
