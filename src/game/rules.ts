// Game rules and numbers from docs/design-brief.md and the design file's mock-up.
// Phase 6 moves the authority for these to the server; the formulas stay the same.

// The route, coasting speed and base tap power are shared with the Worker.
export { COAST_KM_S, ROUTE_KM } from "../../shared/mission";

export type UpgradeKey = "cold" | "ion" | "sail" | "hands" | "chant";
export type UpgradeLevels = Record<UpgradeKey, number>;

export interface UpgradeDef {
  key: UpgradeKey;
  group: "auto" | "tap";
  name: string;
  effect: string;
  baseCost: number;
  icon: "bolt" | "star" | "up";
}

export const UPGRADES: UpgradeDef[] = [
  { key: "cold", group: "auto", name: "Cold-gas jets", effect: "+0.02 km/s each", baseCost: 150, icon: "bolt" },
  { key: "ion", group: "auto", name: "Ion drive", effect: "+0.08 km/s each", baseCost: 900, icon: "bolt" },
  { key: "sail", group: "auto", name: "Solar sail", effect: "+0.30 km/s each", baseCost: 12000, icon: "star" },
  { key: "hands", group: "tap", name: "Steady hands", effect: "+2 km per tap", baseCost: 300, icon: "up" },
  { key: "chant", group: "tap", name: "Crew chant", effect: "+25% tap power", baseCost: 4000, icon: "up" },
];

/** Each level costs ×1.55 more than the last. */
export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(1.55, level));
}

/** Tap km = (4 + 2×hands) × (1 + 0.25×chant), rounded. */
export function tapKm(levels: UpgradeLevels): number {
  return Math.round((4 + 2 * levels.hands) * (1 + 0.25 * levels.chant));
}

/** Auto-thrust in km/s. */
export function autoKmS(levels: UpgradeLevels): number {
  return 0.02 * levels.cold + 0.08 * levels.ion + 0.3 * levels.sail;
}

export interface Milestone {
  n: number;
  name: string;
  km: number;
}

/**
 * The milestones the design shows on the track. All six are drafted in phase 7 (decision 12);
 * these four are the design's, as placeholders.
 */
export const MILESTONES: Milestone[] = [
  { n: 1, name: "Earth–Moon portrait", km: 20_000_000 },
  { n: 3, name: "Mid-course burn", km: 120_000_000 },
  { n: 4, name: "Halfway", km: 240_000_000 },
  { n: 6, name: "Phobos in view", km: 430_000_000 },
];

/** The signal needs a Ping at least this often. */
export const SIGNAL_WINDOW_S = 24 * 60 * 60;
/** The countdown pulses in the final minute. */
export const SIGNAL_URGENT_S = 60;
