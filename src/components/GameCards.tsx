import { KEEPER_DAYS, ROMAN, keeperLevel } from "../../shared/badges";
import { hms, int, longDate, minSec } from "../game/format";
import type { VoteOption } from "../game/store";
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
      {idling !== null && (
        <div className="here-now__idling">
          + {int(idling)} thruster{idling === 1 ? "" : "s"} idling
        </div>
      )}
    </div>
  );
}

/* ---------- Safe mode (1f header) ---------- */

export function SafeChip() {
  return (
    <div className="safe-chip">
      <span className="safe-chip__dot" aria-hidden="true" />
      <span className="safe-chip__word">SAFE MODE</span>
    </div>
  );
}

/* ---------- Live arrival estimate ---------- */

/** `arrivalAt` is null while the probe is paused for lack of players (decision 5): the date is on hold. */
export function ArrivalEstimate({ arrivalAt, savedS, wide = false }: { arrivalAt: number | null; savedS: number; wide?: boolean }) {
  return (
    <section className={wide ? "arrival arrival--wide" : "arrival"} aria-labelledby="arrival-label">
      <h2 id="arrival-label" className="arrival__label">
        Live arrival estimate
      </h2>
      <p className="arrival__lede">{arrivalAt === null ? "Probe idle: tap to wake it" : "At this pace we arrive"}</p>
      <p className="arrival__date">{arrivalAt === null ? "On hold" : longDate(arrivalAt)}</p>
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
  /** A ping is on its way (bot check, then the server). */
  pinging?: boolean;
  streakDays: number;
  onPing: () => void;
  wide?: boolean;
}

export function SignalCard({ leftS, urgent, pinged, pinging = false, streakDays, onPing, wide = false }: SignalCardProps) {
  const days = `${streakDays} day${streakDays === 1 ? "" : "s"}`;
  // Your Signal Keeper level from today's streak (phase 8b: 3 / 7 / 21 / 30 days).
  const level = keeperLevel(streakDays);
  const nextDays = level < KEEPER_DAYS.length ? KEEPER_DAYS[level] - streakDays : 0;
  const keeperName = `Signal Keeper ${ROMAN[Math.max(0, level - 1)]}`;
  const keeperNote =
    level === KEEPER_DAYS.length
      ? `${streakDays}-day ping streak · top level`
      : `${streakDays}-day ping streak · ${nextDays} day${nextDays === 1 ? "" : "s"} to ${ROMAN[level]}`;
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
        <PixelButton className="signal__ping" onClick={onPing} disabled={pinged || pinging} icon={pingIcon}>
          {pinged ? "Pinged · next one tomorrow" : pinging ? "Pinging…" : "Ping · 1 left today"}
        </PixelButton>
        <div className="signal__badge">
          <PixelIcon name="star" size={18} tone="orange" />
          <div>
            <div className="signal__badge-name">{keeperName}</div>
            <div className="signal__badge-note">{keeperNote}</div>
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
          {level > 0 ? `${keeperName} · ${days}` : `${days} streak · Keeper I at ${KEEPER_DAYS[0]}`}
        </div>
      </div>
      <PixelButton
        className="signal__ping"
        variant={urgent ? "orange" : "blue"}
        onClick={onPing}
        disabled={pinged || pinging}
        icon={pingIcon}
      >
        {pinged ? "Pinged" : pinging ? "Pinging…" : "Ping"}
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
  /** A vote is on its way, or there's no line to the probe. */
  busy?: boolean;
  wide?: boolean;
}

export function VoteCard({ question, options, total, mine, leftS, onVote, busy = false, wide = false }: VoteCardProps) {
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
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const isMine = mine === i;
          return (
            <li key={o.id}>
              <button
                type="button"
                className={isMine ? "vote__option vote__option--mine" : "vote__option"}
                style={{
                  background: `linear-gradient(90deg, ${isMine ? "var(--vote-bar-picked)" : "var(--vote-bar)"} ${pct}%, transparent ${pct}%)`,
                }}
                onClick={() => onVote(i)}
                disabled={mine !== null || busy}
                aria-busy={busy && mine === null}
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
      <p className="vote__foot">
        {int(total)} vote{total === 1 ? "" : "s"} · result goes in the mission log
      </p>
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
