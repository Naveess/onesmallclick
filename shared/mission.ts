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
}

/** This device's own numbers for today (UTC). */
export interface DeviceToday {
  kmToday: number;
  tapKmToday: number;
}

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
