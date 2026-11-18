import { useSyncExternalStore } from "react";

// Theme: dark (the night sky) or light ("daylight mission control").
// The inline script in index.html sets <html data-theme> before the first paint, so there is
// no flash. With no saved choice the page follows the system setting, live. Once the player
// presses the toggle, that choice is saved in this browser and wins until they reset it.

export type Theme = "dark" | "light";

const STORAGE_KEY = "osc-theme"; // keep in step with the script in index.html
const lightQuery = () => window.matchMedia("(prefers-color-scheme: light)");

function readSaved(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null; // storage blocked (private mode, settings): fall back to the system
  }
}

function systemTheme(): Theme {
  return lightQuery().matches ? "light" : "dark";
}

interface ThemeState {
  theme: Theme;
  saved: boolean;
}

let state: ThemeState = { theme: readSaved() ?? systemTheme(), saved: readSaved() !== null };
const listeners = new Set<() => void>();

function apply(next: ThemeState) {
  state = next;
  document.documentElement.dataset.theme = next.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  // The top step of the sky in each theme (--sky-1).
  meta?.setAttribute("content", next.theme === "light" ? "#b8dcff" : "#0e1a40");
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) {
    lightQuery().addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      lightQuery().removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    }
  };
}

function onSystemChange() {
  if (!state.saved) apply({ theme: systemTheme(), saved: false });
}

// Another tab changed the saved choice.
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  const saved = readSaved();
  apply({ theme: saved ?? systemTheme(), saved: saved !== null });
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not saved, but still switch for this visit.
  }
  apply({ theme, saved: true });
}

export function followSystem() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing saved to remove
  }
  apply({ theme: systemTheme(), saved: false });
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => state);
  return {
    theme: current.theme,
    /** True once the player has picked a theme; false while following the system. */
    saved: current.saved,
    toggle: () => setTheme(current.theme === "dark" ? "light" : "dark"),
    followSystem,
  };
}

// Reduced motion, as a hook, for the few places CSS can't handle alone
// (e.g. swapping the one-shot burst for its still).
const motionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const q = motionQuery();
      q.addEventListener("change", fn);
      return () => q.removeEventListener("change", fn);
    },
    () => motionQuery().matches,
  );
}
