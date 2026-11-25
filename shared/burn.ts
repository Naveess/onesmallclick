// The landing burn (E4b part 2b, design 1o; docs/expansion.md, "The landing burn"; prompts 84-85).
//
// When the probe is an hour from arriving at today's pace, the burn starts and the landing time is fixed: the probe
// glides in at a steady speed and lands on time whatever happens. Meanwhile the crew's pushed km fill a bar:
// THRUST taps count double (for the bar only; credits and leaderboards are normal) plus the raw auto-thrust of
// everyone connected. Fill it and the landing is stuck (a gold-framed postcard); miss it and it's a rough landing,
// never a punishment. During the burn the signal can't run out, the probe can't idle-pause, and a vote that closes
// changes nothing about the landing.

/** How long the burn lasts, and how close (at today's pace) the arrival must be for it to start. */
export const BURN_MS = 60 * 60_000;
/** The crew's pushed km that stick the landing (fixed for every stop for now; revisit after launch). */
export const BURN_TARGET_KM = 2_000_000;
/** THRUST taps count this many times over towards the bar. */
export const BURN_TAP_MULTIPLIER = 2;

/** A burn in progress, as the probe sends it. Between updates the browser adds the connected auto-thrust. */
export interface BurnState {
  startedAt: number;
  /** When the probe lands, fixed when the burn starts. */
  landAt: number;
  target: number;
  /** The crew's burn km at `at`. */
  km: number;
  at: number;
  /** Everyone connected's raw auto-thrust (km/s), which keeps filling the bar. */
  autoKmS: number;
  /** When the bar filled, or null. */
  filledAt: number | null;
}

/** How a leg's landing burn went, saved with the leg at arrival. */
export interface BurnResult {
  km: number;
  target: number;
  ok: boolean;
  /** How long before landing the bar filled ("with 4 min 12 s to spare"), or null if it didn't. */
  spareMs: number | null;
}

/** The burn's km at `now` (the bar stops filling at the landing). */
export function burnKmAt(b: Pick<BurnState, "km" | "at" | "autoKmS" | "landAt">, now: number): number {
  return b.km + (b.autoKmS * Math.max(0, Math.min(now, b.landAt) - b.at)) / 1000;
}

/** "4 min 12 s", "38 s". */
export function spareText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}
