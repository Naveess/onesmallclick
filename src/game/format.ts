// Number and time formatting, en-GB, as in the design.

import { speedKmhMph, speedKmMi } from "../../shared/units";

const intFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** 182406311 → "182,406,311" (rounded down, so counters never show a km not yet travelled). */
export function int(n: number): string {
  return intFmt.format(Math.floor(n));
}

/** Seconds → "04:12:39". */
export function hms(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Seconds → "2 min 14 s". */
export function minSec(totalSeconds: number): string {
  const t = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(t / 60)} min ${t % 60} s`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Epoch ms → "14 March 2027" (UTC, like every date in the game). */
/** The probe's speed: km/s, or km/h on a moon leg, where it's a few hundredths of a km a second; with miles (M). */
export function probeSpeed(kmS: number, moonLeg: boolean): string {
  return moonLeg ? speedKmhMph(kmS * 3600) : speedKmMi(kmS);
}

export function longDate(ms: number): string {
  return dateFmt.format(new Date(ms));
}

/** 57593689 → "57.59M km". */
export function millionsKm(km: number): string {
  return `${(Math.max(0, km) / 1e6).toFixed(2)}M km`;
}

// ---------- Phase Q1a: times in each player's own timezone (with UTC beside them, so the crew shares one clock) ----------

const localClock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const localWeekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const localDayMonth = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const utcClock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const utcWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const utcDayMonth = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Whole days from `now`'s calendar day to `ms`'s, in the browser's timezone (or UTC). */
function dayGap(ms: number, now: number, utc: boolean): number {
  const day = (t: number) => {
    const d = new Date(t);
    return utc ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.round((day(ms) - day(now)) / 86_400_000);
}

/** "7:00 pm" today, "Thu 7:00 pm" this week, "Thu 17 Dec, 7:00 pm" further off: the player's own clock and style. */
export function localTime(ms: number, now = Date.now()): string {
  const gap = dayGap(ms, now, false);
  const clock = localClock.format(ms);
  if (gap === 0) return clock;
  if (gap > 0 && gap < 7) return `${localWeekday.format(ms)} ${clock}`;
  return `${localDayMonth.format(ms)}, ${clock}`;
}

/** The same moment in UTC: "00:00 UTC", "Thu 00:00 UTC" or "Thu 17 Dec 00:00 UTC" (the day relative to UTC's today). */
export function utcTime(ms: number, now = Date.now()): string {
  const gap = dayGap(ms, now, true);
  const clock = utcClock.format(ms);
  // Tonight's midnight (the daily reset) reads as the end of today: "00:00 UTC", not "Thu 00:00 UTC".
  if (gap === 0 || (gap === 1 && clock === "00:00")) return `${clock} UTC`;
  if (gap > 0 && gap < 7) return `${utcWeekday.format(ms)} ${clock} UTC`;
  return `${utcDayMonth.format(ms)} ${clock} UTC`;
}

/** The player's clock is on UTC at that moment (the UK in winter, Iceland…): then UTC alone says it. */
export function onUtc(ms: number): boolean {
  return new Date(ms).getTimezoneOffset() === 0;
}

/** "7:00 pm your time (00:00 UTC)", for sentences; just "00:00 UTC" for a player on UTC. */
export function yourTime(ms: number, now = Date.now()): string {
  return onUtc(ms) ? utcTime(ms, now) : `${localTime(ms, now)} your time (${utcTime(ms, now)})`;
}
