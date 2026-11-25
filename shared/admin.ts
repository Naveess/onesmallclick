// Phase A1a: the admin panel's types, used by the Worker (worker/admin.ts) and /admin.

export type AdminRole = "owner" | "moderator";

/** Who's using the panel. */
export interface AdminWho {
  email: string;
  role: AdminRole;
  /** When the admin session ends (12 hours after signing in). */
  expiresAt: number;
}

/** A player's key: "a:<account id>" for an account, or a guest's device id. */
export type PlayerKey = string;

export const isAccountKey = (key: string) => key.startsWith("a:");

/** One row in a search or a list. */
export interface PlayerRow {
  key: PlayerKey;
  kind: "account" | "guest";
  name: string;
  country: string | null;
  email: string | null;
  google: boolean;
  createdAt: number;
  lastSeen: number | null;
  kmToday: number;
  tapsToday: number;
}

export type PlayerList = "newest" | "active" | "top" | "changed";
export const PLAYER_LISTS: { id: PlayerList; label: string }[] = [
  { id: "active", label: "Most taps today" },
  { id: "top", label: "Top km today" },
  { id: "newest", label: "Newest" },
  { id: "changed", label: "Changed by an admin" },
];

export interface AdminLogItem {
  id: number;
  at: number;
  admin: string;
  action: string;
  target: string | null;
  reason: string | null;
  detail: string | null;
}

export interface AdminNote {
  id: number;
  at: number;
  admin: string;
  text: string;
}

/** Everything about one player, on one screen (A1a: read only; A1b adds the fixes). */
export interface PlayerDetail {
  key: PlayerKey;
  kind: "account" | "guest";
  profile: {
    name: string;
    nameChosen: boolean | null;
    country: string | null;
    countryChangedAt: number | null;
    email: string | null;
    google: boolean;
    createdAt: number;
    lastSeen: number | null;
    signupSource: string | null;
    crewCode: string | null;
    recruitedBy: { key: string; name: string | null; moment: string; channel: string; at: number } | null;
    recruits: { arrived: number; recruits: number };
    alerts: number;
  };
  /** The copy of their progress in D1 (the Probe saves it every few seconds while they play). */
  progress: {
    credits: number;
    levels: Record<string, number>;
    patches: number;
    kmSinceShift: number;
    savedAt: number;
  } | null;
  badges: { badge: string; name: string; at: number }[];
  legs: { missionId: number; stop: string | null; medal: string | null; km: number; taps: number }[];
  /** The last 30 days, newest first. */
  days: { day: string; km: number; taps: number; pinged: boolean }[];
  totals: { km: number; taps: number; pings: number; votes: number; feedback: number };
  devices: { id: string; name: string; country: string | null; createdAt: number; lastSeen: number }[];
  sessions: { count: number; lastCreated: number | null };
  log: AdminLogItem[];
  notes: AdminNote[];
}

/** The admin log's reasons and notes: plain text, this long at most. */
export const ADMIN_TEXT_MAX = 1000;
