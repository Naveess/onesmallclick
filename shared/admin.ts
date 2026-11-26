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
  /** Phase A1b: name changes (recorded from A1b on), their save states, and the arrived legs crew credit can name. */
  nameHistory: { at: number; oldName: string | null; newName: string; by: string }[];
  snapshots: SnapshotItem[];
  arrivedLegs: { missionId: number; stop: string | null }[];
}

// ---------- Phase A1b: save states and fixes ----------

/** One save state in the index (the file is gzipped JSON in R2). */
export interface SnapshotItem {
  id: number;
  at: number;
  reason: string;
  admin: string | null;
  bytes: number;
}

/** A player's progress as a save state holds it (credits in thousandths, as the Probe keeps them). */
export interface ProgressState {
  creditsMilli: number;
  levels: Record<string, number>;
  patches: number;
  kmSinceShift: number;
}

/** One daily_km row (a device's day). */
export interface DayRow {
  deviceId: string;
  accountId: string | null;
  km: number;
  tapKm: number;
  tapMovedKm: number;
  taps: number;
}

/** One player's save state: everything a fix can change, so any fix can be undone. */
export interface PlayerState {
  v: 1;
  key: PlayerKey;
  at: number;
  kind: "account" | "guest";
  profile: { name: string; nameChosen: boolean | null; country: string | null; countryChangedAt: number | null };
  progress: ProgressState | null;
  badges: { badge: string; at: number }[];
  crew: { missionId: number; accountId: string | null; name: string | null; country: string | null; km: number; taps: number }[];
  /** Today's km and taps (by the probe's clock), per device. */
  today: { day: string; rows: DayRow[] };
}

/** The parts of a save state a restore (or an undo) can put back. */
export type StatePart = "credits" | "upgrades" | "prestige" | "today" | "badges" | "crew" | "name" | "country";
export const STATE_PARTS: { id: StatePart; label: string }[] = [
  { id: "credits", label: "Credits" },
  { id: "upgrades", label: "Upgrades" },
  { id: "prestige", label: "Patches (prestige)" },
  { id: "today", label: "Today's km and taps" },
  { id: "badges", label: "Badges" },
  { id: "crew", label: "Crew credit for legs" },
  { id: "name", label: "Name" },
  { id: "country", label: "Country" },
];

/** Every fix the player page offers (owner only). Each needs a reason and saves a save state first. */
export type Fix =
  | { kind: "reset"; parts: ("credits" | "upgrades" | "prestige" | "today" | "badges" | "crew")[] }
  | { kind: "set"; credits?: number; levels?: Record<string, number>; patches?: number }
  | { kind: "badge"; badge: string; on: boolean }
  | { kind: "crew"; missionId: number; on: boolean; km?: number }
  | { kind: "name"; name: string; lock: boolean }
  | { kind: "country"; country: string | null; clearCooldown: boolean }
  | { kind: "signout" }
  | { kind: "delete" };

export type FixKind = Fix["kind"];

/** Fixes that also ask for the player's name typed out (they're destructive), as an undo does. */
export const CONFIRM_FIXES: FixKind[] = ["reset", "delete"];

/** What each fix can change: an undo puts back these parts of the save state taken before it. */
export function fixParts(fix: Fix): StatePart[] {
  switch (fix.kind) {
    case "reset":
      return fix.parts;
    case "set":
      return [
        ...(fix.credits !== undefined ? (["credits"] as const) : []),
        ...(fix.levels ? (["upgrades"] as const) : []),
        ...(fix.patches !== undefined ? (["prestige"] as const) : []),
      ];
    case "badge":
      return ["badges"];
    case "crew":
      return ["crew"];
    case "name":
      return ["name"];
    case "country":
      return ["country"];
    default:
      return [];
  }
}

/** A name an admin types by hand: lower-case letters, digits and underscores, 3–24 long. */
export const isAdminName = (name: string) => /^[a-z0-9_]{3,24}$/.test(name);

/** The admin log's reasons and notes: plain text, this long at most. */
export const ADMIN_TEXT_MAX = 1000;
