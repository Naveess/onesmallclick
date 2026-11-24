import { useEffect, useState } from "react";
import { probeBefore, probeById, stop as campaignStop } from "../../shared/campaign";
import { UPGRADES } from "../game/rules";
import { stopArt } from "../game/mapArt";
import { PixelButton } from "./PixelButton";
import { PixelIcon } from "./PixelIcon";
import { ProbeArt } from "./ProbeArt";
import { Sprite } from "./Sprite";
import "./NewProbeReveal.css";

const SEEN_KEY = "osc.probeSeen";

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(id: string) {
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    // Private mode: the reveal may show again next visit; harmless.
  }
}

/**
 * E2: the new probe reveal (1n) shows once per new probe, to everyone (Nav, prompt 71). OSC-1 never gets one
 * (it's the probe every player starts with). Returns the probe to reveal and what it replaced, or null.
 */
export function useProbeReveal(ready: boolean, probeId: string, stopId: string) {
  const [seen, setSeen] = useState<string | null>(readSeen);
  useEffect(() => {
    // A first visit on the first leg: remember OSC-1, so the next probe's reveal names what it replaces.
    if (ready && seen === null && probeId === "pathfinder") {
      writeSeen(probeId);
      setSeen(probeId);
    }
  }, [ready, seen, probeId]);
  const show = ready && probeId !== "pathfinder" && seen !== probeId;
  const before = (seen && seen !== probeId ? probeById(seen) : undefined) ?? probeBefore(stopId) ?? probeById("pathfinder");
  return {
    show,
    beforeId: before?.id ?? "pathfinder",
    done: () => {
      writeSeen(probeId);
      setSeen(probeId);
    },
  };
}

interface NewProbeRevealProps {
  probeId: string;
  /** The probe it replaces (for "Cold-gas jets are now Hop jets"). */
  beforeId: string;
  /** Where this leg is heading. */
  stopId: string;
  wide: boolean;
  onClose: () => void;
}

/** "NEW MISSION · ASTEROID BELT … OSC-2 Ceres Hopper … Your upgrades have new names" (1n). */
export function NewProbeReveal({ probeId, beforeId, stopId, wide, onClose }: NewProbeRevealProps) {
  const probe = probeById(probeId);
  const before = probeById(beforeId);
  const dest = campaignStop(stopId);
  const art = stopArt(stopId);
  if (!probe) return null;

  const renamed = UPGRADES.map((u) => ({
    key: u.key,
    from: before?.upgrades?.[u.key]?.name ?? u.name,
    to: probe.upgrades?.[u.key]?.name ?? u.name,
  })).filter((r) => r.from !== r.to);

  const destArt =
    art.kind === "sheet" ? (
      <Sprite sprite={art.sheet} scale={2} />
    ) : art.kind === "still" ? (
      <img src={art.still.src} alt="" width={art.still.width * (art.still.width <= 64 ? 2 : 1)} height={art.still.height * (art.still.width <= 64 ? 2 : 1)} />
    ) : (
      <img src={art.src} alt="" width={art.w * 2} height={art.h * 2} />
    );

  return (
    <main className={wide ? "reveal reveal--wide" : "reveal"} aria-labelledby="reveal-title">
      <p className="reveal__kick reveal__in">NEW MISSION · {(dest?.region ?? "").toUpperCase()}</p>
      <div className="reveal__scene" aria-hidden="true">
        <span className="reveal__dest">{destArt}</span>
        <span className="reveal__fly">
          <ProbeArt id={probe.id} scale={2} />
        </span>
      </div>
      <div className="reveal__in reveal__in--2">
        <h1 id="reveal-title" className="reveal__name">
          {probe.name}
        </h1>
        <p className="reveal__pitch">{probe.pitch}</p>
        <p className="reveal__to">Heading for {dest?.name ?? stopId}.</p>
      </div>
      {renamed.length > 0 && (
        <section className="reveal__names reveal__in reveal__in--3" aria-labelledby="reveal-names">
          <h2 id="reveal-names" className="reveal__label">
            YOUR UPGRADES HAVE NEW NAMES
          </h2>
          <ul>
            {renamed.map((r) => (
              <li key={r.key} className="reveal__row">
                <PixelIcon name="bolt" size={9} tone="blue" />
                <span>
                  <span className="reveal__old">{r.from}</span> {r.from.endsWith("s") && !r.from.endsWith("ss") ? "are" : "is"} now{" "}
                  <span className="reveal__new">{r.to}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="reveal__note">Same levels, same power. Only the names change.</p>
        </section>
      )}
      <PixelButton autoFocus variant="blue" block className="reveal__go reveal__in reveal__in--4" onClick={onClose}>
        Take the controls
      </PixelButton>
    </main>
  );
}
