import { useEffect, useState } from "react";
import { nextStop, stop as campaignStop, stopName } from "../../shared/campaign";
import type { CreditsInfo, TourInfo, TourLeg } from "../../shared/boards";
import { GOLD_DAYS, MEDAL_NAMES, SILVER_DAYS, type Medal } from "../../shared/medals";
import { int } from "../game/format";
import { medalArt, stampIcon } from "../game/rewardArt";
import { PassportStamp } from "./PassportStamp";
import { PixelIcon } from "./PixelIcon";
import { Window } from "./Window";
import "./ArrivalRewards.css";

// The arrival rewards (1k, E4b part 2a): the crew's medal, the stop's planet tech (for everyone, at the medal's
// strength) and your passport stamp, or the "push on the next leg" card if you didn't tap on this leg.
// The unlock (cosmetics) comes in part 2c.

const MEDALS: Medal[] = ["gold", "silver", "bronze"];

/** "Arrived on day 24 · target was day 25" (Gold), or which medal it missed by a little. */
function dayLine(day: number, medal: Medal): string {
  if (medal === "gold") return `Arrived on day ${day} · target was day ${GOLD_DAYS}`;
  if (medal === "silver") return `Arrived on day ${day} · Gold needed day ${GOLD_DAYS}`;
  return `Arrived on day ${day} · Silver needed day ${SILVER_DAYS}`;
}

function togetherLine(crew: number): string {
  if (crew <= 0) return "The probe coasted in on its own.";
  if (crew === 1) return "One crew member did this.";
  return `${int(crew)} of you did this together.`;
}

/** Your leg from /api/tour (did you help?), retried while the arrival is still being written. */
function useMyLeg(missionId: number): TourLeg | null | "failed" {
  const [leg, setLeg] = useState<TourLeg | null | "failed">(null);
  useEffect(() => {
    let alive = true;
    const load = (tries: number) =>
      fetch("/api/tour", { cache: "no-store", credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((t: TourInfo) => {
          const found = t.legs.find((l) => l.missionId === missionId);
          if (found) {
            if (alive) setLeg(found);
          } else throw new Error("not yet");
        })
        .catch(() => {
          if (alive && tries > 0) window.setTimeout(() => void load(tries - 1), 3000);
          else if (alive) setLeg("failed");
        });
    void load(5);
    return () => {
      alive = false;
    };
  }, [missionId]);
  return leg;
}

interface ArrivalRewardsProps {
  credits: CreditsInfo;
  /** Where the crew goes next, for the "push on the next leg" card ("Ceres or Vesta"). */
  current: { stop: string; missionId: number };
}

export function ArrivalRewards({ credits, current }: ArrivalRewardsProps) {
  const mine = useMyLeg(credits.missionId);
  const s = campaignStop(credits.stop);
  const medal = credits.medal;
  const day = Math.max(1, Math.ceil((credits.arrivedAt - credits.startedAt) / 86_400_000));
  const tech = s?.tech;
  // The next leg: the leg flying now if the crew has moved on, else the branch vote's options, else the next stop.
  const nextNames =
    current.missionId > credits.missionId
      ? stopName(current.stop)
      : s?.branchVote?.length
        ? s.branchVote.map(stopName).join(" or ")
        : (nextStop(credits.stop)?.name ?? null);
  const techShort = tech ? tech.short.toLowerCase() : "planet tech";
  const techVerb = techShort.endsWith("s") ? "are" : "is";
  const empty = stampIcon(credits.stop);

  return (
    <Window as="section" className="rewards" aria-labelledby="rewards-title">
      <h2 id="rewards-title" className="rewards__kick">
        ARRIVAL REWARDS
      </h2>

      <div className="rewards__medal">
        <img className={`rewards__medal-art rewards__medal-art--${medal}`} src={medalArt(medal)} alt={`${MEDAL_NAMES[medal]} medal`} width={50} height={75} />
        <div className="rewards__medal-text">
          <p className="rewards__label">THE CREW EARNED</p>
          <p className={`rewards__medal-name rewards__medal-name--${medal}`}>{MEDAL_NAMES[medal].toUpperCase()}</p>
          <p className="rewards__day num">{dayLine(day, medal)}</p>
          <p className="rewards__together">{togetherLine(credits.crew)}</p>
        </div>
      </div>

      {tech && (
        <div className="rewards__panel rewards__panel--tech">
          <p className="rewards__panel-head">
            <PixelIcon name="bolt" size={18} tone="blue" />
            <span>PLANET TECH UNLOCKED · FOR EVERYONE</span>
          </p>
          <div>
            <p className="rewards__tech-name">{tech.name}</p>
            <p className="rewards__body">{tech[medal]} for the whole crew, forever.</p>
          </div>
          <ul className="rewards__tiers">
            {MEDALS.map((m) => (
              <li key={m} className={m === medal ? `rewards__tier rewards__tier--on rewards__tier--${m}` : "rewards__tier"}>
                <img src={medalArt(m)} alt="" width={10} height={15} />
                <span className="rewards__tier-name">{MEDAL_NAMES[m]}</span>
                <span className="rewards__tier-fx num">{tech[m]}</span>
                {m === medal && <span className="rewards__tier-earned">EARNED</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mine !== null && mine !== "failed" && mine.helped && (
        <div className="rewards__panel rewards__panel--stamp">
          <PassportStamp stop={credits.stop} leg={{ medal, arrivedAt: credits.arrivedAt, fromStop: credits.fromStop }} big />
          <div className="rewards__stamp-text">
            <p className="rewards__label">YOUR PASSPORT STAMP</p>
            <p className="rewards__body">
              Stamped in {MEDAL_NAMES[medal].toLowerCase()} because you pushed on this leg. It's on your profile now.
            </p>
          </div>
        </div>
      )}
      {mine !== null && mine !== "failed" && !mine.helped && (
        <div className="rewards__panel rewards__panel--stamp">
          <div className="rewards__empty" aria-hidden="true">
            <img src={empty.src} alt="" width={32} height={32} />
            <span>{stopName(credits.stop).toUpperCase()}</span>
          </div>
          <div className="rewards__stamp-text">
            <p className="rewards__tech-name">Push on the next leg to earn yours</p>
            <p className="rewards__body">
              You weren't on this leg, but the {techShort} {techVerb} yours too. Tap even once on the way to{" "}
              {nextNames ?? "the next stop"} and you'll get a stamp.
            </p>
          </div>
        </div>
      )}
    </Window>
  );
}
