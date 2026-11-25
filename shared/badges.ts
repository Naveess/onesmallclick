// The profile badges (phase 8b). Rules agreed with Nav in prompts 37–38; the click badges from the
// flight view phase (shared/clicks.ts) count all-time clicks (prompt 33).
// The server awards them (worker/probe.ts); the profile (1j) and the signal card show them.

import { CLICK_BADGES } from "./clicks";
import { BETA } from "./beta";
import { RECRUITER_LEVELS } from "./share";

export type BadgeId =
  | "first-ping"
  | "keeper-1"
  | "keeper-2"
  | "keeper-3"
  | "keeper-4"
  | "night-shift"
  | "voter-30"
  | "halfway"
  | "patch"
  | "clicks-1"
  | "clicks-2"
  | "clicks-3"
  | "recruit-1"
  | "recruit-2"
  | "recruit-3"
  | "early-beta";

/** A badge a player has, and when they earned it (epoch ms, the probe's clock). */
export interface EarnedBadge {
  id: BadgeId;
  at: number;
}

/** Signal Keeper I–IV: a ping streak of this many days (prompt 38). */
export const KEEPER_DAYS = [3, 7, 21, 30] as const;
export const KEEPER_IDS: BadgeId[] = ["keeper-1", "keeper-2", "keeper-3", "keeper-4"];
export const ROMAN = ["I", "II", "III", "IV"];

/** Night Shift: credited THRUST taps between 02:00 and 04:59, the player's local time. */
export const NIGHT_SHIFT_FROM_HOUR = 2;
export const NIGHT_SHIFT_TO_HOUR = 5; // exclusive

export const VOTER_ROUNDS = 30;

/* Halfway Crew: pushed at any point in a mission before the probe passed halfway (the leg's milestone marked
 * `halfway` in content/milestones/<stop>.json, from E3; on the Mars leg, 240 million km). */

export const CLICK_BADGE_IDS: BadgeId[] = ["clicks-1", "clicks-2", "clicks-3"];

/** Crew Recruiter I–III (phase S2): this many recruits (shared/share.ts RECRUITER_LEVELS). */
export const RECRUITER_IDS: BadgeId[] = ["recruit-1", "recruit-2", "recruit-3"];

/** The highest Crew Recruiter level (1–3) this many recruits reaches, or 0. */
export function recruiterLevel(recruits: number): number {
  return RECRUITER_LEVELS.filter((n) => recruits >= n).length;
}

/** What each badge is called and how it's earned, for the profile and the toast. */
export const BADGE_INFO: Record<BadgeId, { name: string; how: string }> = {
  "first-ping": { name: "First Ping", how: "Saved the signal once" },
  "keeper-1": { name: "Signal Keeper I", how: `${KEEPER_DAYS[0]}-day ping streak` },
  "keeper-2": { name: "Signal Keeper II", how: `${KEEPER_DAYS[1]}-day ping streak` },
  "keeper-3": { name: "Signal Keeper III", how: `${KEEPER_DAYS[2]}-day ping streak` },
  "keeper-4": { name: "Signal Keeper IV", how: `${KEEPER_DAYS[3]}-day ping streak` },
  "night-shift": { name: "Night Shift", how: "Pushed between 2 and 5 am" },
  "voter-30": { name: "Voter ×30", how: `${VOTER_ROUNDS} route votes` },
  halfway: { name: "Halfway Crew", how: "Pushed before halfway" },
  patch: { name: "Mission Patch", how: "Handed over the shift" },
  "clicks-1": { name: CLICK_BADGES[0].name, how: `${CLICK_BADGES[0].clicks.toLocaleString("en-GB")} clicks` },
  "clicks-2": { name: CLICK_BADGES[1].name, how: `${CLICK_BADGES[1].clicks.toLocaleString("en-GB")} clicks` },
  "clicks-3": { name: CLICK_BADGES[2].name, how: `${CLICK_BADGES[2].clicks.toLocaleString("en-GB")} clicks` },
  "recruit-1": { name: "Crew Recruiter I", how: "Brought in 1 new player" },
  "recruit-2": { name: "Crew Recruiter II", how: `Brought in ${RECRUITER_LEVELS[1]} new players` },
  "recruit-3": { name: "Crew Recruiter III", how: `Brought in ${RECRUITER_LEVELS[2]} new players` },
  "early-beta": { name: BETA.badgeName, how: BETA.badgeHow },
};

/** The highest Signal Keeper level (1–4) a streak of this many days reaches, or 0. */
export function keeperLevel(streakDays: number): number {
  return KEEPER_DAYS.filter((d) => streakDays >= d).length;
}

/** The longest run of consecutive UTC days in a list of "YYYY-MM-DD" days (any order). */
export function longestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const d of sorted) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev && t - prev === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}
