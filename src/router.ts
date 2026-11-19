import { createElement, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

// A tiny router: a handful of pages, so no library. Links change the URL without a reload,
// which keeps this visit's (fake, in-memory) game going while you look at other pages.

const listeners = new Set<() => void>();

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

window.addEventListener("popstate", () => listeners.forEach((fn) => fn()));

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", to);
  window.scrollTo(0, 0);
  listeners.forEach((fn) => fn());
}

export function usePath(): string {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    currentPath,
  );
}

/** Keep the test switches (?crew=handful, ?ads=off) when moving between pages. */
function withSearch(href: string): string {
  return href.startsWith("/") && !href.includes("?") ? href + window.location.search : href;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/** Plain HTML pages outside the app (scripts/build-pages.mjs): links to them load the page normally. */
const CONTENT_PAGE = /^\/(how-to-play|milestones)(\/|$)/;

/** An <a> that navigates inside the app. Ctrl/Cmd-click and middle-click still open a new tab. */
export function Link({ href, onClick, ...rest }: LinkProps) {
  if (CONTENT_PAGE.test(href)) return createElement("a", { ...rest, href, onClick });
  const target = withSearch(href);
  return createElement("a", {
    ...rest,
    href: target,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(target);
    },
  });
}
