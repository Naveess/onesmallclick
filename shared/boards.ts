// The leaderboards (1g) and the profile (1j), phase 8b: what /api/leaderboard and /api/profile answer.

import type { BurnResult } from "./burn";
import type { Medal } from "./medals";

export type Board = "players" | "countries";

export interface BoardRow {
  /** 1 = top. Null for your own row when you're not on the board yet. */
  rank: number | null;
  /** Two-letter country code (ISO 3166-1), or null if unknown. */
  cc: string | null;
  /** A player's crew name; for countries, the country code (the app shows its name). */
  name: string;
  /** Km pushed today (UTC). */
  km: number;
}

export interface BoardResult {
  board: Board;
  /** The UTC day the board is for. */
  day: string;
  /** The top of the board, highest first. */
  rows: BoardRow[];
  /** Your row: you (players) or your country (countries). */
  me: BoardRow | null;
  /** Only signed-in players are on the Players board. */
  signedIn: boolean;
  /** A guest's rank on the Players board if they signed in (phase G1's ghost row), or null. */
  ghostRank?: number | null;
}

export interface ProfileInfo {
  name: string;
  country: string | null;
  /** When this player first played (epoch ms): "Crew since day N". */
  joinedAt: number;
  /** All the km you've pushed, every mission. */
  totalKm: number;
  /** The UTC days you pinged in the last 30 days (today included). */
  pingDays: string[];
  /** The 30 UTC days of the ping grid, oldest first, ending today. */
  days: string[];
  signedIn: boolean;
  /** Phase S2: new players who came through your crew link and played, and the km they've pushed since. */
  recruits: number;
  recruitKm: number;
}

/** How many players the Players board lists. */
export const BOARD_TOP = 50;

/** The mission credits for one leg (phase 8c): GET /api/credits?mission=<id>. */
/** One leg the crew has flown (E1, the campaign map): GET /api/tour. */
export interface TourLeg {
  missionId: number;
  stop: string;
  fromStop: string;
  startedAt: number;
  arrivedAt: number;
  /** The branch vote's winner at this stop, if it had one. */
  branch: string | null;
  /** You pushed on this leg (at least one credited tap): your passport stamp, in the medal's colour. */
  helped: boolean;
  /** The crew's medal for the leg (E4b part 2a), saved at arrival. */
  medal: Medal;
}

export interface TourInfo {
  legs: TourLeg[];
}

export interface CreditsInfo {
  missionId: number;
  stop: string;
  fromStop: string;
  startedAt: number;
  arrivedAt: number;
  /** Everyone who helped (at least one credited tap), guests included. */
  crew: number;
  taps: number;
  /** Signed-in crew who helped, most km first: every name (prompt 46). */
  names: { name: string; cc: string | null; km: number }[];
  /** Guests who helped, counted but not named. */
  guests: number;
  /** The crew's medal for the leg (E4b part 2a). */
  medal: Medal;
  /** How its landing burn went (E4b part 2b), or null for legs before it. */
  burn: BurnResult | null;
}
