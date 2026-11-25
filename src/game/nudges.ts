// Phase G1: the sign-in nudges' rules in the browser (docs/plan.md, "G: Grow").
// - Guests only; never blocks play; every nudge can be put away for the day.
// - At most one toast nudge a day, shared with G2's share nudge.
// - Days are UTC, like the rest of the game. Storage can fail (private mode): then nothing is remembered,
//   and the toast budget falls back to once per page load.

import { BETA, betaOpen } from "../../shared/beta";
import { NUDGES, SIGNUP_COOKIE, fillNudge, isNudgeSource, type NudgeSource } from "../../shared/nudges";

export { NUDGES, fillNudge };

const utcDay = () => new Date().toISOString().slice(0, 10);
let toastThisLoad = false;

/** The sign-in page with where the player came from. */
export function signInHref(from: NudgeSource): string {
  return `/sign-in?from=${from}`;
}

/** "Sign in with Google" while email sign-in is off (until the domain is in Email Service). */
export function ctaLabel(emailSignIn: boolean): string {
  return emailSignIn ? NUDGES.cta : NUDGES.ctaGoogle;
}

/** The Early Beta lines show until launch (content/beta.json endsAt). */
export function betaLine(): boolean {
  return betaOpen(Date.now());
}

export const LAUNCH = { launch: BETA.launchShort };

/** This nudge was put away today. */
export function dismissedToday(id: string): boolean {
  try {
    return localStorage.getItem(`osc.nudge.${id}`) === utcDay();
  } catch {
    return false;
  }
}

/** Put this nudge away until tomorrow (UTC). */
export function dismissForToday(id: string) {
  try {
    localStorage.setItem(`osc.nudge.${id}`, utcDay());
  } catch {
    // storage blocked: shown again next load
  }
}

/** The day's one toast nudge has been used (by any nudge). */
export function toastNudgeUsed(): boolean {
  return toastThisLoad || dismissedToday("toast");
}

export function spendToastNudge() {
  toastThisLoad = true;
  dismissForToday("toast");
}

/** On the sign-in page: keep ?from= for an hour in a cookie, so the new account records it (accounts.signup_source). */
export function rememberSignupSource(search: string) {
  const from = new URLSearchParams(search).get("from");
  if (!isNudgeSource(from)) return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIGNUP_COOKIE}=${from}; Max-Age=3600; Path=/; SameSite=Lax${secure}`;
}
