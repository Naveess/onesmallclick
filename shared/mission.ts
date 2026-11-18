// Shared by the browser (src/) and the Worker (worker/): the mission's fixed numbers
// and the messages that go over the probe's WebSocket. No DOM or Worker APIs here.

/** Earth to Mars, as the design has it. */
export const ROUTE_KM = 480_000_000;

/** The probe always coasts at this speed, even with nobody tapping (decision 5). */
export const COAST_KM_S = 21;

/** Km per tap until phase 6 makes upgrades real. */
export const BASE_TAP_KM = 4;

/** The fastest a device can tap. Above human speed, so only scripts hit it. */
export const MAX_TAPS_PER_S = 15;

/** How often the browser sends its tap count. */
export const BATCH_MS = 2_000;

/** Crew pace is the tap km of the last few minutes, averaged. */
export const PACE_WINDOW_MIN = 5;

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
  /** Distance at `at`. Between updates the browser adds coasting (COAST_KM_S). */
  distanceKm: number;
  at: number;
  coastKmS: number;
  /** The crew's taps over the last PACE_WINDOW_MIN minutes, in km/s. */
  crewKmS: number;
  /** Devices connected right now (several tabs on one device count once). */
  online: number;
  tapKm: number;
  /** When the signal runs out unless someone pings. */
  signalDeadline: number;
  /** When safe mode began, or null while the probe is talking. */
  safeSince: number | null;
}

/** This device's own numbers for today (UTC). */
export interface DeviceToday {
  kmToday: number;
  tapKmToday: number;
  pingedToday: boolean;
  /** Consecutive days with a ping, up to today or yesterday. */
  pingStreakDays: number;
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
export type ClientMessage = { t: "taps"; n: number; seq: number };

/** Server → browser. */
export type ServerMessage =
  | ({ t: "hello"; now: number; probe: ProbeSnapshot } & DeviceToday)
  | { t: "state"; now: number; probe: ProbeSnapshot }
  | ({ t: "credited"; seq: number; taps: number; km: number; now: number; probe: ProbeSnapshot } & DeviceToday);

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
}

/** Where a probe is at a given server time: the last known distance plus coasting since. */
export function distanceAt(
  p: Pick<ProbeSnapshot, "distanceKm" | "at" | "coastKmS" | "routeKm">,
  now: number,
): number {
  return Math.min(p.routeKm, p.distanceKm + (p.coastKmS * Math.max(0, now - p.at)) / 1000);
}

/** The UTC day, as YYYY-MM-DD. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
