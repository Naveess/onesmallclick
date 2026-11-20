import type { CSSProperties } from "react";
import FLAG_INDEX from "../game/flagIndex.json";
import "./Flag.css";

// The 16×12 pixel flags (prompts 40–41), from public/sprites/flags-16x12.png: 16 flags a row, in the
// order of src/game/flagIndex.json. Made by scripts/make-flags.mjs from flag-icons (MIT licence).

const PER_ROW = 16;
const W = 16;
const H = 12;
const INDEX = FLAG_INDEX as Record<string, number>;
const SHEET_ROWS = Math.ceil(Object.keys(INDEX).length / PER_ROW);

/** A country's flag at 2× (32×24), or its two-letter code in a box if there's no flag for it. */
export function Flag({ cc, label }: { cc: string | null; label?: string }) {
  const i = cc ? INDEX[cc.toUpperCase()] : undefined;
  if (i === undefined) return <span className="flag flag--code">{cc ?? "··"}</span>;
  const s = 2;
  const style: CSSProperties = {
    backgroundSize: `${PER_ROW * W * s}px ${SHEET_ROWS * H * s}px`,
    backgroundPosition: `-${(i % PER_ROW) * W * s}px -${Math.floor(i / PER_ROW) * H * s}px`,
  };
  return <span className="flag" style={style} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
