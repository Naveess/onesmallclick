// Game rules and numbers from docs/design-brief.md and the design file's mock-up.
// The server decides with the same formulas: they live in shared/ so both use one copy.

export { COAST_KM_S, ROUTE_KM } from "../../shared/mission";
export {
  PRESTIGE_AT_KM,
  UPGRADES,
  autoKmS,
  tapKm,
  upgradeCost,
  type UpgradeDef,
  type UpgradeKey,
  type UpgradeLevels,
} from "../../shared/upgrades";

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

// The signal's numbers (window, red zone, setback) live in shared/mission.ts: the server keeps the signal.
