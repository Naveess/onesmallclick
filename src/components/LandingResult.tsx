import { withMiles } from "../../shared/units";
import { landingPostcardOf } from "../../shared/postcards";
import { PostcardPhoto } from "./PostcardPhoto";
import { spareText, type BurnResult } from "../../shared/burn";
import { probeFor, probeTag, stopName } from "../../shared/campaign";
import { destinationArt } from "../game/flightArt";
import { int } from "../game/format";
import { SPRITES } from "../sprites";
import { usePrefersReducedMotion } from "../theme";
import { PixelButton } from "./PixelButton";
import { Sprite } from "./Sprite";
import "./LandingBurn.css";
import "./Postcard.css";

interface LandingResultProps {
  stop: string;
  fromStop?: string;
  burn: BurnResult;
  wide: boolean;
  onContinue: () => void;
}

/**
 * How the landing burn went (E4b part 2b, design 1o): "Landing stuck!" with a gold-framed postcard, or "Rough
 * landing, but we made it" with the plain one (never a punishment). Then the arrival screen. The postcard's
 * photo is the stop's real NASA landing photo (prompts 95-97), or the destination's art if it has none.
 */
export function LandingResult({ stop, fromStop, burn, wide, onContinue }: LandingResultProps) {
  const reduceMotion = usePrefersReducedMotion();
  const tag = probeTag(probeFor(stop, fromStop ?? "earth"));
  const dest = stopName(stop);
  const landing = landingPostcardOf(stop);
  const photo = (
    <div className="postcard__photo landing__photo" aria-hidden={landing ? undefined : true}>
      {landing ? (
        <PostcardPhoto photo={landing} />
      ) : stop === "mars" ? (
        <Sprite sprite={SPRITES.mars} scale={1} />
      ) : (
        <img src={destinationArt(stop, 31)} alt="" width={128} height={128} />
      )}
    </div>
  );
  return (
    <main className={wide ? "landing landing--wide" : "landing"} aria-labelledby="landing-title">
      {burn.ok && !reduceMotion && (
        <div className="landing__bursts" aria-hidden="true">
          <Sprite sprite={SPRITES.burst} scale={1} />
          <Sprite sprite={SPRITES.burst} scale={1} />
        </div>
      )}
      <header className="landing__head">
        <p className={burn.ok ? "landing__kick landing__kick--gold" : "landing__kick"}>{burn.ok ? "LANDING BURN COMPLETE" : "LANDING BURN OVER"}</p>
        <h1 id="landing-title" className={burn.ok ? "landing__title landing__title--gold" : "landing__title"}>
          {burn.ok ? "Landing stuck!" : "Rough landing, but we made it"}
        </h1>
        <p className="landing__line num">
          {burn.ok
            ? withMiles(`${int(burn.target)} km burned${burn.spareMs !== null ? ` with ${spareText(burn.spareMs)} to spare` : ""}.`)
            : withMiles(`${int(burn.km)} of ${int(burn.target)} km burned.`)}
        </p>
      </header>

      {burn.ok ? (
        <div className="landing__frame">
          <span className="landing__corner landing__corner--tl" />
          <span className="landing__corner landing__corner--tr" />
          <span className="landing__corner landing__corner--bl" />
          <span className="landing__corner landing__corner--br" />
          <figure className="postcard landing__card landing__card--gold">
            {photo}
            <figcaption className="postcard__caption">
              <span>Touchdown. — {tag}</span>
              <span className="postcard__no landing__edition">GOLD EDITION</span>
            </figcaption>
          </figure>
        </div>
      ) : (
        <figure className="postcard landing__card">
          {photo}
          <figcaption className="postcard__caption">
            <span>Touchdown. — {tag}</span>
            <span className="postcard__no">POSTCARD</span>
          </figcaption>
        </figure>
      )}

      <p className="landing__note">
        {burn.ok
          ? `The crew nailed it. This one goes in the log with a gold frame.`
          : `A bumpy touchdown on ${dest}, but the probe is down safe and the postcard is yours. On to the arrival.`}
      </p>
      <PixelButton variant="blue" size="lg" block className="landing__go" onClick={onContinue}>
        See the arrival
      </PixelButton>
    </main>
  );
}
