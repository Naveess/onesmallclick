import { stopName } from "../../shared/campaign";
import { destinationArt } from "../game/flightArt";
import { hms, int } from "../game/format";
import { SPRITES } from "../sprites";
import { PixelButton } from "./PixelButton";
import { ProbeArt } from "./ProbeArt";
import { ShareNudge } from "./ShareNudge";
import { Sprite } from "./Sprite";
import { ThrustButton } from "./ThrustButton";
import "./LandingBurn.css";

// The landing burn (E4b part 2b, design 1o): the final hour before arrival. The home card, the burn screen
// (a big THRUST and the bar), and the bar itself. The server fixes the landing time and counts the km.

/** The view's burn (src/game/store.ts). */
export interface BurnView {
  leftS: number;
  km: number;
  target: number;
  share: number;
  filled: boolean;
  landAt: number;
}

const SEGMENTS = 20;

/** The design's 20-block bar: full blocks gold, the one filling darker gold, the rest empty. */
export function BurnBar({ burn, size = "sm" }: { burn: BurnView; size?: "sm" | "lg" }) {
  const full = Math.floor(Math.min(1, burn.share) * SEGMENTS);
  return (
    <div
      className={`burn-bar burn-bar--${size}`}
      role="progressbar"
      aria-label="Landing burn progress"
      aria-valuemin={0}
      aria-valuemax={burn.target}
      aria-valuenow={Math.floor(burn.km)}
      aria-valuetext={`${int(burn.km)} of ${int(burn.target)} km`}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className={i < full ? "burn-bar__seg burn-bar__seg--on" : i === full ? "burn-bar__seg burn-bar__seg--now" : "burn-bar__seg"} />
      ))}
    </div>
  );
}

/** "FINAL HOUR · LANDING BURN" on the game home, with Join the burn. */
export function BurnCard({ burn, wide, onJoin }: { burn: BurnView; wide: boolean; onJoin: () => void }) {
  return (
    <section className={wide ? "burn-card burn-card--wide" : "burn-card"} aria-labelledby="burn-card-title">
      <div className="burn-card__top">
        <h2 id="burn-card-title" className="burn-card__label">
          {burn.filled ? "LANDING STUCK · KEEP BURNING" : "FINAL HOUR · LANDING BURN"}
        </h2>
        <span className="burn-card__left num" aria-label={`${Math.ceil(burn.leftS / 60)} minutes to landing`}>
          {hms(burn.leftS)}
        </span>
      </div>
      <BurnBar burn={burn} />
      <div className="burn-card__bottom">
        <span className="burn-card__km">
          {int(burn.km)} of {int(burn.target)} km burned
        </span>
        <PixelButton variant="orange" className="burn-card__join" onClick={onJoin}>
          Join the burn
        </PixelButton>
      </div>
    </section>
  );
}

interface BurnScreenProps {
  burn: BurnView;
  wide: boolean;
  online: number;
  stop: string;
  probeId: string;
  probeTag: string;
  onThrust: () => number;
  onBack: () => void;
}

/** The burn screen (1o): the destination close up, the countdown, the bar, and THRUST. */
export function BurnScreen({ burn, wide, online, stop, probeId, probeTag, onThrust, onBack }: BurnScreenProps) {
  const dest = stopName(stop);
  const pct = Math.floor(Math.min(1, burn.share) * 100);
  return (
    <main className={wide ? "burn burn--wide" : "burn"} aria-labelledby="burn-title">
      <div className="burn__art" aria-hidden="true">
        <div className="burn__planet">
          {stop === "mars" ? (
            <Sprite sprite={SPRITES.mars} scale={2} />
          ) : (
            <img src={destinationArt(stop, 31)} alt="" width={256} height={256} />
          )}
        </div>
        <div className="burn__probe">
          <ProbeArt id={probeId} />
        </div>
      </div>

      <header className="burn__head">
        <p className="burn__kick">{burn.filled ? "LANDING STUCK · KEEP BURNING" : "FINAL HOUR · LANDING BURN"}</p>
        <p className="burn__left num" aria-label={`${Math.ceil(burn.leftS / 60)} minutes to landing on ${dest}`}>
          {hms(burn.leftS)}
        </p>
        <h1 id="burn-title" className="burn__title">
          Landing burn: {int(burn.target)} km to stick the landing
        </h1>
      </header>

      <div className="burn__meter">
        <BurnBar burn={burn} size="lg" />
        <p className="burn__nums num">
          <span>
            <span className="burn__km">{int(burn.km)}</span> of {int(burn.target)} km
          </span>
          <span>{pct}%</span>
        </p>
      </div>

      <p className="burn__here">
        <span className="burn__dot" aria-hidden="true" />
        <span className="burn__online num">{int(online)}</span> here now · everyone's taps count double
      </p>

      <div className="burn__thrust">
        <ThrustButton onThrust={onThrust} size="lg" hint="burn, burn, burn" spaceKey={wide} />
      </div>

      <p className="burn__note">
        {burn.filled
          ? "The bar's full: the landing is stuck and the postcard is gold. Every km still counts for your own total."
          : "Stick it for a gold-framed postcard. Miss it and we still land, and the postcard is still yours."}
      </p>

      <div className="burn__actions">
        <ShareNudge
          moment="burn"
          variant="orange"
          fill={{ probe: probeTag, dest }}
          label="Call the crew in"
          title="Share the landing burn"
        />
        <PixelButton variant="outline" block onClick={onBack}>
          Back to the mission
        </PixelButton>
      </div>
    </main>
  );
}
