// Number and time formatting, en-GB, as in the design.

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
export function longDate(ms: number): string {
  return dateFmt.format(new Date(ms));
}

/** 57593689 → "57.59M km". */
export function millionsKm(km: number): string {
  return `${(Math.max(0, km) / 1e6).toFixed(2)}M km`;
}
