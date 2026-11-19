// Shared by the browser (src/) and the Worker (worker/): the mission's fixed numbers
// and the messages that go over the probe's WebSocket. No DOM or Worker APIs here.

import type { Progress, UpgradeKey, WelcomeBack } from "./upgrades";
import type { LiveVote } from "./votes";
import type { ReachedMilestone } from "./milestones";

/** Earth to Mars, as the design has it. */
export const ROUTE_KM = 480_000_000;

/** The probe always coasts at this speed, even with nobody tapping (decision 5). */
export const COAST_KM_S = 21;

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

/** Crew pace is the tap km of the last few minutes, averaged. */
export const PACE_WINDOW_MIN = 5;

// ---------- The crew-speed ceiling (phase 6) ----------
// Everyone's own km and credits always count in full. What the crew adds to the SHARED probe
// counts in full up to CREW_FULL_KM_S (the design's busy crew, about 6 months to Mars), then
// flattens towards CREW_CEILING_KM_S, so the fastest trip is about 4½ months however big the crew.

export const CREW_FULL_KM_S = 10;
export const CREW_CEILING_KM_S = 21;
/** The ceiling looks at the last hour, so one returning player's offline catch-up isn't squeezed. */
export const CEILING_WINDOW_MIN = 60;

/** The crew's raw push (km/s) → what actually moves the probe. */
export function crewEffective(raw: number): number {
  if (raw <= CREW_FULL_KM_S) return Math.max(0, raw);
  const room = CREW_CEILING_KM_S - CREW_FULL_KM_S;
  const over = raw - CREW_FULL_KM_S;
  return CREW_FULL_KM_S + (room * over) / (over + room);
}

/** The share of each crew km that moves the shared probe right now (1 below the ceiling's knee). */
export function crewFactor(raw: number): number {
  return raw <= CREW_FULL_KM_S ? 1 : crewEffective(raw) / raw;
}

// ---------- The signal (phase 5) ----------

/** A ping keeps the probe talking this long (decision 7: 48 hours at launch). */
export const SIGNAL_WINDOW_MS = 48 * 3_600_000;
/** The final stretch: the countdown pulses and a ping earns the red badge. */
export const SIGNAL_URGENT_S = 60;
/** Under this much time left, a ping earns the orange badge. */
export const SIGNAL_ORANGE_S = 6 * 3600;
/** In safe mode every quiet hour adds this many hours to the trip (decision 8)… */
export const SETBACK_HOURS_PER_QUIET_HOUR = 10;
/** …capped per outage (decision 8). */
export const SETBACK_CAP_MS = 7 * 86_400_000;

export type BadgeTier = "blue" | "orange" | "red";

/** The badge a ping earns, from the time that was left. Waking the probe from safe mode earns red. */
export function tierFor(secondsLeft: number): BadgeTier {
  if (secondsLeft <= SIGNAL_URGENT_S) return "red";
  if (secondsLeft < SIGNAL_ORANGE_S) return "orange";
  return "blue";
}

/** How much later the probe arrives because of the current outage, in ms of travel. */
export function setbackMs(safeSince: number | null, now: number): number {
  if (safeSince === null) return 0;
  return Math.min(SETBACK_CAP_MS, Math.max(0, now - safeSince) * SETBACK_HOURS_PER_QUIET_HOUR);
}

/** What everyone sees. Times are the server's clock (epoch ms). */
export interface ProbeSnapshot {
  missionId: number;
  destination: string;
  missionStartedAt: number;
  routeKm: number;
  /** Distance at `at`. Between updates the browser adds coasting and auto-thrust (distanceAt). */
  distanceKm: number;
  at: number;
  coastKmS: number;
  /** Everyone connected's auto-thrust, after the ceiling: it moves the probe continuously. */
  autoKmS: number;
  /** What the crew adds (taps and catch-ups over the last PACE_WINDOW_MIN minutes, plus auto-thrust), after the ceiling. */
  crewKmS: number;
  /** The share of a crew km that moves the shared probe (1 until the crew passes CREW_FULL_KM_S). */
  crewFactor: number;
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
}

/** This device's own numbers for today (UTC). */
export interface DeviceToday {
  kmToday: number;
  tapKmToday: number;
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
  | { ok: false; reason: "already-pinged" | "just-saved" | "bot-check" | "no-device" | "unavailable" };

/** Browser → server. */
export type ClientMessage =
  | { t: "taps"; n: number; seq: number }
  | { t: "buy"; key: UpgradeKey; seq: number }
  | { t: "prestige"; seq: number };

/** Server → browser. `me` is this device's idle game at `now`. */
export type ServerMessage =
  | ({ t: "hello"; now: number; probe: ProbeSnapshot; me: Progress; welcome: WelcomeBack | null } & DeviceToday)
  | { t: "state"; now: number; probe: ProbeSnapshot }
  | ({ t: "credited"; seq: number; taps: number; km: number; now: number; probe: ProbeSnapshot; me: Progress } & DeviceToday)
  /** The answer to a buy or a handover: refused when it isn't affordable (or unlocked). */
  | { t: "me"; seq: number; ok: boolean; now: number; me: Progress };

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
  /** Before the ceiling: taps and catch-ups over the last hour, and connected auto-thrust (km/s). */
  crewRawKmS: number;
  autoRawKmS: number;
  /** Devices with saved progress. */
  players: number;
}

/** Where a probe is at a given server time: the last known distance plus coasting and auto-thrust since. */
export function distanceAt(
  p: Pick<ProbeSnapshot, "distanceKm" | "at" | "coastKmS" | "routeKm"> & { autoKmS?: number },
  now: number,
): number {
  return Math.min(p.routeKm, p.distanceKm + ((p.coastKmS + (p.autoKmS ?? 0)) * Math.max(0, now - p.at)) / 1000);
}

/** The live arrival estimate: what's left (with the current outage's setback) at coasting plus the crew's pace. */
export function arrivalAt(p: ProbeSnapshot, now: number): number {
  const setbackKm = (setbackMs(p.safeSince, now) / 1000) * p.coastKmS;
  const toGo = Math.max(0, p.routeKm + setbackKm - distanceAt(p, now));
  return now + (toGo / (p.coastKmS + p.crewKmS)) * 1000;
}

/** The UTC day, as YYYY-MM-DD. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
