// Phase M (prompts 92 and 103): every distance and speed shows km and miles. In the game's numbers and labels it's a
// slash ("38,266 km / 23,777 mi"); in sentences it's brackets ("384,400 km (238,900 miles)"). The tap pop-ups
// ("+0.8 km") stay km only (Nav, prompt 103). The app, the Worker and the build scripts all use this file, so it
// has no imports. AU, light-minutes, source quotes, /admin and /kit stay as they are.

export const KM_PER_MILE = 1.609344;

/** Km → miles. */
export function miles(km: number): number {
  return km / KM_PER_MILE;
}

const intFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const whole = (n: number) => intFmt.format(Math.floor(Math.max(0, n)));

/** 38266 → "38,266 km / 23,777 mi" (both rounded down, like every counter in the game). */
export function kmMi(km: number): string {
  return `${whole(km)} km / ${whole(miles(km))} mi`;
}

/** 38266 → "23,777 mi": the miles on their own, for a second line under a km figure. */
export function miOnly(km: number): string {
  return `${whole(miles(km))} mi`;
}

/** A compact distance in one unit: "1.44B", "186M", "1.07M" or "671,100", then the unit. */
function compact(n: number, unit: string): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ${unit}`;
  if (n >= 1e7) return `${Math.round(n / 1e6)}M ${unit}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ${unit}`;
  return `${whole(n)} ${unit}`;
}

/** 186_400_000 → "186M km / 116M mi" (the map and the branch vote). */
export function compactKmMi(km: number): string {
  return `${compact(km, "km")} / ${compact(miles(km), "mi")}`;
}

/** 57_593_689 → "57.59M km / 35.79M mi". */
export function millionsKmMi(km: number): string {
  const m = (n: number) => `${(Math.max(0, n) / 1e6).toFixed(2)}M`;
  return `${m(km)} km / ${m(miles(km))} mi`;
}

/** 24.1 → "24.10 km/s / 14.97 mi/s" (`digits` decimals on both). */
export function speedKmMi(kmS: number, digits = 2): string {
  return `${kmS.toFixed(digits)} km/s / ${miles(kmS).toFixed(digits)} mi/s`;
}

/** A speed in km/h (the moon legs): "1,234 km/h / 766 mph". */
export function speedKmhMph(kmH: number): string {
  return `${whole(kmH)} km/h / ${whole(miles(kmH))} mph`;
}

// ---------- Sentences ----------

const NUM_SRC = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
// A run of numbers before the unit: "384,400", "1 to 10", "15 by 12 by 11", "19 to 26".
const RUN = String.raw`(?:(?:${NUM_SRC})\s(?:to|by|or|and|-|–)\s)*(?:${NUM_SRC})`;
const SCALE = String.raw`(?:\s(million|billion|trillion))?`;
// "384,400 km", "1.5 million km", "1 to 10 km", "2,000 km/h": not "km/s", and not a km already followed by its
// miles in brackets ("26 km (12 to 16 miles)").
const KM_IN_TEXT = new RegExp(
  String.raw`(?<![\d.,])(${RUN})${SCALE}\s?(km/h|km)\b(?!/s)(?!\s\([^)]*\b(?:miles?|mph)\))`,
  "g",
);
const ONE_NUM = new RegExp(NUM_SRC, "g");
const SCALES: Record<string, number> = { million: 1e6, billion: 1e9, trillion: 1e12 };

/** The significant figures a written number claims: "384,400" has 4, "6,000" has 1, "1.5" has 2. */
function sigFigs(written: string): number {
  const [intPart, frac = ""] = written.replace(/,/g, "").split(".");
  const digits = intPart.replace(/^0+/, "");
  if (frac) return digits ? digits.length + frac.length : frac.replace(/^0+/, "").length;
  return Math.max(1, digits.replace(/0+$/, "").length);
}

/** `n` rounded to `sf` significant figures. */
function roundSig(n: number, sf: number): number {
  if (n === 0) return 0;
  const p = Math.ceil(Math.log10(Math.abs(n))) - sf;
  const f = 10 ** p;
  return Math.round(n / f) * f;
}

/** One written km figure as miles, to the precision it was written with (at least 2 figures, and no decimals on a
 * whole number of 100 miles or more): "384,400" → "238,900", "120" + million → "75 million". */
function milesWords(written: string, scale: string | undefined): string {
  const value = Number(written.replace(/,/g, "")) * (scale ? SCALES[scale] : 1);
  const sf = Math.max(2, sigFigs(written));
  let mi = roundSig(miles(value), sf);
  if (!written.includes(".") && mi >= 100) mi = Math.round(mi);
  const fmt = (n: number) => new Intl.NumberFormat("en-GB", { maximumSignificantDigits: sf, maximumFractionDigits: 2 }).format(n);
  if (scale && mi >= SCALES[scale]) return `${fmt(mi / SCALES[scale])} ${scale}`;
  if (mi >= 1e6) return `${fmt(mi / 1e6)} million`;
  return fmt(mi);
}

/**
 * Adds the miles after every km distance in a sentence: "The Moon is 384,400 km from Earth" → "The Moon is
 * 384,400 km (238,900 miles) from Earth"; "1 to 10 km" → "1 to 10 km (0.62 to 6.2 miles)"; "2,000 km/h" →
 * "2,000 km/h (1,200 mph)". Rounded to the figures the km was written with. Safe to run twice: a km already
 * followed by its miles is left alone.
 */
export function withMiles(text: string): string {
  return text.replace(KM_IN_TEXT, (all, run: string, scale: string | undefined, unit: string) => {
    const converted = run.replace(ONE_NUM, (n) => milesWords(n, scale));
    // "75 million" already carries its scale; a run like "1 to 2" + million would repeat it, so keep it once.
    const words = scale ? converted.replace(new RegExp(String.raw`\s(million|billion|trillion)(?=.*\s(million|billion|trillion)$)`, "g"), "") : converted;
    const single = !/\s(to|by|or|and|-|–)\s/.test(run);
    const plural = !(single && words === "1");
    return `${all} (${words} ${unit === "km/h" ? "mph" : plural ? "miles" : "mile"})`;
  });
}

/** `withMiles` for an optional string. */
export function withMilesOpt<T extends string | undefined | null>(text: T): T {
  return (typeof text === "string" ? withMiles(text) : text) as T;
}

/** Content fields left as written: source quotes and links, and notes for us. */
const KEEP_AS_WRITTEN = new Set(["quote", "url", "source", "sources", "_about", "distanceNote", "licence", "credit", "alt", "image", "nasaId"]);

/**
 * A content file with the miles added to every sentence a player reads (`withMiles`), keeping source quotes and
 * links as written. shared/content.ts, shared/campaign.ts and scripts/build-pages.mjs run their files through it.
 */
export function milesInContent<T>(data: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return withMiles(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, KEEP_AS_WRITTEN.has(k) ? x : walk(x)]));
    return v;
  };
  return walk(data) as T;
}

/** 57_593_689 → "35.79M mi": the miles of a `millionsKmMi` figure on their own, for a second line. */
export function millionsMi(km: number): string {
  return `${(Math.max(0, miles(km)) / 1e6).toFixed(2)}M mi`;
}

/** Small distances to 2 decimals at most: 0.8 → "0.8 km / 0.5 mi" (tap power, a stat, not the tap pop-up). */
export function kmMiFine(km: number): string {
  const f = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
  return `${f.format(km)} km / ${f.format(Math.round(miles(km) * 100) / 100)} mi`;
}
