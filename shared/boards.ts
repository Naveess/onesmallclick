// The leaderboards (1g) and the profile (1j), phase 8b: what /api/leaderboard and /api/profile answer.

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
}

/** How many players the Players board lists. */
export const BOARD_TOP = 50;
