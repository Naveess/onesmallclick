import "./Sky.css";

interface SkyProps {
  /** Fixed to the viewport (a full page) or filling its positioned parent (a panel). */
  fixed?: boolean;
}

/** The night sky (or the daylight one in the light theme). Purely decorative. */
export function Sky({ fixed = false }: SkyProps) {
  return (
    <div className={fixed ? "sky sky--fixed" : "sky"} aria-hidden="true">
      <div className="sky__nebula" />
      <div className="sky__stars sky__stars--far" />
      <div className="sky__stars sky__stars--near" />
    </div>
  );
}
