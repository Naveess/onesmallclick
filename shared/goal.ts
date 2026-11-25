// Phase Q1a (prompt 105, decision 30): the daily crew goal. Both the app and the Worker use this file.
// At 00:00 UTC the Probe sets today's target from recent pace: 1.2× the median of the last 7 days' crew km
// (the median, so one spike day doesn't put the goal out of reach), rounded to 2 significant figures, never
// under GOAL_FLOOR_KM. When the crew reaches it, everyone who pushed that day gets 10% of their km that day
// as credits, capped at GOAL_BONUS_CAP, paid once at the next 00:00 UTC. It never touches trip speed.

export const GOAL_FLOOR_KM = 20_000;
export const GOAL_MULTIPLIER = 1.2;
export const GOAL_DAYS = 7;
export const GOAL_BONUS_SHARE = 0.1;
export const GOAL_BONUS_CAP = 1_000;

/** Today's crew goal, as everyone sees it (in the probe snapshot). */
export interface CrewGoal {
  /** The UTC day it's for (YYYY-MM-DD). */
  day: string;
  targetKm: number;
  /** The crew's km today so far (every player's taps and auto-thrust, in full, as on the leaderboard). */
  km: number;
  /** When the crew reached it, or null. */
  reachedAt: number | null;
}

/** 2 significant figures: 16,723 → 17,000; 1,234,567 → 1,200,000. */
export function roundNice(km: number): number {
  if (km <= 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(km)) - 1);
  return Math.round(km / p) * p;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The target from the last GOAL_DAYS days' crew km (days with nobody pushing count as 0). */
export function goalTarget(lastDays: number[]): number {
  const days = [...lastDays.slice(-GOAL_DAYS)];
  while (days.length < GOAL_DAYS) days.unshift(0);
  return Math.max(GOAL_FLOOR_KM, roundNice(GOAL_MULTIPLIER * median(days)));
}

/** One player's bonus in credits for a day the goal was reached. */
export function goalBonus(kmThatDay: number): number {
  return Math.min(GOAL_BONUS_CAP, Math.floor(Math.max(0, kmThatDay) * GOAL_BONUS_SHARE));
}
