import { hms, int, longDate, minSec } from "../game/format";
import type { VoteOption } from "../game/fakeStore";
import { PixelButton } from "./PixelButton";
import { PixelIcon } from "./PixelIcon";
import { Window } from "./Window";
import "./GameCards.css";

/* ---------- People here now ---------- */

export function HereNow({ online, idling, wide = false }: { online: number; idling: number | null; wide?: boolean }) {
  return (
    <div className={wide ? "here-now here-now--wide" : "here-now"}>
      <div className="here-now__chip">
        <span className="here-now__dot" aria-hidden="true" />
        <span className="here-now__count num">{int(online)}</span>
        <span className="here-now__word">here now</span>
      </div>
      {idling !== null && <div className="here-now__idling">+ {int(idling)} thrusters idling</div>}
    </div>
  );
}

/* ---------- Live arrival estimate ---------- */

export function ArrivalEstimate({ arrivalAt, savedS, wide = false }: { arrivalAt: number; savedS: number; wide?: boolean }) {
  return (
    <section className={wide ? "arrival arrival--wide" : "arrival"} aria-labelledby="arrival-label">
      <h2 id="arrival-label" className="arrival__label">
        Live arrival estimate
      </h2>
      <p className="arrival__lede">At this pace we arrive</p>
      <p className="arrival__date">{longDate(arrivalAt)}</p>
      <p className="arrival__saved">
        <PixelIcon name="up" size={9} tone="blue" />
        Your taps today: {minSec(savedS)} sooner
      </p>
    </section>
  );
}

/* ---------- Keep the signal alive ---------- */

interface SignalCardProps {
  leftS: number;
  urgent: boolean;
  pinged: boolean;
  streakDays: number;
  onPing: () => void;
  wide?: boolean;
}

export function SignalCard({ leftS, urgent, pinged, streakDays, onPing, wide = false }: SignalCardProps) {
  const timer = (
    <div
      className={urgent ? "signal__timer signal__timer--urgent" : "signal__timer"}
      role="timer"
      aria-label={`Signal time left ${hms(leftS)}`}
    >
      {hms(leftS)}
    </div>
  );
  const pingIcon = <PixelIcon name={pinged ? "check" : "signal"} size={18} tone={urgent && !wide ? "orange" : "blue"} />;

  if (wide) {
    return (
      <Window as="section" className="signal signal--wide" aria-labelledby="signal-label">
        <h2 id="signal-label" className="signal__label">
          <PixelIcon name="signal" size={18} tone="orange" />
          KEEP THE SIGNAL ALIVE
        </h2>
        {timer}
        <p className="signal__note">If this hits zero the probe goes quiet. Anyone can reset it, once a day each.</p>
        <PixelButton className="signal__ping" onClick={onPing} disabled={pinged} icon={pingIcon}>
          {pinged ? "Pinged · next one tomorrow" : "Ping · 1 left today"}
        </PixelButton>
        <div className="signal__badge">
          <PixelIcon name="star" size={18} tone="orange" />
          <div>
            <div className="signal__badge-name">Signal Keeper III</div>
            <div className="signal__badge-note">{streakDays}-day ping streak · 4 days to IV</div>
          </div>
        </div>
      </Window>
    );
  }

  return (
    <Window as="section" className={urgent ? "signal signal--urgent" : "signal"} aria-labelledby="signal-label">
      <div className="signal__info">
        <h2 id="signal-label" className="signal__label">
          {urgent ? "SIGNAL FADING · PING NOW" : "KEEP THE SIGNAL ALIVE"}
        </h2>
        {timer}
        <div className="signal__streak">
          <PixelIcon name="star" size={9} tone="orange" />
          Signal Keeper III · {streakDays} days
        </div>
      </div>
      <PixelButton
        className="signal__ping"
        variant={urgent ? "orange" : "blue"}
        onClick={onPing}
        disabled={pinged}
        icon={pingIcon}
      >
        {pinged ? "Pinged" : "Ping"}
      </PixelButton>
    </Window>
  );
}

/* ---------- Today's crew vote ---------- */

interface VoteCardProps {
  question: string;
  options: VoteOption[];
  total: number;
  mine: number | null;
  leftS: number;
  onVote: (index: number) => void;
  wide?: boolean;
}

export function VoteCard({ question, options, total, mine, leftS, onVote, wide = false }: VoteCardProps) {
  return (
    <Window as="section" className={wide ? "vote vote--wide" : "vote"} aria-labelledby="vote-label">
      <div className="vote__head">
        <h2 id="vote-label" className="vote__label">
          {wide && <PixelIcon name="check" size={18} tone="blue" />}
          TODAY'S CREW VOTE
        </h2>
        <span className="vote__left" aria-label={`Closes in ${hms(leftS)}`}>
          {wide ? hms(leftS) : `closes ${hms(leftS)}`}
        </span>
      </div>
      <p className="vote__question">{question}</p>
      <ul className="vote__options">
        {options.map((o, i) => {
          const pct = Math.round((o.votes / total) * 100);
          const isMine = mine === i;
          return (
            <li key={o.label}>
              <button
                type="button"
                className={isMine ? "vote__option vote__option--mine" : "vote__option"}
                style={{
                  background: `linear-gradient(90deg, ${isMine ? "var(--vote-bar-picked)" : "var(--vote-bar)"} ${pct}%, transparent ${pct}%)`,
                }}
                onClick={() => onVote(i)}
                disabled={mine !== null}
                aria-pressed={isMine}
              >
                <span className="vote__text">
                  <span>{o.label}</span>
                  {isMine && <span className="vote__mine">YOUR VOTE</span>}
                </span>
                <span className="vote__pct">{pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="vote__foot">{int(total)} votes · result goes in the mission log</p>
    </Window>
  );
}

/* ---------- Ad slot placeholder ---------- */

export function AdSlot({ width, height, wide = false }: { width: number; height: number; wide?: boolean }) {
  return (
    <aside className={wide ? "ad-slot ad-slot--wide" : "ad-slot"} aria-label="Advertisement">
      <div className="ad-slot__label" aria-hidden="true">
        ADVERTISEMENT
      </div>
      <div className="ad-slot__box" style={{ width, height }}>
        AD SLOT · {width}×{height}
      </div>
    </aside>
  );
}
