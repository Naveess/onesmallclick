// Cloudflare Turnstile, the invisible bot check on Ping and the daily vote. The widget is "Invisible" in the dashboard,
// so normally nobody sees anything; if Cloudflare wants a human check, it appears at the bottom of
// the screen. The script loads in the background a little after the game page opens, so it never
// slows the first paint. Tokens are single-use: one fresh widget per ping.

/** Production site key (public). The dev build uses Cloudflare's always-pass invisible test key. */
const SITE_KEY = import.meta.env.DEV ? "1x00000000000000000000BB" : "0x4AAAAAAGHp999jPtmZ4xYE";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")));
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Starts loading the script once the page has settled. */
export function preloadTurnstile() {
  window.setTimeout(() => void load().catch(() => {}), 3000);
}

/** Runs the check and resolves with a one-time token for /api/ping or /api/vote. */
export async function turnstileToken(action: "ping" | "vote" | "signin" = "ping"): Promise<string> {
  const ts = await load();
  return new Promise<string>((resolve, reject) => {
    const host = document.createElement("div");
    host.className = "turnstile-host";
    document.body.appendChild(host);
    let id = "";
    const done = () => {
      window.clearTimeout(timer);
      try {
        if (id) ts.remove(id);
      } catch {
        // already gone
      }
      host.remove();
    };
    const timer = window.setTimeout(() => {
      done();
      reject(new Error("Turnstile timed out"));
    }, 60_000);
    id = ts.render(host, {
      sitekey: SITE_KEY,
      action,
      appearance: "interaction-only",
      callback: (token: string) => {
        done();
        resolve(token);
      },
      "error-callback": () => {
        done();
        reject(new Error("Turnstile error"));
      },
      "expired-callback": () => {
        done();
        reject(new Error("Turnstile expired"));
      },
    });
  });
}
