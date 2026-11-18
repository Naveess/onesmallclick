import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const q = window.matchMedia(query);
      q.addEventListener("change", fn);
      return () => q.removeEventListener("change", fn);
    },
    () => window.matchMedia(query).matches,
  );
}

/** The design's wide layout (1b) starts at about 900px. Keep in step with the CSS. */
export const WIDE_QUERY = "(min-width: 900px)";
