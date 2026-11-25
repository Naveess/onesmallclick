import { useMemo, useSyncExternalStore } from "react";
import { dist, distCompact, distFine, distMillions, distNum, speedHourIn, speedIn, type Unit } from "../../shared/units";

// Prompts 107–108: the game's numbers show one unit, km by default, with a KM | MI toggle on the home page. The
// choice is saved in this browser (like the theme) and every page follows it. Sentences keep their miles in
// brackets (shared/units.ts `withMiles`).

const STORAGE_KEY = "osc-units";

function readSaved(): Unit {
  try {
    return localStorage.getItem(STORAGE_KEY) === "mi" ? "mi" : "km";
  } catch {
    return "km"; // storage blocked: km for this visit
  }
}

let unit: Unit = readSaved();
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

// Another tab changed it.
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  unit = readSaved();
  listeners.forEach((fn) => fn());
}

export function setUnit(next: Unit) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not saved, but still switch for this visit.
  }
  unit = next;
  listeners.forEach((fn) => fn());
}

/** The unit now, for plain helpers. A component that uses them calls `useUnit()` too, so it re-renders on a change. */
export function currentUnit(): Unit {
  return unit;
}

export function useUnit(): Unit {
  return useSyncExternalStore(subscribe, () => unit);
}

/** The formatters in the player's unit. Re-renders the component when the unit changes. */
export function useUnits() {
  const u = useUnit();
  return useMemo(
    () => ({
      unit: u,
      /** "38,266 km" / "23,777 mi" */
      dist: (km: number) => dist(km, u),
      /** "38,266" / "23,777", for "X of Y km". */
      num: (km: number) => distNum(km, u),
      /** "12,000 of 20,000 km" */
      of: (km: number, targetKm: number) => `${distNum(km, u)} of ${dist(targetKm, u)}`,
      /** "0.8 km" / "0.5 mi" */
      fine: (km: number) => distFine(km, u),
      /** "186M km" / "116M mi" */
      compact: (km: number) => distCompact(km, u),
      /** "57.59M km" / "35.79M mi" */
      millions: (km: number) => distMillions(km, u),
      /** "24.10 km/s" / "14.98 mi/s" */
      speed: (kmS: number) => speedIn(kmS, u),
      /** The probe's speed: per second, or per hour on a moon leg (a few hundredths of a km a second). */
      probeSpeed: (kmS: number, moonLeg: boolean) => (moonLeg ? speedHourIn(kmS * 3600, u) : speedIn(kmS, u)),
    }),
    [u],
  );
}
