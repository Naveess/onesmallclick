import { miles, millionsMi, miOnly } from "../../shared/units";
import { Fragment, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { CREW_TOP_KM_S } from "../../shared/balance";
import { hms, int, longDate, millionsKm, probeSpeed } from "../game/format";
import {
  EARTH_RADII,
  FLAME,
  MARS_RADII,
  cometArt,
  destinationArt,
  flameArt,
  miniProbeArt,
  phobosArt,
  stepDown,
  stepUp,
  streaksArt,
} from "../game/flightArt";
import { nextStop, stop as campaignStop, stopName } from "../../shared/campaign";
import type { Milestone } from "../game/rules";
import { usePrefersReducedMotion } from "../theme";
import { ProbeArt, probeHeight } from "./ProbeArt";
import "./FlightView.css";

/** Milestones closer to Earth than this share of the route (the Moon's orbit, L2) would sit on Earth's
 * square on the route strip, so they get no tick there. The beacon still points at them. */
const TICK_MIN_SHARE = 0.02;
/** How long THRUST's boost lasts (the design's 240 ms). */
const BOOST_MS = 240;

export interface FlightHandle {
  /** THRUST was tapped for this many km: boost the probe and pop "+km". */
  boost(km: number): void;
}

interface FlightViewProps {
  wide?: boolean;
  /** 0..1 along the route. */
  progress: number;
  distanceKm: number;
  routeKm: number;
  speedKmS: number;
  /** What the crew adds right now (taps and auto-thrust): drives the crew sparks. */
  crewKmS: number;
  online: number;
  /** ?crew=handful: show the small-crew look whatever the pace. */
  handful: boolean;
  arrivalAt: number | null;
  milestones: Milestone[];
  nextMilestone: Milestone | null;
  toNextKm: number;
  /** Safe mode: engine off, the probe greyed out, drifting. */
  safe: boolean;
  /** The final 60 seconds of the signal. */
  urgent: boolean;
  signalLeftS: number;
  /** The idle pause: nobody is tapping, so the probe waits (decision 5). */
  paused: boolean;
  /** This leg of the Grand Tour (phase 8c): where it's heading and where it started. */
  stop?: string;
  fromStop?: string;
  /** In orbit at `stop`, waiting for the branch vote. */
  orbit?: boolean;
  /** The probe flying this leg (E2): its id and tag ("OSC-2"). */
  probeId?: string;
  probeTag?: string;
  /** A moon leg: the speed reads in km/h. */
  moonLeg?: boolean;
  /** The landing burn (E4b part 2b): seconds to landing and how full the bar is, or null. */
  burn?: { leftS: number; share: number } | null;
  handle?: Ref<FlightHandle>;
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

const at = (left: number, top: number, extra?: CSSProperties): CSSProperties => ({ left, top, ...extra });

/**
 * The game home's flight view (design 1a/1b, "flight view", 19 Nov): side-on, the probe flies right
 * towards a growing Mars while Earth shrinks behind. The layout follows the design's flightVals().
 */
export function FlightView({
  wide = false,
  progress,
  distanceKm,
  routeKm,
  speedKmS,
  crewKmS,
  online,
  handful,
  arrivalAt,
  milestones,
  nextMilestone,
  toNextKm,
  safe,
  urgent,
  signalLeftS,
  paused,
  stop = "mars",
  fromStop = "earth",
  orbit = false,
  handle,
  probeId = "pathfinder",
  probeTag = "OSC-1",
  moonLeg = false,
  burn = null,
}: FlightViewProps) {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const reduceMotion = usePrefersReducedMotion();
  const [boost, setBoost] = useState<{ km: number; n: number } | null>(null);
  const boostTimer = useRef<number | undefined>(undefined);

  useImperativeHandle(handle, () => ({
    boost(km: number) {
      if (km <= 0) return;
      window.clearTimeout(boostTimer.current);
      setBoost((b) => ({ km, n: (b?.n ?? 0) + 1 }));
      boostTimer.current = window.setTimeout(() => setBoost(null), BOOST_MS);
    },
  }));
  useEffect(() => () => window.clearTimeout(boostTimer.current), []);

  const size = wide ? "wide" : "phone";
  const W = measured || (wide ? 1300 : 354);
  const H = wide ? 300 : 210;
  const f = Math.max(0, Math.min(1, progress));
  const boosting = boost !== null && !safe && !paused;
  const engineOn = !safe && !paused && !reduceMotion;

  // Mars grows and Earth shrinks, a fixed size at a time (whole pixels, never scaled).
  const mR0 = MARS_RADII[size][0];
  const mR = stepUp(MARS_RADII[size], (wide ? 14 : 9) + (wide ? 120 : 62) * Math.pow(f, 1.4));
  const eR = stepDown(EARTH_RADII[size], Math.max(3, (wide ? 40 : 24) - (wide ? 34 : 20) * Math.pow(f, 0.6)));
  const mS = mR * 2 + 2;
  const eS = eR * 2 + 2;
  const cy = Math.round(H * (wide ? 0.48 : 0.5));
  const mx = Math.round(W - (wide ? 120 : 40) - mR * 0.2);
  const px = Math.round(W * ((wide ? 0.14 : 0.16) + (wide ? 0.46 : 0.42) * f));
  const shift = boosting ? 8 : 0;

  // The beacon: the next milestone, further ahead the further it is.
  const next = nextMilestone;
  const nextShare = next ? next.km / routeKm : 1;
  const prevShare = next ? (milestones.filter((m) => m.km < next.km).pop()?.km ?? 0) / routeKm : 0;
  const beaconLabel = next ? `NEXT · ${next.name.toUpperCase()}` : "";
  const bxRaw = next
    ? Math.round(px + 50 + Math.min(1, (nextShare - f) / Math.max(1e-9, nextShare - prevShare)) * Math.max(10, mx - mR - px - 120))
    : 0;
  // Keep the label inside the window (about 7px a character at 10px with letter-spacing).
  const bx = Math.max(px + 40, Math.min(bxRaw, W - 8 - (beaconLabel.length * 7 + 14)));

  // Crew sparks: more of them the harder the crew is pushing (no per-tap messages).
  const maxSparks = wide ? 9 : 6;
  const share = Math.max(0, Math.min(1, crewKmS / CREW_TOP_KM_S));
  const sparkCount = !engineOn ? 0 : handful ? 2 : crewKmS > 0 ? Math.max(2, Math.round(maxSparks * Math.sqrt(share))) : 0;
  const sparks = Array.from({ length: sparkCount }, (_, i) => i);

  const trail: { x: number; k: number }[] = [];
  for (let x = 8; x < px - 34; x += 8) trail.push({ x, k: x / Math.max(1, px - 34) });
  const ahead: number[] = [];
  for (let x = px + 40; x < mx - mR - 8; x += 12) ahead.push(x);

  // Where this leg goes, and what's beyond it (content/campaign.json): the two branches voted on at the
  // destination, or the one stop that follows it.
  const destName = stopName(stop);
  const fromName = stopName(fromStop);
  const beyond = campaignStop(stop)?.branchVote ?? (nextStop(stop) ? [nextStop(stop)!.id] : []);
  const fork = beyond.length === 2;
  const further = beyond[0] ? nextStop(beyond[0]) : undefined;
  const small = (id: string) => destinationArt(id, 7); // 16×16
  const far = [
    ...(beyond[0] ? [{ id: beyond[0], x: W - 64, y: wide ? 50 : 44, label: fork ? `${stopName(beyond[0])}?` : stopName(beyond[0]) }] : []),
    ...(fork ? [{ id: beyond[1], x: W - (wide ? 30 : 26), y: wide ? 96 : 74, label: `${stopName(beyond[1])}?` }] : []),
    ...(wide && further ? [{ id: further.id, x: W - 190, y: 44, label: further.name }] : []),
  ].map((b) => ({ ...b, img: small(b.id), w: 16, h: 16 }));

  // The route strip along the bottom: Earth, the probe, Mars, then the fork to Ceres or Vesta.
  const SW = W - 24;
  const xm = Math.round(SW * 0.78);
  const xp = Math.round(f * xm);
  const xk = xm + 10;
  const xf = Math.round(SW * (wide ? 0.9 : 0.875));

  const pct = `${(f * 100).toFixed(2)}%`;
  const speed = probeSpeed(speedKmS, moonLeg);
  const fl = boosting ? 4 : 2; // the flame at 2×, or 4× while boosting
  const streaks = streaksArt();

  const classes = ["flight", wide && "flight--wide", paused && "flight--still"].filter(Boolean).join(" ");

  return (
    <section className={wide ? "flightview flightview--wide" : "flightview"} aria-label="Flight view">
      <div
        ref={ref}
        className={classes}
        role="img"
        aria-label={`Flight view: the probe is ${pct} of the way to ${destName}, moving at ${speed} km (${miles(Number(speed)).toFixed(2)} miles) per second${
          fork ? `; at ${destName} the crew votes ${stopName(beyond[0])} or ${stopName(beyond[1])}` : ""
        }`}
      >
        <div className="flight__stars flight__stars--far" />
        <div className="flight__stars flight__stars--near" />
        {engineOn && (
          <>
            <div className="flight__streaks" style={{ backgroundImage: `url(${streaks})` }} />
            <div
              className="flight__streaks flight__streaks--boost"
              style={{ backgroundImage: `url(${streaks})`, opacity: boosting ? 1 : 0 }}
            />
          </>
        )}
        {!reduceMotion && (
          <img
            className="flight__comet"
            src={cometArt()}
            alt=""
            width={36}
            height={10}
            style={
              {
                left: W,
                top: wide ? 20 : 24,
                "--cx": wide ? "-900px" : "-420px",
                "--cy": wide ? "150px" : "90px",
              } as CSSProperties
            }
          />
        )}

        {far.map((p) => (
          <Fragment key={p.label}>
            <img className="flight__far" src={p.img} alt="" width={p.w} height={p.h} style={at(p.x - p.w / 2, p.y - p.h / 2)} />
            <span className="flight__far-label" style={at(p.x, p.y + 10)}>
              {p.label}
            </span>
          </Fragment>
        ))}

        <span className="flight__mars-glow" style={at(mx - mR - 12, cy - mR - 12, { width: mS + 22, height: mS + 22 })} />
        <img className="flight__planet" src={destinationArt(stop, mR)} alt="" width={mS} height={mS} style={at(mx - mR - 1, cy - mR - 1)} />
        {stop === "mars" && f > 0.85 && (
          <img className="flight__phobos" src={phobosArt()} alt="" width={6} height={4} style={at(mx - mR - 14, cy - Math.round(mR * 0.7))} />
        )}
        <img
          className="flight__planet flight__earth"
          src={destinationArt(fromStop, eR)}
          alt=""
          width={eS}
          height={eS}
          style={at(-Math.round(eR * 0.9), cy + 26 - eR - 1)}
        />

        {next && (
          <div className="flight__beacon" style={at(bx, cy + 24)}>
            <span className="flight__beacon-light" />
            <span className="flight__beacon-pole" />
            <span className="flight__beacon-label">{beaconLabel}</span>
          </div>
        )}

        {sparks.map((i) => (
          <span
            key={i}
            className={i % 3 ? "flight__spark" : "flight__spark flight__spark--white"}
            style={
              {
                top: cy - 14 + ((i * 7) % 28),
                "--d": `${px - 26}px`,
                animationDelay: `${(i * 0.37).toFixed(2)}s`,
              } as CSSProperties
            }
          />
        ))}
        {engineOn && (
          <div
            className="flight__flame"
            style={at(px - 32 + 14 - 12 * fl + shift, cy - 1 - 3 * fl, { width: 12 * fl, height: 6 * fl })}
          >
            <img src={flameArt()} alt="" width={FLAME.frameWidth * FLAME.frames * fl} height={FLAME.frameHeight * fl} />
          </div>
        )}

        {ahead.map((x) => (
          <span key={x} className="flight__ahead" style={at(x, cy)} />
        ))}
        {trail.map(({ x, k }) => (
          <span
            key={x}
            className="flight__trail"
            style={at(x, cy - 1, { width: k > 0.7 ? 3 : 2, height: k > 0.7 ? 3 : 2, opacity: +(0.25 + 0.75 * k).toFixed(2) })}
          />
        ))}

        <div
          className={safe ? "flight__probe flight__probe--off" : "flight__probe"}
          style={at(px - 32 + shift, cy - probeHeight(probeId) / 2)}
        >
          <ProbeArt id={probeId} engine={!(safe || paused)} bob={!(safe || paused)} />
        </div>
        {boosting && !reduceMotion && (
          <span key={boost.n} className="flight__pop" style={at(px + 12, cy - 44)}>
            +{boost.km} km
          </span>
        )}

        <div className="flight__head">
          <span className="flight__id">
            {wide ? `FLIGHT VIEW · ${probeTag}` : probeTag}
            <span className="flight__pct">{pct}</span>
          </span>
          <span className="flight__speed">
            <span className="flight__chev" style={{ opacity: boosting ? 1 : 0.35 }}>
              ›››
            </span>
            {speed}
            {wide && (
              <>
                <span className="flight__eta-label">ETA</span> {arrivalAt === null ? "On hold" : longDate(arrivalAt)}
              </>
            )}
          </span>
        </div>

        {safe ? (
          <div className="flight__chip flight__chip--safe">
            SAFE MODE · ENGINE OFF<span>Drifting. Ping to wake the probe.</span>
          </div>
        ) : burn ? (
          <div className="flight__chip flight__chip--burn">
            LANDING BURN <span className="flight__chip-num">{hms(burn.leftS)}</span> · {Math.floor(Math.min(1, burn.share) * 100)}%
          </div>
        ) : orbit ? (
          <div className="flight__chip flight__chip--idle">
            IN {destName.toUpperCase()} ORBIT<span>The crew is voting on where next.</span>
          </div>
        ) : urgent ? (
          <div className="flight__chip flight__chip--low">
            SIGNAL <span className="flight__chip-num">{hms(signalLeftS)}</span> · PING NOW
          </div>
        ) : paused ? (
          <div className="flight__chip flight__chip--idle">
            PROBE IDLE<span>Tap THRUST to wake it.</span>
          </div>
        ) : null}

        <div className="flight__info">
          <span>
            <span className="flight__info-num">{int(online)}</span> crew pushing
          </span>
          <span>
            {destName} looks <span className="flight__info-num flight__info-num--orange">{(mR / mR0).toFixed(1)}×</span> bigger than at launch
          </span>
        </div>

        <div className="flight__strip">
          <div className="flight__route">
            <span className="flight__origin" />
            <span className="flight__rest" style={at(xp, 13, { width: Math.max(0, xm - xp) })} />
            <span className="flight__done" style={at(0, 12, { width: xp })} />
            {milestones
              .filter((m) => m.km / routeKm >= TICK_MIN_SHARE)
              .map((m) => (
                <span
                  key={m.n}
                  className={
                    m.km <= distanceKm ? "flight__tick flight__tick--passed" : m === next ? "flight__tick flight__tick--next" : "flight__tick"
                  }
                  style={at(Math.round((m.km / routeKm) * xm) - 1, 7)}
                />
              ))}
            <img className="flight__mini" src={miniProbeArt()} alt="" width={24} height={10} style={at(xp - 12, 9)} />
            <span className="flight__mars-dot" style={at(xm - 5, 9)} />
            {fork ? (
              <>
                <span className="flight__dash" style={at(xm + 5, 13, { width: xk - xm - 5 })} />
                <span className="flight__fork" style={at(xk, 2)} />
                <span className="flight__dash" style={at(xk, 2, { width: xf - xk })} />
                <span className="flight__dash" style={at(xk, 24, { width: xf - xk })} />
                {beyond.map((id, i) => (
                  <span key={id} className="flight__branch" style={at(xf, i === 0 ? -1 : 21)}>
                    <img src={destinationArt(id, 3)} alt="" width={8} height={8} />
                    {stopName(id)}
                  </span>
                ))}
              </>
            ) : beyond[0] ? (
              <>
                <span className="flight__dash" style={at(xm + 5, 13, { width: xf - xm - 5 })} />
                <span className="flight__branch" style={at(xf, 10)}>
                  <img src={destinationArt(beyond[0], 3)} alt="" width={8} height={8} />
                  {stopName(beyond[0])}
                </span>
              </>
            ) : null}
          </div>
          <span className="flight__strip-label">{fromName.toUpperCase()}</span>
          <span className="flight__strip-label flight__strip-label--vote">
            {fork ? `CREW VOTE AT ${destName.toUpperCase()}` : `ON TO ${destName.toUpperCase()}`}
          </span>
        </div>
      </div>

      {!wide && (
        <div className="flightview__foot">
          <div>
            <div className="flightview__foot-label">Travelled</div>
            <div className="num">
              {int(distanceKm)} km<span className="mi">{miOnly(distanceKm)}</span>
            </div>
          </div>
          {next && (
            <div className="flightview__foot-next">
              <div className="flightview__foot-label">Next · {next.name}</div>
              <div className="num">
                {millionsKm(toNextKm)}
                <span className="mi">{millionsMi(toNextKm)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
