// The mission's balance (the retune, prompts 27 and 28; approved by Nav 2026-11-19): every number
// that sets how long a trip takes, in one place. shared/mission.ts re-exports them, the browser and
// the Worker both use them, and `npm run sim` prints what they add up to for different crowds.
// No imports, so any file can use this one.

/** Earth to Mars, as the design has it. */
export const ROUTE_KM = 480_000_000;

/** The probe coasts at this speed whenever it isn't paused (the design's number; the solar-wind fact relies on it). */
export const COAST_KM_S = 21;

// ---------- Self-balancing thrust (decision 4) ----------
// The crew's raw push R (km/s) is what everyone's taps, offline catch-ups and connected auto-thrust
// add up to over the last hour, before anything is adjusted. What it moves the shared probe:
//
//   crewSpeed(R) = CREW_TOP_KM_S × R / (R + CREW_HALF_KM_S)
//
// - A small crew is boosted: near R = 0, each crew km moves the probe CREW_TOP / CREW_HALF km (about 3.7).
// - It always grows with R (more players, more taps: always sooner), but each extra km/s adds less.
// - It never reaches CREW_TOP_KM_S, so with coasting no crowd beats FASTEST_DAYS.
// Your own km, credits and prestige progress are never touched by any of this.
// About 30 days for 35 players playing about 5 minutes a day (`npm run sim`).

/** The fastest trip with no votes. Even if "faster" wins every day's vote, it stays about 14 days. */
export const FASTEST_DAYS = 15.5;
/** The fastest the whole crew can push the probe (km/s, on top of coasting). */
export const CREW_TOP_KM_S = ROUTE_KM / (FASTEST_DAYS * 86_400) - COAST_KM_S;
/** The raw crew push (km/s) that moves the probe at half of CREW_TOP: sets the small crew's ~30 days. */
export const CREW_HALF_KM_S = 90;
/** The crew push is measured over the last hour, so one returning player's catch-up isn't squeezed. */
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

/** With no tap batch and no connected auto-thrust for this long, the probe stops and waits (the signal and any setback wait too). */
export const IDLE_PAUSE_MS = 8 * 3_600_000;

// ---------- Today's pace ----------

/**
 * The arrival date uses the probe's average speed over this much of its recent moving time, not the
 * last few minutes, so a short burst of taps doesn't swing it between "8 months" and "10 days".
 * Vote effects and setbacks are hours at this pace.
 */
export const TODAY_PACE_MS = 24 * 3_600_000;
/** Until the probe has moved for this long this mission, the pace is coasting plus the crew's live push. */
export const TODAY_PACE_MIN_MS = 10 * 60_000;

// ---------- The signal (decisions 7 and 8, setback retuned in prompt 28) ----------

/** A ping keeps the probe talking this long (48 hours at launch). */
export const SIGNAL_WINDOW_MS = 48 * 3_600_000;
/** In safe mode every quiet hour adds this many hours to the trip, at today's pace… */
export const SETBACK_HOURS_PER_QUIET_HOUR = 2;
/** …capped per outage. */
export const SETBACK_CAP_MS = 24 * 3_600_000;

// ---------- The daily vote ----------
// Each option's `hours` in content/vote-options.json are hours at today's pace (1 to 4 hours since the retune).
