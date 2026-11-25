import { PUSH_KINDS, PUSH_LABELS, PUSH_TEST_GAP_MS } from "../../shared/push";
import { useState } from "react";
import { alertsCardWanted, closeAlertsCard, disablePush, enablePush, installApp, iosBrowser, setPushPref, testPush, usePush } from "../game/push";
import { PixelButton } from "./PixelButton";
import { Window } from "./Window";
import "./Alerts.css";

/** Safari's Share icon (a square with an arrow up), drawn so players can spot the real one. */
function ShareIcon() {
  return (
    <svg className="alerts__share-icon" viewBox="0 0 16 18" width="16" height="18" aria-hidden="true">
      <path d="M8 1v10M4.5 4.5 8 1l3.5 3.5M5 7H2v10h12V7h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

/** "Copy the link", for opening the game in Safari from another app's browser. */
function CopyLink() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      window.prompt("Copy this link, then open it in Safari:", window.location.origin);
    }
  };
  return (
    <PixelButton variant="outline" onClick={() => void copy()}>
      {copied ? "Link copied" : "Copy the game's link"}
    </PixelButton>
  );
}

/**
 * How to add the game to an iPhone's Home Screen (prompt 113: "what share button?"), step by step, for the browser
 * it's in. Alerts only work on iPhone from the Home Screen.
 */
export function IosSteps() {
  const where = iosBrowser();
  if (where === "in-app") {
    return (
      <div className="alerts__steps">
        <p className="alerts__text">You're in another app's browser, which can't add the game to your Home Screen.</p>
        <ol className="alerts__list-steps">
          <li>Copy the game's link (below), or tap the ••• or compass button and choose Open in Safari.</li>
          <li>Open it in Safari, then come back here for the next steps.</li>
        </ol>
        <CopyLink />
      </div>
    );
  }
  return (
    <div className="alerts__steps">
      <ol className="alerts__list-steps">
        {where === "other" ? (
          <li>
            Tap the <strong>Share</strong> button <ShareIcon /> in the address bar (in Firefox, it's in the ☰ menu).
          </li>
        ) : (
          <li>
            Tap the <strong>Share</strong> button <ShareIcon /> at the bottom of Safari. Don't see it? Tap <strong>•••</strong> next to the
            address first, then Share.
          </li>
        )}
        <li>
          Scroll down the list and tap <strong>Add to Home Screen</strong>. Not in the list? Tap <strong>Edit Actions</strong> at the very
          bottom, add it, then tap it.
        </li>
        <li>
          Tap <strong>Add</strong>. Then open OneSmallClick from your Home Screen and turn on alerts in your profile.
        </li>
      </ol>
      <p className="alerts__small">Opened this from Discord or WhatsApp? Open it in Safari first: tap the compass or ••• and choose Open in Safari.</p>
    </div>
  );
}

/**
 * "Alerts and app" on the profile (phase Q1b-2): install the game as an app, turn the three alerts on or off, and send
 * yourself a test. Each alert has its own switch.
 */
export function AlertsPanel() {
  const p = usePush();
  const waitMs = p.testAt ? p.testAt + PUSH_TEST_GAP_MS - Date.now() : 0;
  return (
    <section className="profile__section alerts-panel" id="alerts" aria-labelledby="alerts-label">
      <h2 id="alerts-label" className="profile__label">
        ALERTS AND APP
      </h2>

      {p.installed ? (
        <p className="profile__note">You're playing the installed app.</p>
      ) : p.canInstall ? (
        <div className="alerts__row">
          <p className="profile__note">Put OneSmallClick on your home screen or desktop, so it opens like an app.</p>
          <PixelButton variant="outline" onClick={() => void installApp()}>
            Install the app
          </PixelButton>
        </div>
      ) : null}

      {p.status === "checking" && <p className="profile__note">Checking…</p>}
      {p.status === "unsupported" && <p className="profile__note">This browser can't show alerts. Try the game in Chrome, Edge, Firefox or Safari.</p>}
      {p.status === "ios-install" && (
        <>
          <p className="profile__note">On iPhone and iPad, alerts work once the game is on your Home Screen. Three taps:</p>
          <IosSteps />
        </>
      )}
      {p.status === "blocked" && (
        <p className="profile__note">
          Alerts are blocked for this site. To turn them on, allow notifications for OneSmallClick in your browser's site settings, then come back here.
        </p>
      )}

      {p.status === "off" && (
        <>
          <p className="profile__note">
            Get an alert when the signal is in its final hour, when the landing burn starts, and when the crew vote is about to close. At most 3 a day, and you can turn each one off.
          </p>
          <PixelButton onClick={() => void enablePush()} disabled={p.busy}>
            Turn on alerts
          </PixelButton>
        </>
      )}

      {p.status === "on" && (
        <>
          <ul className="alerts__list">
            {PUSH_KINDS.map((k) => (
              <li key={k}>
                <label className="alerts__check">
                  <input type="checkbox" checked={p.prefs[k]} disabled={p.busy} onChange={(e) => void setPushPref(k, e.target.checked)} />
                  <span>
                    <strong>{PUSH_LABELS[k].name}</strong>
                    <small>{PUSH_LABELS[k].about}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="alerts__buttons">
            <PixelButton variant="outline" onClick={() => void testPush()} disabled={p.busy || waitMs > 0}>
              {waitMs > 0 ? "Test alert sent" : "Send me a test alert"}
            </PixelButton>
            <PixelButton variant="outline" onClick={() => void disablePush()} disabled={p.busy}>
              Turn off alerts
            </PixelButton>
          </div>
        </>
      )}
      {p.error && (
        <p className="alerts__error" role="alert">
          {p.error}
        </p>
      )}
    </section>
  );
}

/**
 * The game home's alerts card (phase Q1b-2): from a player's second day, until they turn alerts on or say "No thanks"
 * (then the profile is where to find them). On an iPhone that hasn't installed the game it says how to.
 */
export function AlertsCard({ wide = false }: { wide?: boolean }) {
  const p = usePush();
  const [how, setHow] = useState(false);
  if ((p.status !== "off" && p.status !== "ios-install") || !alertsCardWanted()) return null;
  const ios = p.status === "ios-install";
  return (
    <Window as="section" tone="blue" className={wide ? "alerts alerts--wide" : "alerts"} aria-labelledby="alerts-card-label">
      <h2 id="alerts-card-label" className="alerts__label">
        ALERTS
      </h2>
      <p className="alerts__text">
        {ios
          ? "Want a nudge when the signal is in its final hour or the vote is about to close? On iPhone, alerts need the game on your Home Screen first."
          : "Want a nudge when the signal is in its final hour, the landing burn starts, or the vote is about to close? At most 3 a day, and each one can be turned off."}
      </p>
      {ios && how && <IosSteps />}
      {p.error && (
        <p className="alerts__error" role="alert">
          {p.error}
        </p>
      )}
      <div className="alerts__buttons">
        {!ios && (
          <PixelButton onClick={() => void enablePush()} disabled={p.busy}>
            Turn on alerts
          </PixelButton>
        )}
        {ios && !how && <PixelButton onClick={() => setHow(true)}>Show me how</PixelButton>}
        <PixelButton variant="outline" onClick={closeAlertsCard}>
          {ios ? "Got it" : "No thanks"}
        </PixelButton>
      </div>
    </Window>
  );
}
