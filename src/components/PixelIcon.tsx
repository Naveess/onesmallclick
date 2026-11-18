import { ICON_PATHS, type IconName } from "./iconPaths";

/** The design's four icon colours (design/icons/README.md). "current" inherits the text colour. */
export type IconTone = "blue" | "orange" | "white" | "muted" | "current";

const TONE_COLOUR: Record<IconTone, string | undefined> = {
  blue: "var(--text-blue)",
  orange: "var(--text-orange)",
  white: "var(--text)",
  muted: "var(--text-faint)",
  current: undefined,
};

interface PixelIconProps {
  name: IconName;
  /** 9px art at whole-number scales: 18 (2×), 27 (3×) or 36 (4×). */
  size?: 9 | 18 | 27 | 36;
  tone?: IconTone;
  /** Give a label only when the icon carries meaning on its own. */
  label?: string;
  className?: string;
}

/** One of the design's 9×9 icons, drawn inline so it takes any theme colour. */
export function PixelIcon({ name, size = 18, tone = "current", label, className }: PixelIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 9 9"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      style={{ color: TONE_COLOUR[tone], flex: "none", display: "block" }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      focusable="false"
    >
      <path fill="currentColor" d={ICON_PATHS[name]} />
    </svg>
  );
}
