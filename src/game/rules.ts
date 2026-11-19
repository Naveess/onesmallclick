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

// The six milestones (phase 7b) are content: content/milestones.json, via shared/milestones.ts.
export { MILESTONES, MILESTONE_COUNT, type Milestone } from "../../shared/milestones";

// The signal's numbers (window, red zone, setback) live in shared/mission.ts: the server keeps the signal.
