import { useLayoutEffect, useRef, useState } from "react";
import { int, millionsKm } from "../game/format";
import type { Milestone } from "../game/rules";
import { SPRITES, STILLS } from "../sprites";
import { Sprite } from "./Sprite";
import { Window } from "./Window";
import "./JourneyTrack.css";

interface JourneyTrackProps {
  /** 0..1 along the route. */
  progress: number;
  distanceKm: number;
  milestones: Milestone[];
  routeKm: number;
  nextMilestone: Milestone | null;
  toNextKm: number;
  /** The wide layout: milestone labels and the Moon, no footer. */
  wide?: boolean;
}

/** Width of an element in whole pixels, kept up to date. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Earth on the left, Mars on the right, the probe on the dashed route between them. */
export function JourneyTrack({
  progress,
  distanceKm,
  milestones,
  routeKm,
  nextMilestone,
  toNextKm,
  wide = false,
}: JourneyTrackProps) {
  const [routeRef, routeW] = useWidth<HTMLDivElement>();
  // Snap to whole pixels so the probe sprite never sits between pixels (which would blur it).
  const px = (fraction: number) => Math.round(routeW * Math.min(1, Math.max(0, fraction)));
  const pct = `${(progress * 100).toFixed(2)}%`;
  // On a short route the passed milestones' names would overlap, so they show only their distance.
  const compact = routeW < 1000;

  return (
    <Window className={wide ? "track track--wide" : "track"} aria-label={`Route from Earth to Mars, ${pct} travelled`}>
      {!wide && (
        <div className="track__ends" aria-hidden="true">
          <span>EARTH</span>
          <span>{pct}</span>
          <span>MARS</span>
        </div>
      )}

      <div className="track__lane">
        <div className="track__earth">
          <Sprite sprite={SPRITES.earth} scale={1} label="Earth" />
        </div>
        {wide && (
          <img className="track__moon" src={STILLS.moon.src} alt="Moon" width={16} height={16} />
        )}
        <div className="track__mars">
          <Sprite sprite={SPRITES.mars} scale={0.5} label="Mars" />
        </div>

        <div className="track__route" ref={routeRef}>
          <div className="track__dash" />
          <div className="track__done" style={{ width: px(progress) }} />
          {milestones.map((m) => {
            const at = m.km / routeKm;
            const state = m.km <= distanceKm ? "passed" : m === nextMilestone ? "next" : "ahead";
            const tickClass = state === "passed" ? "track__tick" : `track__tick track__tick--${state}`;
            return (
              <div key={m.n}>
                <div className={tickClass} style={{ left: px(at) }} />
                {wide && (
                  <div
                    className={[
                      "track__label",
                      at < 0.08 && "track__label--start",
                      state !== "passed" && `track__label--${state}`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ left: px(at) }}
                  >
                    {state === "next" ? `Next · ${m.name}` : compact && state === "passed" ? null : m.name}
                    <span className="num">{state === "next" ? `in ${millionsKm(toNextKm)}` : `${m.km / 1e6}M km`}</span>
                  </div>
                )}
              </div>
            );
          })}
          <div className="track__probe" style={{ left: px(progress) }}>
            <Sprite sprite={SPRITES.thruster} scale={1} bob label="Probe OSC-1" />
          </div>
        </div>
      </div>

      {!wide && (
        <div className="track__foot">
          <div>
            <div className="label-sm">Travelled</div>
            <div className="num">{int(distanceKm)} km</div>
          </div>
          {nextMilestone && (
            <div className="track__foot-next">
              <div className="label-sm">Next · {nextMilestone.name}</div>
              <div className="num">{millionsKm(toNextKm)}</div>
            </div>
          )}
        </div>
      )}
    </Window>
  );
}
