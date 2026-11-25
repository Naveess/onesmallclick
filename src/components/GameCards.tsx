import { ShareNudge } from "./ShareNudge";
import { useUnits } from "../game/units";
import { GOAL_BONUS_CAP, type CrewGoal } from "../../shared/goal";
import { LocalTime } from "./LocalTime";
import { KEEPER_DAYS, ROMAN, keeperLevel } from "../../shared/badges";
import { MEDAL_NAMES, type MedalPace } from "../../shared/medals";
import { medalArt } from "../game/rewardArt";
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
export function ArrivalEstimate({
  arrivalAt,
  savedS,
  wide = false,
  orbit = null,
  pace = null,
}: {
  arrivalAt: number | null;
  savedS: number;
  wide?: boolean;
  /** In orbit (phase 8c): when we arrived, and a way back to the credits. */
  orbit?: { at: number; destName: string; onCredits: () => void } | null;
  /** The medal we're on pace for (E4b part 1); null hides the line. */
  pace?: MedalPace | null;
}) {
  if (orbit) {
    return (
      <section className={wide ? "arrival arrival--wide" : "arrival"} aria-labelledby="arrival-label">
        <h2 id="arrival-label" className="arrival__label">
          {orbit.destName} orbit reached
        </h2>
        <p className="arrival__lede">We made it. We arrived on</p>
        <p className="arrival__date">{longDate(orbit.at)}</p>
        <button type="button" className="arrival__credits" onClick={orbit.onCredits}>
          Watch the credits again
        </button>
      </section>
    );
  }
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
      {pace && <MedalPaceLine pace={pace} />}
    </section>
  );
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The design's medal box: "Gold if we arrive by 14 Feb · on pace for Silver", a bar, and the days to go. */
function MedalPaceLine({ pace }: { pace: MedalPace }) {
  const { medal, target } = pace;
  const gap = medal === "gold" ? "top tier · hold it" : `${pace.gapDays.toFixed(1)} days to ${MEDAL_NAMES[target]}`;
  return (
    <div className="pace">
      <p className="pace__line">
        <img className="pace__medal" src={medalArt(medal)} alt="" width={20} height={30} />
        <span>
          {MEDAL_NAMES[target]} if we arrive by {dayMonth.format(new Date(pace.targetBy))} ·{" "}
          <span className={`pace__name pace__name--${medal}`}>on pace for {MEDAL_NAMES[medal]}</span>
        </span>
      </p>
      <div className="pace__row">
        <div className="pace__bar" aria-hidden="true">
          <div className={`pace__fill pace__fill--${target}`} style={{ width: `${Math.round(pace.bar * 100)}%` }} />
        </div>
        <span className="pace__gap num">{gap}</span>
      </div>
    </div>
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
  // Before Signal Keeper I it's just a streak (prompt 40: "Signal Keeper I · 1 day to I" read as if you had it).
  const keeperName = level > 0 ? `Signal Keeper ${ROMAN[level - 1]}` : "Ping streak";
  const toNext = `${nextDays} day${nextDays === 1 ? "" : "s"} to ${level > 0 ? ROMAN[level] : "Signal Keeper I"}`;
  const keeperNote =
    level === KEEPER_DAYS.length ? `${streakDays}-day ping streak · top level` : `${streakDays}-day ping streak · ${toNext}`;
  const timer = (
    <div
      className={urgent ? "signal__timer signal__timer--urgent" : "signal__timer"}
      role="timer"
      aria-label={`Signal time left ${hms(leftS)}`}
    >
      {hms(leftS)}
      {leftS > 86_400 && (
        <span className="signal__when">
          runs out <LocalTime at={Math.round((Date.now() + leftS * 1000) / 60_000) * 60_000} utc={false} />
        </span>
      )}
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
  /** When the round closes (phase Q1a: shown in the player's own time). */
  closesAt?: number;
  onVote: (index: number) => void;
  /** A vote is on its way, or there's no line to the probe. */
  busy?: boolean;
  wide?: boolean;
}

export function VoteCard({ question, options, total, mine, leftS, closesAt, onVote, busy = false, wide = false }: VoteCardProps) {
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
        {closesAt !== undefined && (
          <>
            <br />
            Closes <LocalTime at={closesAt} />
          </>
        )}
      </p>
    </Window>
  );
}

/* ---------- The daily crew goal (phase Q1a) ---------- */

/** "Crew goal today: 12,800 of 20,000 km, 64%": the crew's km today against the target set at 00:00 UTC. */
export function GoalCard({ goal, destName, wide = false }: { goal: CrewGoal; destName: string; wide?: boolean }) {
  const pct = Math.min(100, Math.floor((goal.km / Math.max(1, goal.targetKm)) * 100));
  const reached = goal.reachedAt !== null;
  const units = useUnits();
  return (
    <Window as="section" tone={reached ? "orange" : "blue"} className={wide ? "goal goal--wide" : "goal"} aria-labelledby="goal-label">
      <div className="goal__head">
        <h2 id="goal-label" className="goal__label">
          {wide && <PixelIcon name="trophy" size={18} tone="orange" />}
          {reached ? "CREW GOAL REACHED" : "CREW GOAL TODAY"}
        </h2>
        <span className="goal__pct num">{pct}%</span>
      </div>
      <div
        className="goal__bar"
        role="progressbar"
        aria-label="Crew goal today"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={reached ? "goal__fill goal__fill--reached" : "goal__fill"} style={{ width: `${pct}%` }} />
      </div>
      <p className="goal__nums num">
        {units.of(goal.km, goal.targetKm)}
      </p>
      <p className="goal__note">
        {reached ? (
          <>
            Reached at <LocalTime at={goal.reachedAt!} utc={false} />. Everyone who pushed today gets 10% of their km
            today as credits (up to {int(GOAL_BONUS_CAP)}), paid at 00:00 UTC.
          </>
        ) : (
          <>Reach it together and everyone who pushed today gets 10% of their km today as credits (up to {int(GOAL_BONUS_CAP)}).</>
        )}
      </p>
      {reached && (
        <ShareNudge
          moment="goal"
          variant="orange"
          fill={{ target: goal.targetKm, dest: destName }}
          label="Share the goal"
          title="Share today's crew goal"
        />
      )}
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
