import { SETBACK_HOURS_PER_QUIET_HOUR } from "../../shared/mission";
import { longDate } from "../game/format";
import { SPRITES, STILLS } from "../sprites";
import { PingButton } from "./PingButton";
import { Sprite } from "./Sprite";
import { Window } from "./Window";
import "./SafeMode.css";

interface SafeModeProps {
  wide: boolean;
  quietS: number;
  /** Null while the probe is paused (the date is on hold). */
  arrivalAt: number | null;
  arrivalBeforeAt: number | null;
  setbackMs: number;
  /** The probe is paused for lack of players: the setback waits too. */
  paused: boolean;
  progress: number;
  pinged: boolean;
  pinging: boolean;
  onPing: () => void;
}

/** "12 MIN AGO", "3 HOURS AGO", "2 DAYS AGO". */
function ago(s: number): string {
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} MIN AGO`;
  if (s < 2 * 86_400) {
    const h = Math.floor(s / 3600);
    return `${h} HOUR${h === 1 ? "" : "S"} AGO`;
  }
  return `${Math.floor(s / 86_400)} DAYS AGO`;
}

/** "+5 DAYS", or hours while it's under two days. */
function later(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 48) {
    const n = Math.max(1, Math.round(h));
    return `+${n} HOUR${n === 1 ? "" : "S"}`;
  }
  return `+${Math.round(h / 24)} DAYS`;
}

/** Safe mode (1f): the signal was lost. A setback, not game over; one ping from anyone wakes the probe. */
export function SafeMode({
  wide,
  quietS,
  arrivalAt,
  arrivalBeforeAt,
  setbackMs,
  paused,
  progress,
  pinged,
  pinging,
  onPing,
}: SafeModeProps) {
  const pct = `${Math.min(100, Math.max(0, progress * 100)).toFixed(2)}%`;
  return (
    <main className={wide ? "safe safe--wide" : "safe"} aria-label="Safe mode">
      <div className="safe__vignette" aria-hidden="true" />
      <h1 className="visually-hidden">Safe mode: the probe has lost its signal</h1>

      <section className="safe__lost" aria-labelledby="safe-lost-label">
        <h2 id="safe-lost-label" className="safe__label">
          SIGNAL LOST {ago(quietS)}
        </h2>
        <p className="safe__lede">The probe has gone quiet. We now arrive</p>
        <p className="safe__date">{arrivalAt === null ? "On hold" : longDate(arrivalAt)}</p>
        {setbackMs > 0 && arrivalBeforeAt !== null && (
          <p className="safe__was">
            <s className="safe__old">{longDate(arrivalBeforeAt)}</s>
            <span className="safe__later">{later(setbackMs)}</span>
          </p>
        )}
      </section>

      <Window tone="muted" className="safe__track" aria-label={`Route from Earth to Mars, ${pct} travelled, thrusters asleep`}>
        <div className="safe__lane" aria-hidden="true">
          <img className="safe__earth" src={STILLS.earth.src} alt="" width={64} height={64} />
          <div className="safe__mars">
            <Sprite sprite={SPRITES.marsSmall} scale={1} playing={false} />
          </div>
          <div className="safe__route">
            <div className="safe__dash" />
            <div className="safe__bar" style={{ width: pct }} />
            <img className="safe__probe" src={STILLS.probe.src} alt="" width={64} height={40} style={{ left: pct }} />
          </div>
        </div>
        <div className="safe__foot">
          <span>{paused ? "Probe idle · waiting for the crew" : "Coasting · thrusters asleep"}</span>
          <span className="num">0 km/s from crew</span>
        </div>
      </Window>

      <Window tone="muted" as="section" className="safe__signal" aria-labelledby="safe-signal-label">
        <div>
          <h2 id="safe-signal-label" className="safe__label">
            SIGNAL
          </h2>
          <div className="safe__timer num" role="timer" aria-label="Signal time left 00:00:00">
            00:00:00
          </div>
        </div>
        <p className="safe__rule">Every quiet hour adds about {SETBACK_HOURS_PER_QUIET_HOUR} hours to the trip.</p>
      </Window>

      <section className="safe__wake" aria-label="Wake the probe">
        <PingButton onPing={onPing} disabled={pinged || pinging} hint={pinging ? "pinging…" : "wake the probe"} />
        <p className="safe__note">
          {pinged
            ? "You've used today's ping. Nothing is lost: one ping from anyone else brings it back."
            : "Nothing is lost. The distance is safe. One ping from anyone brings it back. You have 1 left today."}
        </p>
      </section>
    </main>
  );
}
