import { PUSH_KINDS, PUSH_LABELS, PUSH_TEST_GAP_MS } from "../../shared/push";
import { alertsCardWanted, closeAlertsCard, disablePush, enablePush, installApp, setPushPref, testPush, usePush } from "../game/push";
import { PixelButton } from "./PixelButton";
import { Window } from "./Window";
import "./Alerts.css";

const IOS_HINT = "On iPhone and iPad, alerts work once the game is on your home screen: tap Share, then Add to Home Screen, then open it from there.";

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
      {p.status === "ios-install" && <p className="profile__note">{IOS_HINT}</p>}
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
  if ((p.status !== "off" && p.status !== "ios-install") || !alertsCardWanted()) return null;
  const ios = p.status === "ios-install";
  return (
    <Window as="section" tone="blue" className={wide ? "alerts alerts--wide" : "alerts"} aria-labelledby="alerts-card-label">
      <h2 id="alerts-card-label" className="alerts__label">
        ALERTS
      </h2>
      <p className="alerts__text">
        {ios
          ? IOS_HINT
          : "Want a nudge when the signal is in its final hour, the landing burn starts, or the vote is about to close? At most 3 a day, and each one can be turned off."}
      </p>
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
        <PixelButton variant="outline" onClick={closeAlertsCard}>
          {ios ? "Got it" : "No thanks"}
        </PixelButton>
      </div>
    </Window>
  );
}
