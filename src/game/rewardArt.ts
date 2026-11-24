// The reward art, drawn in code the way the design file draws it (design/OneSmallClick.dc.html: medal()).
// Like flightArt.ts, each image is made once on a canvas, cached, and shown at whole-number scales only.
// docs/todo.md has the medals down for tidying by hand later; swap the art in here and keep the size.
//
// The hex values are sprite pixels copied from the design: the medal ramps are the approved --medal-*
// colours (docs/tokens.css, highlight → outline), and the ribbon is the design's two blues.

import type { Medal } from "../../shared/medals";
import { destinationArt, once, px } from "./flightArt";

/** The medal is 10×15 (shown at 2×, 20×30, on the game home). */
export const MEDAL_W = 10;
export const MEDAL_H = 15;

const RAMPS: Record<Medal, string[]> = {
  gold: ["#fff1b0", "#ffd27a", "#e0a83a", "#9a6418", "#4a2c0a"],
  silver: ["#eef3ff", "#c9d4ee", "#8b98ba", "#4a5170", "#1a1f30"],
  bronze: ["#f0b98a", "#c8743e", "#8a4620", "#4a2410", "#1f0f08"],
};

const RIBBON = ["bBb....bBb", ".bBb..bBb.", "..bBbbBb..", "...bBBb...", "....kk...."];

/** A medal: a blue ribbon over a lit disc with a rim and a plus, as the design's medal(r). */
export function medalArt(medal: Medal): string {
  return once(`medal-${medal}`, () => {
    const r = RAMPS[medal];
    return px(MEDAL_W, MEDAL_H, (g) => {
      const rib: Record<string, string> = { b: "#2d6fbc", B: "#8ccfff", k: r[4] };
      RIBBON.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (!rib[ch]) return;
          g.fillStyle = rib[ch];
          g.fillRect(x, y, 1, 1);
        }),
      );
      for (let y = 5; y < 15; y++)
        for (let x = 0; x < 10; x++) {
          const dx = x + 0.5 - 5;
          const dy = y + 0.5 - 10;
          const d = Math.hypot(dx, dy);
          if (d > 4.9) continue;
          let c: string;
          if (d > 4.0) c = r[4];
          else {
            const t = -dx * 0.45 - dy * 0.55;
            c = t > 1.3 ? r[0] : t > -0.2 ? r[1] : t > -1.6 ? r[2] : r[3];
            if ((Math.abs(dx) < 0.6 && Math.abs(dy) < 1.6) || (Math.abs(dy) < 0.6 && Math.abs(dx) < 1.6)) c = r[0];
          }
          g.fillStyle = c;
          g.fillRect(x, y, 1, 1);
        }
    });
  });
}

/**
 * A stop's passport-stamp icon (E4b part 2a), shown 32×32: Mars's 32px sprite (the design's 2× size), the rest
 * drawn in code at 16×16 (flightArt's planets) and shown at 2×. PixelLab's stamp icons replace these later
 * (public/sprites/stamps/<stop>.png, which npm run check-leg looks for).
 */
export function stampIcon(stop: string): { src: string; scale: 1 | 2 } {
  if (stop === "mars") return { src: "/sprites/mars-32.png", scale: 1 };
  return { src: destinationArt(stop, 7), scale: 2 };
}
