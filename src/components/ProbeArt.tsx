import { probeStill, SPRITES, STILLS } from "../sprites";
import { Sprite } from "./Sprite";
import "./Sprite.css";

interface ProbeArtProps {
  /** The probe id from content/campaign.json ("pathfinder", "ceres-hopper", …). */
  id: string;
  scale?: 1 | 2;
  /** Engine on: OSC-1 plays its thruster sheet. The new probes are stills until PixelLab makes their engine
   * strips (docs/todo.md); the flight view draws its exhaust flame behind them. */
  engine?: boolean;
  bob?: boolean;
  label?: string;
}

/** The probe flying this leg (E2), wherever OSC-1 used to be hard-coded. */
export function ProbeArt({ id, scale = 1, engine = true, bob = true, label }: ProbeArtProps) {
  if (id === "pathfinder" && engine) {
    return <Sprite sprite={SPRITES.thruster} scale={scale} bob={bob} label={label} still={STILLS.probe} />;
  }
  const still = id === "pathfinder" ? STILLS.probe : probeStill(id);
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <span
      className={bob ? "sprite sprite--bob" : "sprite"}
      style={{ width: still.width * scale, height: still.height * scale }}
      {...a11y}
    >
      <img className="sprite__still" src={still.src} alt="" width={still.width * scale} height={still.height * scale} />
    </span>
  );
}

/** The probe's height in px at 1× (OSC-1 is 64×40, the rest 64×64), for laying it out on a line. */
export function probeHeight(id: string): number {
  return id === "pathfinder" ? 40 : 64;
}
