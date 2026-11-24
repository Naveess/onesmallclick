// The personal idle game's rules (phase 6), shared by the browser and the Worker.
// The server decides every purchase and payout with these; the browser uses them to show prices.
// Numbers are the design's (docs/design-brief.md).

import { BASE_TAP_KM } from "./mission";

export type UpgradeKey = "cold" | "ion" | "sail" | "hands" | "chant";
export type UpgradeLevels = Record<UpgradeKey, number>;
export const UPGRADE_KEYS: UpgradeKey[] = ["cold", "ion", "sail", "hands", "chant"];

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

/** No upgrade goes past this level (a guard; the costs make it unreachable in practice). */
export const MAX_LEVEL = 200;

/** Each level costs ×1.55 more than the last, less the crew's planet-tech price cut (E4b; 0.05 = 5%). Whole credits. */
export function upgradeCost(key: UpgradeKey, level: number, priceCut = 0): number {
  const def = UPGRADES.find((u) => u.key === key)!;
  return Math.round(def.baseCost * Math.pow(1.55, level) * (1 - priceCut));
}

// ---------- Prestige: "Hand over the shift" (decision 10: the design's numbers) ----------

/** Km pushed since your last handover that unlocks the next one. */
export const PRESTIGE_AT_KM = 2_000_000;
/** Patches earned per handover. */
export const PATCHES_PER_SHIFT = 3;
/** Each patch adds this much to tap power and auto-thrust, forever. */
export const PATCH_BONUS = 0.1;

function patchBoost(patches: number): number {
  return 1 + PATCH_BONUS * patches;
}

/** Tap km = (4 + 2×hands) × (1 + 0.25×chant), then the patches, rounded to whole km. */
export function tapKm(levels: UpgradeLevels, patches: number): number {
  return Math.round((BASE_TAP_KM + 2 * levels.hands) * (1 + 0.25 * levels.chant) * patchBoost(patches));
}

/** Auto-thrust in km/s, with the patches. */
export function autoKmS(levels: UpgradeLevels, patches: number): number {
  return (0.02 * levels.cold + 0.08 * levels.ion + 0.3 * levels.sail) * patchBoost(patches);
}

// ---------- Offline thrust ----------

/** Offline thrust counts for at most this long (the design's 8 hours). */
export const OFFLINE_CAP_MS = 8 * 3_600_000;
/** Welcome back shows after at least this long away (and only with some auto-thrust). */
export const WELCOME_MIN_AWAY_MS = 30 * 60_000;
/** A tab hidden this long closes its connection, so it counts as away (the 8-hour cap applies). */
export const HIDDEN_CLOSE_MS = 5 * 60_000;

/** Your own idle game, as the server sends it. */
export interface Progress {
  /** Exact credits at `at` (the server keeps thousandths as whole numbers). */
  credits: number;
  levels: UpgradeLevels;
  patches: number;
  /** Km pushed since the last handover (prestige progress). */
  kmSinceShift: number;
  /** Your auto-thrust and tap power, with the patches. */
  autoKmS: number;
  tapKm: number;
}

/** The welcome back summary (1d), sent with hello after time away. */
export interface WelcomeBack {
  awayMs: number;
  countedMs: number;
  /** Km your thrusters pushed while you were away (= credits earned). */
  km: number;
  /** How far the probe travelled while you were away, if it's the same mission. */
  crewKm: number | null;
  /** How much sooner (positive) or later (negative) the arrival is than when you left. */
  arrivalSoonerMs: number | null;
  /** The last ping while you were away. */
  keptAliveBy: { name: string; at: number } | null;
}
