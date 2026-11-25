// Phase G1 (prompts 89-93): the sign-in nudges for guests. The copy is content/nudges.json.
// Each nudge's sign-in link carries ?from=<source>; the sign-in page keeps it in a short cookie (osc_from), and a
// brand-new account records it (accounts.signup_source), so /admin's Players card shows which nudge works.

import { withMiles } from "./units";
import nudges from "../content/nudges.json";

export const NUDGES = nudges;

/** Where a sign-up came from. "banner" is B1's early-access banner. */
export const NUDGE_SOURCES = ["chip", "ghost", "countries", "progress", "welcome", "credits", "profile", "banner"] as const;
export type NudgeSource = (typeof NUDGE_SOURCES)[number];

export function isNudgeSource(x: unknown): x is NudgeSource {
  return typeof x === "string" && (NUDGE_SOURCES as readonly string[]).includes(x);
}

/** The cookie the sign-in page sets for an hour, read when an account is made. */
export const SIGNUP_COOKIE = "osc_from";

/** {name} fill-ins. */
export function fillNudge(text: string, fill: Record<string, string | number>): string {
  // Phase M: a filled-in distance gets its miles ("You've pushed 1,234 km (767 miles)").
  return withMiles(text.replace(/\{(\w+)\}/g, (m, k: string) => (k in fill ? String(fill[k]) : m)));
}

/** Admin: sign-ups by source, and how guests turn into accounts. */
export interface PlayersReport {
  accounts: { total: number; day: number; week: number };
  devices: { total: number; newDay: number; activeDay: number };
  /** Players who pushed (at least one credited tap), per UTC day, the last 14 days, oldest first. */
  pushed: { day: string; players: number }[];
  /** New devices in the last 24 hours, by country, most first. */
  newByCountry: { cc: string | null; n: number }[];
  today: { shares: number; recruits: number };
  /** New accounts by where they came from (null: straight to the sign-in page, or before G1). */
  signups: { source: string | null; n: number }[];
  /** Of the devices that first played in the last 7 days, how many are now signed in. */
  conversion: { newPlayers: number; signedIn: number };
}
