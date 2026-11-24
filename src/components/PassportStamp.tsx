import { MEDAL_NAMES, type Medal } from "../../shared/medals";
import { probeFor, probeTag, stopName } from "../../shared/campaign";
import { stampIcon } from "../game/rewardArt";
import "./PassportStamp.css";

// A passport stamp (1j, 1k; E4b part 2a): one leg you pushed on, in the medal's colour, with the stop's icon,
// the arrival date, the medal and the probe. Empty, it's a dashed slot for a stop not stamped yet.

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

interface StampProps {
  stop: string;
  /** The stamp's leg: the medal, when it arrived and where it came from. Leave out for an empty slot. */
  leg?: { medal: Medal; arrivedAt: number; fromStop: string };
  /** The arrival screen's big tilted stamp; the profile's are small and straight. */
  big?: boolean;
}

export function PassportStamp({ stop, leg, big = false }: StampProps) {
  const icon = stampIcon(stop);
  const name = stopName(stop);
  const classes = ["stamp", big && "stamp--big", leg ? `stamp--${leg.medal}` : "stamp--empty"].filter(Boolean).join(" ");
  const tag = leg ? probeTag(probeFor(stop, leg.fromStop)) : "";
  const label = leg
    ? `${name} stamp: ${MEDAL_NAMES[leg.medal]}, ${dateFmt.format(leg.arrivedAt)}, ${tag}`
    : `${name}: not stamped yet`;
  return (
    <div className={classes} role="img" aria-label={label}>
      <img className="stamp__icon" src={icon.src} alt="" width={32} height={32} />
      <span className="stamp__name">{name.toUpperCase()}</span>
      {leg && (
        <>
          <span className="stamp__date num">{dateFmt.format(leg.arrivedAt).toUpperCase()}</span>
          <span className="stamp__medal">
            <span>{MEDAL_NAMES[leg.medal].toUpperCase()}</span>
            <span className="stamp__sep"> · </span>
            <span>{tag}</span>
          </span>
        </>
      )}
    </div>
  );
}
