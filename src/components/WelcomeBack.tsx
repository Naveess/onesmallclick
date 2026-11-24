import type { WelcomeBack as WelcomeData } from "../../shared/upgrades";
import { int } from "../game/format";
import { useGame } from "../game/store";
import { PixelButton } from "./PixelButton";
import { ProbeArt } from "./ProbeArt";
import { Window } from "./Window";
import "./WelcomeBack.css";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** "11 h 32 m", "8 h", "42 m". */
function hm(ms: number): string {
  const total = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** "1 day sooner", "5 hours later", "about the same". */
function moved(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < HOUR) return "about the same";
  const word = ms > 0 ? "sooner" : "later";
  if (abs < 2 * DAY) {
    const h = Math.round(abs / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ${word}`;
  }
  const d = Math.round(abs / DAY);
  return `${d} day${d === 1 ? "" : "s"} ${word}`;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

interface WelcomeBackProps {
  welcome: WelcomeData;
  name: string;
  wide: boolean;
  onClose: () => void;
}

/** Welcome back (1d): what your thrusters pushed while you were away. The server has already paid it. */
export function WelcomeBack({ welcome, name, wide, onClose }: WelcomeBackProps) {
  const { view } = useGame();
  const { probeId, probeName } = view;
  const { awayMs, countedMs, km, crewKm, arrivalSoonerMs, keptAliveBy } = welcome;
  const lostMs = Math.max(0, awayMs - countedMs);
  const countedPct = awayMs > 0 ? Math.min(100, (countedMs / awayMs) * 100) : 100;
  const kmText = int(Math.round(km));

  return (
    <main className={wide ? "welcome welcome--wide" : "welcome"} aria-labelledby="welcome-title">
      <div className="welcome__probe">
        <ProbeArt id={probeId} scale={2} label={`Probe ${probeName}`} />
      </div>
      <Window as="section" className="welcome__card">
        <div>
          <p className="welcome__label">WELCOME BACK{name && `, ${name.toUpperCase()}`}</p>
          <h1 id="welcome-title" className="welcome__title">
            While you were away
          </h1>
          <p className="welcome__away num">{hm(awayMs)} offline</p>
        </div>

        <div>
          <p className="welcome__km num">+{kmText} km</p>
          <p className="welcome__sub">pushed by your thrusters · +{kmText} cr</p>
        </div>

        <div className="welcome__cap">
          <div
            className="welcome__bar"
            role="img"
            aria-label={lostMs > 0 ? `${hm(countedMs)} counted, ${hm(lostMs)} not counted` : `All ${hm(countedMs)} counted`}
          >
            <div className="welcome__counted" style={{ width: `${countedPct}%` }} />
            <div className="welcome__lost" />
          </div>
          <div className="welcome__split num" aria-hidden="true">
            <span className="welcome__split-counted">{hm(countedMs)} counted</span>
            <span>{lostMs > 0 ? `${hm(lostMs)} not counted` : "all counted"}</span>
          </div>
          <p className="welcome__note">Offline thrust is capped at 8 hours. Check in twice a day to keep every kilometre.</p>
        </div>

        {(crewKm !== null || arrivalSoonerMs !== null || keptAliveBy) && (
          <dl className="welcome__rows">
            {crewKm !== null && (
              <div className="welcome__row">
                <dt>The crew pushed</dt>
                <dd className="num">{int(Math.round(crewKm))} km</dd>
              </div>
            )}
            {arrivalSoonerMs !== null && (
              <div className="welcome__row">
                <dt>Arrival moved</dt>
                <dd className="num welcome__blue">{moved(arrivalSoonerMs)}</dd>
              </div>
            )}
            {keptAliveBy && (
              <div className="welcome__row">
                <dt>Signal kept alive by</dt>
                <dd className="num welcome__orange">
                  <span>{keptAliveBy.name} ·</span> <span>{clock(keptAliveBy.at)}</span>
                </dd>
              </div>
            )}
          </dl>
        )}

        <PixelButton size="lg" block autoFocus onClick={onClose}>
          Collect &amp; keep pushing
        </PixelButton>
      </Window>
    </main>
  );
}
