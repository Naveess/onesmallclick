import { kmMi } from "../../shared/units";
import { postcardOf } from "../../shared/postcards";
import { PostcardPhoto } from "./PostcardPhoto";
import { useEffect, useRef, useState } from "react";
import { milestoneDetail, milestonesFor } from "../../shared/milestones";
import type { ReachedMilestone } from "../../shared/milestones";
import { resultLine, sentence, shareMessage } from "../../shared/share";
import { useGame } from "../game/store";
import { SPRITES } from "../sprites";
import { usePrefersReducedMotion } from "../theme";
import { PixelButton } from "./PixelButton";
import { ShareSheet } from "./ShareSheet";
import { Window } from "./Window";
import "./MilestoneMoment.css";
import "./Postcard.css";

/** Each leg's postcard stamp (32px). Only Mars has one so far; the 16x16 stamp icons come from PixelLab
 * (docs/todo.md), and a leg without one shows no stamp. */
const STAMPS: Record<string, string> = { mars: "/sprites/mars-32.png" };

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

interface Today {
  missionDay: number;
  /** Where this leg is heading ("Mars" unless the tour has moved on). */
  destName?: string;
  progress: number;
  kmToday: number;
  /** Null while the probe is paused. */
  arrivalAt: number | null;
  now: number;
}

interface MilestoneMomentProps {
  reached: ReachedMilestone;
  /** The leg's destination (each leg has its own milestones from E3). */
  stopId: string;
  /** The mission day it was reached, or null if the probe has since set off on the next leg. */
  missionDay: number | null;
  /** For the share text. */
  today: Today;
  wide: boolean;
  onClose: () => void;
}

/** The design's share card: "OneSmallClick · Day 63 🚀 / ▰▰▰▰▰▱▱▱▱▱ 50% to Mars / …" (shared/share.ts resultLine). */
export function shareText(t: Today & { cc?: string | null }): string {
  return resultLine({
    missionDay: t.missionDay,
    destName: t.destName ?? "Mars",
    progress: t.progress,
    kmToday: t.kmToday,
    cc: t.cc,
    arrival: t.arrivalAt === null ? "on hold" : shortDate.format(new Date(t.arrivalAt)),
  });
}

/** Fireworks and pixel confetti, as the design's celebrate(): five bursts, 48 squares, all in steps. */
function celebrate(host: HTMLElement) {
  const w = host.offsetWidth;
  const s = SPRITES.burst;
  const colours = ["var(--orange)", "var(--text-orange-soft)", "var(--blue)", "var(--text)", "var(--orange-deep)"];
  const size = s.frameWidth * 2;
  const bursts: [number, number, number][] = [
    [0.2, 70, 0],
    [0.78, 40, 260],
    [0.55, 150, 520],
    [0.15, 260, 820],
    [0.85, 230, 1080],
  ];
  for (const [fx, y, delay] of bursts) {
    const box = document.createElement("div");
    box.className = "moment__burst";
    box.style.cssText = `left:${Math.round(fx * w - size / 2)}px;top:${y}px;width:${size}px;height:${size}px`;
    const img = document.createElement("img");
    img.src = s.src;
    img.alt = "";
    img.style.width = `${s.frames * 100}%`;
    box.appendChild(img);
    host.appendChild(box);
    img.animate([{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }], {
      duration: s.durationMs,
      delay,
      easing: `steps(${s.frames})`,
      fill: "both",
    });
    box.animate(
      [
        { opacity: 1, transform: "scale(0.5)" },
        { opacity: 1, transform: "scale(1)", offset: 0.6 },
        { opacity: 0, transform: "scale(1.1)" },
      ],
      { duration: s.durationMs + 40, delay, easing: "steps(6)", fill: "both" },
    ).onfinish = () => box.remove();
  }
  for (let i = 0; i < 48; i++) {
    const bit = document.createElement("span");
    const z = [4, 6, 8][i % 3];
    bit.className = "moment__confetti";
    bit.style.cssText = `left:${Math.round(Math.random() * w)}px;width:${z}px;height:${z}px;background:${colours[i % 5]}`;
    host.appendChild(bit);
    bit.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${Math.round((Math.random() - 0.5) * 90)}px,${Math.round(320 + Math.random() * 480)}px) rotate(${Math.random() > 0.5 ? 180 : -180}deg)`,
          opacity: 0,
        },
      ],
      { duration: 1700 + Math.random() * 1200, delay: Math.random() * 450, easing: "steps(16)" },
    ).onfinish = () => bit.remove();
  }
}

/** The milestone moment (1e): postcard, a fact from the flight deck, fireworks, and a result to share. */
export function MilestoneMoment({ reached, stopId, missionDay, today, wide, onClose }: MilestoneMomentProps) {
  const probeTag = useGame().view.probeTag;
  const fx = useRef<HTMLDivElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const all = milestonesFor(stopId);
  const m = all.find((x) => x.n === reached.n);
  const stamp = STAMPS[stopId];
  const text = shareText(today);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (reduceMotion || !fx.current) return;
    const host = fx.current;
    const t = window.setTimeout(() => celebrate(host), 300);
    return () => window.clearTimeout(t);
  }, [reached.n, reduceMotion]);
  // A milestone this leg's file doesn't have (it can't happen with matching content): skip the moment.
  useEffect(() => {
    if (!m) onClose();
  }, [m, onClose]);
  if (!m) return null;
  const card = String(m.n).padStart(2, "0");
  const photo = postcardOf(stopId, m.n);

  return (
    <main className={wide ? "moment moment--wide" : "moment"} aria-labelledby="moment-title">
      <div className="moment__head">
        <p className="moment__label">
          MILESTONE {m.n} OF {all.length} REACHED
        </p>
        <h1 id="moment-title" className="moment__title">
          {m.title}
        </h1>
        <p className="moment__where num">
          {kmMi(m.km)}
          {missionDay !== null ? ` · mission day ${missionDay}` : ""}
        </p>
      </div>

      <figure className="postcard">
        <div className="postcard__photo">
          {photo ? <PostcardPhoto photo={photo} /> : <p className="postcard__soon">Postcard photo coming soon</p>}
          {stamp && (
            <div className="postcard__stamp" aria-hidden="true">
              <img src={stamp} alt="" width={32} height={32} />
            </div>
          )}
        </div>
        <figcaption className="postcard__caption">
          <span>Wish you were here. — {probeTag}</span>
          <span className="postcard__no num">POSTCARD {card}</span>
        </figcaption>
      </figure>

      <Window tone="orange" as="section" className="moment__deck" aria-labelledby="moment-deck">
        <h2 id="moment-deck" className="moment__deck-label">
          FROM THE FLIGHT DECK
        </h2>
        <p>{m.fact}</p>
        <p>{m.sub}</p>
        <a className="moment__more" href={`/milestones/${m.slug}`}>
          Read more about this milestone →
        </a>
      </Window>

      <p className="moment__share num" aria-label="Your result to share">
        {text.split("\n").map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>

      <div className="moment__buttons">
        <PixelButton variant="orange" onClick={() => setSharing(true)} aria-haspopup="dialog">
          Share result
        </PixelButton>
        <PixelButton variant="outline" onClick={onClose} autoFocus>
          Keep flying
        </PixelButton>
      </div>

      <div ref={fx} className="moment__fx" aria-hidden="true" />
      {sharing && (
        <ShareSheet
          moment="milestone"
          detail={milestoneDetail(stopId, m.n)}
          text={`${shareMessage("milestone", { milestone: sentence(m.title), probe: probeTag, dest: today.destName ?? "Mars" })}

${text}`}
          title="Share this milestone"
          onClose={() => setSharing(false)}
        />
      )}
    </main>
  );
}
