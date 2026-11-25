// Phase Q1b-2 (decision 29, prompt 105): opt-in notifications. Three alerts, all on when someone turns alerts on,
// each with its own off switch, and at most 3 a day per browser. The push itself carries no text: the browser asks
// /api/notice what to show (worker/push.ts), so no payload is ever encrypted. Used by the app and the Worker.

export type PushKind = "signal" | "burn" | "vote";
/** The kinds a browser can be told about: the three alerts, and its own test. */
export type NoticeKind = PushKind | "test";

export const PUSH_KINDS: PushKind[] = ["signal", "burn", "vote"];
/** At most this many alerts a day to one browser (decision 29). */
export const PUSH_MAX_PER_DAY = 3;
/** "Send me a test alert": once an hour per browser. */
export const PUSH_TEST_GAP_MS = 3_600_000;

export type PushPrefs = Record<PushKind, boolean>;

/** What each alert is called in the settings. */
export const PUSH_LABELS: Record<PushKind, { name: string; about: string }> = {
  signal: { name: "The signal is in its final hour", about: "Once, when the probe is about to go quiet and nobody has pinged. Skipped if you've pinged today." },
  burn: { name: "The landing burn has started", about: "When the final hour before a landing begins and every tap counts double." },
  vote: { name: "The crew vote closes in an hour", about: "At 23:00 UTC. Skipped if you've already voted." },
};

/** What the notification says. */
export const NOTICES: Record<NoticeKind, { title: string; body: string }> = {
  signal: { title: "The signal is in its final hour", body: "Nobody has pinged for a while. One Ping saves the probe from safe mode." },
  burn: { title: "The landing burn has started", body: "The final hour: every tap counts double. Help us stick the landing." },
  vote: { title: "The crew vote closes in an hour", body: "Cast yours before 00:00 UTC." },
  test: { title: "Alerts are on", body: "This is your test alert. You'll hear from OneSmallClick only when it matters." },
};

/** What the app tells the server about one browser's alerts. */
export interface PushState {
  /** Alerts are on for this browser. */
  on: boolean;
  prefs: PushPrefs;
  /** When the last test alert went, so the button can wait. */
  testAt: number | null;
}

/** The push services' addresses we accept (the browser's own push endpoint), so the Worker only ever calls those. */
export function isPushEndpoint(endpoint: string, allowLocal = false): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (endpoint.length > 1000) return false;
  if (allowLocal && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
  if (u.protocol !== "https:" || u.port !== "") return false;
  const h = u.hostname;
  return (
    h === "fcm.googleapis.com" || // Chrome, Edge, Brave, Opera, Samsung Internet
    h.endsWith(".push.services.mozilla.com") || // Firefox
    h.endsWith(".notify.windows.com") || // Edge on Windows (WNS)
    h === "web.push.apple.com" ||
    h.endsWith(".push.apple.com") // Safari
  );
}
