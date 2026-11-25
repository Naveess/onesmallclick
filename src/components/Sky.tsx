import "./Sky.css";

interface SkyProps {
  /** Fixed to the viewport (a full page) or filling its positioned parent (a panel). */
  fixed?: boolean;
  /** Safe mode (1f): the grey, dimmed sky. */
  safe?: boolean;
  /** The milestone moment's warmer sky (1e). */
  milestone?: boolean;
  /** The dusk sky of the arrival (1k) and the landing burn (1o). */
  arrival?: boolean;
}

/** The night sky (or the daylight one in the light theme). Purely decorative. */
export function Sky({ fixed = false, safe = false, milestone = false, arrival = false }: SkyProps) {
  const classes = ["sky", fixed && "sky--fixed", safe && "sky--safe", milestone && "sky--milestone", arrival && "sky--arrival"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} aria-hidden="true">
      <div className="sky__nebula" />
      <div className="sky__stars sky__stars--far" />
      <div className="sky__stars sky__stars--near" />
    </div>
  );
}
