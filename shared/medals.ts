// The arrival medals (E4b, approved in E0): how fast the crew flies a leg, counted from the leg's launch.
// Gold within 25 days, Silver within 30, Bronze after that (content/campaign.json, "medalDays").
// Part 1 (prompts 49–50) only shows the pace on the game home; part 2 awards the medal at arrival,
// and should use medalFor() here so the two always agree.

import campaign from "../content/campaign.json";

export type Medal = "gold" | "silver" | "bronze";

export const MEDAL_NAMES: Record<Medal, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };

export const GOLD_DAYS: number = campaign.medalDays.gold;
export const SILVER_DAYS: number = campaign.medalDays.silver;

const DAY_MS = 86_400_000;

/** The medal for arriving `legDays` after the leg launched (fractional days). */
export function medalFor(legDays: number): Medal {
  return legDays <= GOLD_DAYS ? "gold" : legDays <= SILVER_DAYS ? "silver" : "bronze";
}

export interface MedalPace {
  /** The medal we're on pace for. */
  medal: Medal;
  /** The medal to aim for: Gold, or Silver once Gold is out of reach at this pace. */
  target: Medal;
  /** The latest arrival that still earns `target`. */
  targetBy: number;
  /** 0..1, how close we are to `target` (full once we're on pace for Gold). */
  bar: number;
  /** Days to shave off the estimate to reach `target`; 0 when on pace for Gold. */
  gapDays: number;
}

/** The pace line under the arrival estimate (the design's 1a/1b medal box). */
export function medalPace(legStartedAt: number, arrivalAt: number): MedalPace {
  const est = (arrivalAt - legStartedAt) / DAY_MS;
  const medal = medalFor(est);
  const target: Medal = medal === "bronze" ? "silver" : "gold";
  const targetDays = target === "gold" ? GOLD_DAYS : SILVER_DAYS;
  // The design's bar: full on Gold pace; from Silver it fills over the last 5 days to Gold; from Bronze, the 5 to Silver.
  const span = SILVER_DAYS - GOLD_DAYS;
  const bar = medal === "gold" ? 1 : Math.max(0, Math.min(1, (targetDays + span - est) / span));
  return {
    medal,
    target,
    targetBy: legStartedAt + targetDays * DAY_MS,
    bar,
    gapDays: medal === "gold" ? 0 : est - targetDays,
  };
}
