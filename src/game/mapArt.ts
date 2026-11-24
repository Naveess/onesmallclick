// The campaign map's art (E1). Stops with a PixelLab sprite use it; the rest are drawn in code at the design's
// sizes (its mapSprites()) until PixelLab makes them (docs/todo.md, "Campaign-map moons and planets").
// Every image is shown 1:1 or at a whole-number scale.

import { BAYER, destinationArt, once, px, rng } from "./flightArt";
import { SPRITES, STILLS, type SpriteSheet, type Still } from "../sprites";

export type StopArt = { kind: "still"; still: Still } | { kind: "sheet"; sheet: SpriteSheet } | { kind: "drawn"; src: string; w: number; h: number };

/** The design's radius for each drawn body (an image of 2R+2 px). */
const DRAWN_R: Record<string, number> = {
  ceres: 18,
  vesta: 16,
  ganymede: 26,
  titan: 24,
  enceladus: 16,
  uranus: 26,
  miranda: 14,
  titania: 17,
  neptune: 26,
  pluto: 18,
  arrokoth: 14,
};

/** A ring (the heliopause and the probe's marker), from the design's ring(). */
function ring(size: number, r0: number, r1: number, cols: string[]): string {
  return px(size, size, (g) => {
    const c = size / 2;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        if (d < r0 || d > r1) continue;
        const t = (r1 - d) / (r1 - r0) + (BAYER[y % 4][x % 4] / 16 - 0.5) * 0.45 + Math.sin(Math.atan2(y - c, x - c) * 3) * 0.12;
        g.fillStyle = cols[Math.max(0, Math.min(cols.length - 1, Math.floor(t * cols.length)))];
        g.fillRect(x, y, 1, 1);
      }
  });
}

/** A strip of scattered rocks (the asteroid and Kuiper belts), from the design's rocks(). */
function rocks(w: number, h: number, seed: number, cols: string[], n: number, vertical: boolean): string {
  const r = rng(seed);
  return px(vertical ? h : w, vertical ? w : h, (g) => {
    for (let i = 0; i < n; i++) {
      const a = Math.floor(r() * w);
      const b = Math.floor(h / 2 + (r() + r() + r() - 1.5) * h * 0.55);
      const z = r() > 0.82 ? 2 : 1;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      if (vertical) g.fillRect(b, a, z, z);
      else g.fillRect(a, b, z, z);
    }
  });
}

const BELT = ["#3c4258", "#6c7390", "#8a8f9f", "#5a4a3c", "#9a8a78"];
const KUIPER = ["#2c5a80", "#5a94c0", "#a6d2f0", "#8a9ab5"];

/** The asteroid-belt strip: 256×26 across (phone), or 26×256 down (desktop). */
export function beltArt(vertical: boolean): string {
  return once(`belt${vertical}`, () => rocks(256, 26, 31, BELT, 260, vertical));
}

export function kuiperArt(vertical: boolean): string {
  return once(`kuiper${vertical}`, () => rocks(256, 26, 47, KUIPER, 170, vertical));
}

/** The probe's position ring, 36×36 (shown at 2×). */
export function probeRingArt(): string {
  return once("probeRing", () => ring(36, 15, 17.5, ["#ffb37a", "#ffd9a8"]));
}

/** Each stop's picture on the chart. */
export function stopArt(id: string): StopArt {
  switch (id) {
    case "earth":
      return { kind: "sheet", sheet: SPRITES.earth };
    case "mars":
      return { kind: "sheet", sheet: SPRITES.marsSmall };
    case "jupiter":
      return { kind: "still", still: STILLS.jupiter };
    case "saturn":
      return { kind: "still", still: STILLS.saturn };
    case "europa":
      return { kind: "still", still: STILLS.europa };
    case "heliopause":
      return { kind: "drawn", src: once("helio", () => ring(58, 21, 28, ["#2b4c86", "#8ccfff", "#ffb37a", "#ffd9a8"])), w: 58, h: 58 };
  }
  const R = DRAWN_R[id] ?? 16;
  return { kind: "drawn", src: destinationArt(id, R), w: R * 2 + 2, h: R * 2 + 2 };
}
