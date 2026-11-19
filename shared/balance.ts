// The mission's balance (the retune, prompt 27): every number that sets how long a trip takes.
// PROPOSED, waiting for Nav's OK. Only `npm run sim` uses this file so far; the game still runs on
// the phase 6 ceiling in shared/mission.ts until it's approved and built.

import { COAST_KM_S, ROUTE_KM } from "./mission";

export { COAST_KM_S, ROUTE_KM };

// ---------- Self-balancing thrust ----------
// The crew's raw push R (km/s) is what everyone's taps, catch-ups and connected auto-thrust add up to
// over the last hour, before anything is squeezed. What it moves the shared probe:
//
//   crewSpeed(R) = CREW_TOP_KM_S × R / (R + CREW_HALF_KM_S)
//
// - A small crew is boosted: at R near 0, each crew km moves the probe CREW_TOP / CREW_HALF km.
// - It always grows with R (more players, more taps: always sooner), but each extra km/s adds less.
// - It never reaches CREW_TOP_KM_S, so with coasting the probe is never faster than
//   COAST + CREW_TOP: the 14-day floor holds however big the crowd.
// Your own km, credits and prestige progress are never touched by any of this.

/** The fastest the whole crew can push the probe (km/s, on top of coasting): sets the 14-day floor. */
export const CREW_TOP_KM_S = ROUTE_KM / (14 * 86_400) - COAST_KM_S;
/** The raw crew push (km/s) that moves the probe at half of CREW_TOP: sets the small crew's ~30 days. */
export const CREW_HALF_KM_S = 110;
/** The crew push is measured over the last hour. */
export const CREW_WINDOW_MIN = 60;

/** The crew's raw push (km/s, last hour) → what actually moves the probe (km/s). */
export function crewSpeed(raw: number): number {
  if (raw <= 0) return 0;
  return (CREW_TOP_KM_S * raw) / (raw + CREW_HALF_KM_S);
}

/** How far each crew km moves the shared probe right now: above 1 for a small crew, below 1 for a big one. */
export function crewFactor(raw: number): number {
  return CREW_TOP_KM_S / (Math.max(0, raw) + CREW_HALF_KM_S);
}

// ---------- The idle pause (decision 5) ----------

/** With no tap batch and no connected auto-thrust for this long, the probe stops and waits. */
export const IDLE_PAUSE_MS = 8 * 3_600_000;
