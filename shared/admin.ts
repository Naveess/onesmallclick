// Phase A1a: the admin panel's types, used by the Worker (worker/admin.ts) and /admin.

import { BADGE_INFO, type BadgeId } from "./badges";
import { UPGRADES } from "./upgrades";

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

// ---------- Phase A1b-2: compare a save state with now, restore ticked parts, merge and move ----------

/** GET /api/admin/save-state: a save state and the player as they are now (with the same day's km, for "today"). */
export interface StateCompare {
  snapshot: SnapshotItem;
  then: PlayerState;
  now: PlayerState;
}

/** One part of a comparison: what changed between the save state and now. */
export interface PartDiff {
  part: StatePart;
  label: string;
  changed: boolean;
  lines: string[];
}

const fmt = (n: number) => Math.floor(n).toLocaleString("en-GB");
const sum = (rows: DayRow[], f: (r: DayRow) => number) => rows.reduce((t, r) => t + f(r), 0);

/** The save state against now, part by part, e.g. "credits 3,100 → 12,400". */
export function diffStates(then: PlayerState, now: PlayerState): PartDiff[] {
  const a = then.progress;
  const b = now.progress;
  const out: PartDiff[] = [];
  const add = (part: StatePart, label: string, lines: string[]) => out.push({ part, label, changed: lines.length > 0, lines });
  const arrow = (what: string, x: string, y: string) => (x === y ? [] : [`${what} ${x} → ${y}`]);

  add("credits", "Credits", arrow("credits", fmt((a?.creditsMilli ?? 0) / 1000), fmt((b?.creditsMilli ?? 0) / 1000)));
  add(
    "upgrades",
    "Upgrades",
    UPGRADES.flatMap((u) => arrow(u.name, String(a?.levels[u.key] ?? 0), String(b?.levels[u.key] ?? 0))),
  );
  add("prestige", "Patches (prestige)", [
    ...arrow("patches", String(a?.patches ?? 0), String(b?.patches ?? 0)),
    ...arrow("km towards the next handover", fmt(a?.kmSinceShift ?? 0), fmt(b?.kmSinceShift ?? 0)),
  ]);
  const day = then.today.day;
  add("today", `Km and taps on ${day}`, [
    ...arrow("km", fmt(sum(then.today.rows, (r) => r.km)), fmt(sum(now.today.rows, (r) => r.km))),
    ...arrow("taps", fmt(sum(then.today.rows, (r) => r.taps)), fmt(sum(now.today.rows, (r) => r.taps))),
  ]);
  const badge = (id: string) => BADGE_INFO[id as BadgeId]?.name ?? id;
  const had = new Set(then.badges.map((x) => x.badge));
  const has = new Set(now.badges.map((x) => x.badge));
  add("badges", "Badges", [
    ...[...had].filter((x) => !has.has(x)).map((x) => `${badge(x)}: in the save state, not now`),
    ...[...has].filter((x) => !had.has(x)).map((x) => `${badge(x)}: now, not in the save state`),
  ]);
  const legsThen = new Map(then.crew.map((c) => [c.missionId, c]));
  const legsNow = new Map(now.crew.map((c) => [c.missionId, c]));
  add("crew", "Crew credit for legs", [
    ...[...legsThen.keys()].filter((m) => !legsNow.has(m)).map((m) => `leg ${m}: crewed in the save state, not now`),
    ...[...legsNow.keys()].filter((m) => !legsThen.has(m)).map((m) => `leg ${m}: crewed now, not in the save state`),
    ...[...legsThen].filter(([m, c]) => legsNow.has(m) && legsNow.get(m)!.km !== c.km).map(([m, c]) => `leg ${m} km ${fmt(c.km)} → ${fmt(legsNow.get(m)!.km)}`),
  ]);
  add("name", "Name", arrow("name", then.profile.name, now.profile.name));
  add("country", "Country", arrow("country", then.profile.country ?? "none", now.profile.country ?? "none"));
  return out;
}

/** The parts a merge changes on the account (and puts back on both, if it's undone). */
export const MERGE_PARTS: StatePart[] = ["credits", "upgrades", "prestige", "badges", "crew"];

// ---------- Phase A1c-1: game save states ----------

/** A copy of the Probe's game tables (not players' progress, not the outboxes): the probe, the leg, the clock, the
 *  signal, the vote, the landing burn, milestones, pace and the crew goal. One gzipped file under game/ in R2. */
export interface GameDump {
  v: 1;
  at: number;
  /** The probe's clock when it was taken (real time plus the test offset). */
  probeNow: number;
  tables: Record<string, Record<string, string | number | null>[]>;
}

/** The words typed to restore the probe from a game save state. */
export const GAME_RESTORE_PHRASE = "RESTORE THE PROBE";

/** GET /api/admin/game-states: the game's save states, and the group files of player save states. */
export interface GameStatesList {
  game: SnapshotItem[];
  groups: { file: string; reason: string; at: number; players: number }[];
  restores: AdminLogItem[];
}

/** GET /api/admin/game-state: one game save state and the game now. */
export interface GameCompare {
  snapshot: SnapshotItem;
  then: GameDump;
  now: GameDump;
}

/** The parts of a game save state worth reading at a glance. */
export function summarizeGame(d: GameDump) {
  const missions = [...(d.tables.mission ?? [])].sort((a, b) => Number(a.id) - Number(b.id));
  const m = missions[missions.length - 1] ?? {};
  const vote = [...(d.tables.vote_round ?? [])].sort((a, b) => Number(a.opened_at) - Number(b.opened_at)).pop() ?? {};
  const meta = new Map((d.tables.meta ?? []).map((r) => [String(r.key), Number(r.value)]));
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    missionId: n(m.id),
    leg: `${m.from_stop ?? "earth"} → ${m.stop ?? "mars"}`,
    distanceKm: n(m.distance_km) ?? 0,
    legKm: n(m.leg_km),
    arrivedAt: n(m.arrived_at),
    signalDeadline: n(m.signal_deadline),
    safeSince: n(m.safe_since),
    pausedSince: n(m.paused_since),
    burnStartedAt: n(m.burn_started_at),
    clockOffsetH: (meta.get("clock_offset_ms") ?? 0) / 3_600_000,
    voteRound: vote.round === undefined ? null : String(vote.round),
    voteClosesAt: n(vote.closes_at),
    voteWinner: n(vote.winner),
    milestones: (d.tables.milestone_reached ?? []).filter((r) => r.mission_id === m.id).length,
    legsArrived: missions.filter((r) => r.arrived_at !== null && r.arrived_at !== undefined).length,
  };
}

/** A game save state against now, line by line, e.g. "distance 41,200,000 → 43,000,000 km". */
export function diffGame(then: GameDump, now: GameDump): string[] {
  const a = summarizeGame(then);
  const b = summarizeGame(now);
  const t = (ms: number | null) => (ms === null ? "none" : new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC");
  const out: string[] = [];
  const line = (what: string, x: string, y: string) => {
    if (x !== y) out.push(`${what}: ${x} → ${y}`);
  };
  line("leg", `${a.missionId} (${a.leg})`, `${b.missionId} (${b.leg})`);
  line("distance", `${fmt(a.distanceKm)} km`, `${fmt(b.distanceKm)} km`);
  line("arrived", t(a.arrivedAt), t(b.arrivedAt));
  line("signal deadline", t(a.signalDeadline), t(b.signalDeadline));
  line("safe mode since", t(a.safeSince), t(b.safeSince));
  line("idle since", t(a.pausedSince), t(b.pausedSince));
  line("landing burn started", t(a.burnStartedAt), t(b.burnStartedAt));
  line("test clock offset", `${a.clockOffsetH.toFixed(1)} h`, `${b.clockOffsetH.toFixed(1)} h`);
  line("vote round", a.voteRound ?? "none", b.voteRound ?? "none");
  line("vote closes", t(a.voteClosesAt), t(b.voteClosesAt));
  line("milestones this leg", String(a.milestones), String(b.milestones));
  line("legs arrived", String(a.legsArrived), String(b.legsArrived));
  return out;
}
