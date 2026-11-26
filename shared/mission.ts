// Shared by the browser (src/) and the Worker (worker/): the mission's fixed numbers
// and the messages that go over the probe's WebSocket. No DOM or Worker APIs here.

import type { CrewGoal } from "./goal";
import type { BurnResult, BurnState } from "./burn";
import type { Progress, UpgradeKey, WelcomeBack } from "./upgrades";
import type { LiveVote } from "./votes";
import type { ReachedMilestone } from "./milestones";
import type { BadgeId, EarnedBadge } from "./badges";
import type { CrewTech } from "./tech";
import { SETBACK_CAP_MS, SETBACK_HOURS_PER_QUIET_HOUR } from "./balance";

// Every number that sets the trip's length lives in shared/balance.ts (the retune); these are re-exported.
export {
  COAST_KM_S,
  CREW_WINDOW_MIN,
  IDLE_PAUSE_MS,
  ROUTE_KM,
  SETBACK_CAP_MS,
  SETBACK_HOURS_PER_QUIET_HOUR,
  SIGNAL_WINDOW_MS,
  crewFactor,
  crewSpeed,
} from "./balance";

/** Km per tap with no upgrades (shared/upgrades.ts has the formula). */
export const BASE_TAP_KM = 4;

/** The fastest a device can tap. Above human speed, so only scripts hit it. */
export const MAX_TAPS_PER_S = 15;

/** How often the browser sends its tap count. */
export const BATCH_MS = 2_000;

/** The browser says "ping" this often; Cloudflare answers "pong" without waking the probe. */
export const HEARTBEAT_MS = 30_000;
export const HEARTBEAT_PING = "ping";
export const HEARTBEAT_PONG = "pong";
/** A socket silent this long is treated as gone (a phone that lost signal), even if it never closed. */
export const DEAD_SOCKET_MS = 90_000;
/** A device's `last_seen` in D1 is rewritten at most this often (phase 9a: storage is billed by rows written). */
export const LAST_SEEN_EVERY_MS = 3_600_000;

/** Crew pace is the tap km of the last few minutes, averaged. */
export const PACE_WINDOW_MIN = 5;

// ---------- The signal (phase 5) ----------

/** The final stretch: the countdown pulses and a ping earns the red badge. */
export const SIGNAL_URGENT_S = 60;
/** The signal's "final hour" (phase Q1b: the Discord post and the notification). */
export const SIGNAL_FINAL_HOUR_MS = 3_600_000;
/** Under this much time left, a ping earns the orange badge. */
export const SIGNAL_ORANGE_S = 6 * 3600;
export type BadgeTier = "blue" | "orange" | "red";

/** The badge a ping earns, from the time that was left. Waking the probe from safe mode earns red. */
export function tierFor(secondsLeft: number): BadgeTier {
  if (secondsLeft <= SIGNAL_URGENT_S) return "red";
  if (secondsLeft < SIGNAL_ORANGE_S) return "orange";
  return "blue";
}

/**
 * The probe's own clock: it stands still while the probe is paused (decision 5), so the signal
 * timer and any setback wait with it.
 */
export function probeClock(p: { pausedSince: number | null }, now: number): number {
  return p.pausedSince ?? now;
}

/** How much later the probe arrives because of the current outage, in ms of travel at today's pace. Pass the probe's clock. */
export function setbackMs(safeSince: number | null, now: number): number {
  if (safeSince === null) return 0;
  return Math.min(SETBACK_CAP_MS, Math.max(0, now - safeSince) * SETBACK_HOURS_PER_QUIET_HOUR);
}

/** What everyone sees. Times are the server's clock (epoch ms). */
/** An arrival, as the arrival screen needs it: the leg, when, and how its landing burn went (E4b part 2b). */
export interface ArrivalInfo {
  missionId: number;
  stop: string;
  /** Where the leg started (for its probe), when known. */
  fromStop?: string;
  at: number;
  burn?: BurnResult | null;
}

export interface ProbeSnapshot {
  missionId: number;
  destination: string;
  /** This leg of the Grand Tour (phase 8c): where it's heading and where it started (content/campaign.json ids). */
  stop: string;
  fromStop: string;
  /** When the probe reached `stop`, or null on the way. In orbit it waits there for the branch vote. */
  arrivedAt: number | null;
  /** The latest arrival this tour (this leg's in orbit, or the last one), so everyone sees its arrival screen once. */
  lastArrival: ArrivalInfo | null;
  /** The landing burn in progress (E4b part 2b), or null. */
  burn?: BurnState | null;
  /** The crew's planet tech from the legs arrived at this tour (E4b part 2a; shared/tech.ts). */
  tech?: CrewTech;
  missionStartedAt: number;
  routeKm: number;
  /** Distance at `at`. Between updates the browser adds coasting and auto-thrust (distanceAt). */
  distanceKm: number;
  at: number;
  /** COAST_KM_S, or 0 while the probe is paused. */
  coastKmS: number;
  /** Everyone connected's auto-thrust, as it moves the shared probe (self-balanced): it moves the probe continuously. */
  autoKmS: number;
  /** What the crew adds right now (taps over the last PACE_WINDOW_MIN minutes, plus auto-thrust), as it moves the probe. */
  crewKmS: number;
  /** How far each crew km moves the shared probe (shared/balance.ts): above 1 for a small crew, below 1 for a big one. */
  crewFactor: number;
  /** Today's pace: the probe's average speed over its last 24 hours of moving (the arrival date, vote effects and setbacks use it). */
  paceKmS: number;
  /** When the probe paused for lack of players (decision 5), or null while it's moving. */
  pausedSince: number | null;
  /** Devices connected right now (several tabs on one device count once). */
  online: number;
  /** Devices away within the last 8 hours whose thrusters are still earning ("+N thrusters idling"). */
  idling: number;
  /** When the signal runs out unless someone pings. */
  signalDeadline: number;
  /** When safe mode began, or null while the probe is talking. */
  safeSince: number | null;
  /** Today's crew vote with live tallies (phase 7a). */
  vote: LiveVote;
  /** The newest mission log entry's id, so the log page knows when to reload. */
  logId: number;
  /** Milestones this mission has reached (phase 7b). */
  milestones: ReachedMilestone[];
  /** Today's crew goal (phase Q1a, shared/goal.ts), or null before it's set. */
  goal?: CrewGoal | null;
  /** Maintenance mode (phase A1c-2): the game is frozen and everyone sees the message, or null. */
  maintenance?: MaintenanceInfo | null;
}

/** Maintenance mode (phase A1c-2): since when (the probe's clock) and the banner's message. */
export interface MaintenanceInfo {
  since: number;
  message: string;
}

/** The banner's message unless /admin writes another. */
export const MAINTENANCE_MESSAGE = "Mission control is fixing something. Back soon.";
export const MAINTENANCE_MESSAGE_MAX = 200;

/** This device's own numbers for today (UTC). */
export interface DeviceToday {
  kmToday: number;
  tapKmToday: number;
  /** What this device's taps moved the shared probe today, after balancing ("your taps today got us there X sooner"). */
  tapMovedToday: number;
  /** THRUST taps the server credited today (UTC) and in all time: capped and safe-mode taps don't count ("You've clicked"). */
  tapsToday: number;
  tapsAll: number;
  /** The badges this player has (phase 8b). */
  badges: EarnedBadge[];
  pingedToday: boolean;
  /** Consecutive days with a ping, up to today or yesterday. */
  pingStreakDays: number;
  /** This device's vote in the current round, if any. */
  vote: { round: string; option: number } | null;
}

/** What POST /api/ping answers. */
export type PingResult =
  | {
      ok: true;
      tier: BadgeTier;
      secondsLeft: number;
      /** True when this ping woke the probe from safe mode. */
      woke: boolean;
      /** The setback made permanent by waking it, in ms of travel. */
      setbackMs: number;
      pingStreakDays: number;
    }
  | { ok: false; reason: "already-pinged" | "just-saved" | "bot-check" | "busy-network" | "no-device" | "unavailable" | "maintenance" | "paused" };

/** Browser → server. */
export type ClientMessage =
  | { t: "taps"; n: number; seq: number }
  | { t: "buy"; key: UpgradeKey; seq: number }
  | { t: "prestige"; seq: number };

/** Server → browser. `me` is this device's idle game at `now`. */
export type ServerMessage =
  | ({ t: "hello"; now: number; probe: ProbeSnapshot; me: Progress; welcome: WelcomeBack | null } & DeviceToday)
  | { t: "state"; now: number; probe: ProbeSnapshot }
  /** New badges for this player (phase 8b): the ones just earned, and the full list. */
  | { t: "badges"; now: number; earned: BadgeId[]; badges: EarnedBadge[] }
  | ({ t: "credited"; seq: number; taps: number; km: number; now: number; probe: ProbeSnapshot; me: Progress } & DeviceToday)
  /** The answer to a buy or a handover: refused when it isn't affordable (or unlocked). */
  | { t: "me"; seq: number; ok: boolean; now: number; me: Progress }
  /** The crew goal's bonus for a day it was reached (phase Q1a), paid at the next 00:00 UTC. */
  | { t: "bonus"; now: number; day: string; credits: number };

/** The /admin page's view of the probe. */
export interface AdminState {
  probe: ProbeSnapshot;
  /** The current outage's setback so far (ms of travel). */
  setbackMs: number;
  serverNow: number;
  clockOffsetMs: number;
  sockets: number;
  lastSavedAt: number;
  lastD1FlushAt: number;
  /** Rows written since the probe last started (real ms `since`): its own SQLite and the D1 flush. Storage is billed by these (phase 9a). */
  rowsWritten: { since: number; sqlite: number; d1: number };
  /** The crew's raw push before balancing: taps and catch-ups over the last hour, and connected auto-thrust (km/s). */
  crewRawKmS: number;
  autoRawKmS: number;
  /** The last tap batch or connected auto-thrust, and when the probe pauses if nothing happens (null: it can't while auto-thrust is connected, or it's paused). */
  lastActiveAt: number;
  pausesAt: number | null;
  /** Devices with saved progress. */
  players: number;
  /** The Discord bot (phase Q1b-1): is a webhook set, how many posts wait, and the latest posts. */
  discord: { webhook: boolean; pending: number; recent: { id: number; at: number; title: string; text: string; sentAt: number | null; note: string | null }[] };
}

/** Where a probe is at a given server time: the last known distance plus coasting and auto-thrust since. */
export function distanceAt(
  p: Pick<ProbeSnapshot, "distanceKm" | "at" | "coastKmS" | "routeKm"> & { autoKmS?: number },
  now: number,
): number {
  return Math.min(p.routeKm, p.distanceKm + ((p.coastKmS + (p.autoKmS ?? 0)) * Math.max(0, now - p.at)) / 1000);
}

/**
 * The arrival estimate: what's left at today's pace, plus the current outage's setback.
 * Null while the probe is paused (the screen shows "on hold").
 */
export function arrivalAt(
  p: Pick<ProbeSnapshot, "routeKm" | "paceKmS" | "pausedSince" | "safeSince">,
  distanceKm: number,
  now: number,
): number | null {
  if (p.pausedSince !== null) return null;
  const toGo = Math.max(0, p.routeKm - distanceKm);
  return now + (toGo / Math.max(1, p.paceKmS)) * 1000 + setbackMs(p.safeSince, now);
}

/** The UTC day, as YYYY-MM-DD. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
