// The Destination file (E4b part 1, prompts 49–50): one checked fact a day about the leg's destination,
// from content/facts/<stop>.json. Only Mars has its 30 facts so far; the other stops get theirs in E3,
// and the card stays hidden on a leg without them. The full list, with sources, is /destinations/<stop>
// (scripts/build-pages.mjs).

import mars from "../../content/facts/mars.json";

interface Fact {
  n: number;
  fact: string;
}

const FACTS: Record<string, Fact[]> = { mars: mars.facts };

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

/** Where a fact lives on the site, e.g. /destinations/mars#fact-12. */
export function factPath(stop: string, n: number): string {
  return `/destinations/${stop}#fact-${n}`;
}
