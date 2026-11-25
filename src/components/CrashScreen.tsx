import { FeedbackButton } from "./Feedback";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { PixelButton } from "./PixelButton";
import { PixelIcon } from "./PixelIcon";
import { Sky } from "./Sky";
import { Window } from "./Window";
import "../pages/SimplePage.css";

/** Sends a crash to the Worker's logs (POST /api/report), so it shows up in Cloudflare's Workers Logs. */
function report(error: unknown, info?: ErrorInfo) {
  const e = error instanceof Error ? error : new Error(String(error));
  const body = JSON.stringify({
    message: e.message.slice(0, 300),
    stack: (e.stack ?? "").slice(0, 1200),
    component: (info?.componentStack ?? "").slice(0, 600),
    path: window.location.pathname,
  });
  try {
    navigator.sendBeacon("/api/report", new Blob([body], { type: "application/json" }));
  } catch {
    // nothing more to do: the player still gets the reload button
  }
}

/** Uncaught errors outside rendering (event handlers, promises): logged too, at most 3 per page load. */
export function watchErrors() {
  let left = 3;
  const send = (e: unknown) => {
    if (left-- > 0) report(e);
  };
  window.addEventListener("error", (ev) => send(ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => send(ev.reason));
}

/** In local dev, /?crash shows this screen (a test switch, like ?crew=handful). */
function DevCrash(): null {
  throw new Error("Test crash (?crash, local dev only)");
}

interface State {
  crashed: boolean;
}

/** Phase 9a: if the app ever breaks, players get "Something went wrong · Reload" instead of a blank page. */
export class CrashScreen extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error);
    report(error, info);
  }

  render() {
    if (!this.state.crashed) {
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("crash")) return <DevCrash />;
      return this.props.children;
    }
    return (
      <>
        <Sky fixed />
        <div className="launch">
          <main className="launch__main">
            <Window as="section" className="launch__card" aria-labelledby="crash-title" role="alert">
              <PixelIcon name="signal" tone="orange" size={36} />
              <h1 id="crash-title" className="launch__title">
                Something went wrong
              </h1>
              <p className="launch__lede">The game hit a problem it couldn't recover from. Reloading usually fixes it, and the probe kept flying.</p>
              <PixelButton onClick={() => window.location.reload()}>Reload</PixelButton>
              <p className="launch__legal">
                Still stuck? <FeedbackButton signedIn={false} className="launch__report" />
              </p>
            </Window>
          </main>
        </div>
      </>
    );
  }
}
