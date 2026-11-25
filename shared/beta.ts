// The early-access period before launch (prompts 82-83): the banner, and the Early Beta badge, which goes to every
// account that's signed in before `endsAt` (guests are asked to sign in for it). Real time, not the probe's
// clock, so /admin's clock controls never end the beta early. The copy is in content/beta.json.

import beta from "../content/beta.json";

export const BETA = beta;

/** When the beta ends: the badge stops being given and the banner goes (epoch ms). */
export const BETA_ENDS_MS = Date.parse(beta.endsAt);

/** Is the early-access period still on at this real time? */
export function betaOpen(realNowMs: number): boolean {
  return realNowMs < BETA_ENDS_MS;
}

/** The launch wipe (phase B2): /admin needs this typed out to run it. */
export const LAUNCH_WIPE_PHRASE = "WIPE EVERYTHING";
