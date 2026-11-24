// Planet tech (E4b part 2a, approved in E0): every leg the crew arrives at unlocks its stop's perk for the
// whole crew, for the rest of the tour, at the strength of the leg's medal. Shared by the Worker (which
// applies it) and the browser (which shows prices and the perks). The numbers are in content/campaign.json
// (each stop's tech.effect). Perks act on credits, prices and the offline cap only, never on km or the
// probe's speed (docs/expansion.md, section 9).

import { stop } from "./campaign";
import type { Medal } from "./medals";

/** Every kind of perk in content/campaign.json. */
export type TechKind =
  | "tapCredits"
  | "autoCredits"
  | "allCredits"
  | "priceCut"
  | "offlineMin"
  | "safeAuto"
  | "pingCredits"
  | "postcardCredits"
  | "nightTapCredits";

/** The kinds the game applies so far. The rest wait for their legs (npm run check-leg flags them). */
export const WIRED_TECH: TechKind[] = ["tapCredits", "autoCredits", "allCredits", "priceCut", "offlineMin"];

export interface TechEffect {
  kind: TechKind;
  gold: number;
  silver: number;
  bronze: number;
}

/** The crew's perks, added up across the tour. */
export interface CrewTech {
  /** Extra credits from your taps (0.05 = +5%). */
  tapCredits: number;
  /** Extra credits from auto-thrust, connected or offline. */
  autoCredits: number;
  /** Extra credits from everything (multiplies the others). */
  allCredits: number;
  /** Upgrade prices cut (0.05 = 5% cheaper). Discounts multiply: 5% and 4% make 8.8%. */
  priceCut: number;
  /** Minutes added to the 8-hour offline cap. */
  offlineMin: number;
}

export const NO_TECH: CrewTech = { tapCredits: 0, autoCredits: 0, allCredits: 0, priceCut: 0, offlineMin: 0 };

/** A leg the crew arrived at, and its medal. */
export interface ArrivedLeg {
  stop: string;
  medal: Medal;
}

export function techEffect(stopId: string): TechEffect | undefined {
  return stop(stopId)?.tech?.effect as TechEffect | undefined;
}

/** The crew's perks from every leg arrived at this tour. Same-kind perks add up; price cuts and "all credits" multiply. */
export function crewTech(legs: ArrivedLeg[]): CrewTech {
  const t = { ...NO_TECH };
  let priceKeep = 1;
  let allMul = 1;
  for (const leg of legs) {
    const e = techEffect(leg.stop);
    if (!e) continue;
    const v = e[leg.medal];
    if (e.kind === "tapCredits") t.tapCredits += v;
    else if (e.kind === "autoCredits") t.autoCredits += v;
    else if (e.kind === "allCredits") allMul *= 1 + v;
    else if (e.kind === "priceCut") priceKeep *= 1 - v;
    else if (e.kind === "offlineMin") t.offlineMin += v;
  }
  t.allCredits = allMul - 1;
  t.priceCut = 1 - priceKeep;
  // Tidy float noise (0.05 + 0.03 = 0.08000000000000002).
  for (const k of Object.keys(t) as (keyof CrewTech)[]) t[k] = Math.round(t[k] * 1e6) / 1e6;
  return t;
}

/** The credits for `km` pushed: 1 a km, plus the tap or auto perk, then "all credits". */
export function creditsFor(km: number, fromTaps: boolean, tech: CrewTech): number {
  return km * (1 + (fromTaps ? tech.tapCredits : tech.autoCredits)) * (1 + tech.allCredits);
}

/** The offline cap with the perks (8 hours, plus minutes). */
export function offlineCapMs(baseMs: number, tech: CrewTech): number {
  return baseMs + tech.offlineMin * 60_000;
}
