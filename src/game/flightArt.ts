// The flight view's art, drawn in code for now, the way the design file draws it (design/OneSmallClick.dc.html:
// planet(), ball(), streaks(), flameSheet2(), comet(), miniProbe()). Everything is a pixel image made once
// on a canvas and cached, shown at whole-number scales only. When PixelLab sprites replace these
// (docs/todo.md, "Flight view art"), swap them in here and keep the same sizes.
//
// The hex values below are sprite pixels (like the colours inside a PNG), copied from the design's art.
// The flight view's UI colours are the --space-* tokens in src/styles/theme.css.

/** The sizes Mars and Earth come in, as radii in pixels (each image is 2R+2 square, drawn 1:1).
 * The design grows them smoothly; we step through a few fixed sizes instead (prompt 32). */
export const MARS_RADII = {
  phone: [9, 12, 16, 21, 28, 37, 48, 60, 71],
  wide: [14, 19, 26, 35, 47, 62, 80, 104, 134],
};
export const EARTH_RADII = {
  phone: [24, 18, 13, 9, 6, 3],
  wide: [40, 30, 22, 15, 10, 6],
};

// ---------- The design's helpers ----------

/** 4×4 ordered dither, as in the design. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function hash(x: number, y: number, s: number): number {
  let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, s: number): number {
  return noise(x, y, s) * 0.55 + noise(x * 2, y * 2, s + 1) * 0.3 + noise(x * 4, y * 4, s + 2) * 0.15;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws on a w×h canvas and returns it as a PNG data URL. */
function px(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) draw(g);
  return c.toDataURL();
}

/** Pixel rows ("." = clear) with a colour per letter. */
function grid(rows: string[], pal: Record<string, string>): string {
  return px(rows[0].length, rows.length, (g) =>
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!pal[ch]) return;
        g.fillStyle = pal[ch];
        g.fillRect(x, y, 1, 1);
      }),
    ),
  );
}

const cache = new Map<string, string>();
function once(key: string, make: () => string): string {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    cache.set(key, v);
  }
  return v;
}

// ---------- Planets (the design's planet()) ----------

const PAL = {
  ocean: ["#081530", "#0f2a5a", "#1a4a8e", "#2d6fbc", "#5aa4e6"],
  land: ["#0f2016", "#1d4227", "#346f36", "#6c9c46", "#b9b874"],
  cloud: ["#2c3a5c", "#6e82aa", "#b4c6e6", "#e4ecfb", "#eef3ff"],
  rust: ["#220c08", "#4e1f12", "#8c3c1f", "#c8683a", "#f0a468"],
  dark: ["#1a0906", "#371609", "#5f2a14", "#8a4424", "#b56c40"],
  cap: ["#4a3e48", "#958a96", "#d8d0d6", "#f2ece8", "#f6f1ec"],
};

function planet(R: number, kind: "earth" | "mars", seed: number): string {
  const S = R * 2 + 2;
  return px(S, S, (g) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = (x + 0.5 - (R + 1)) / R;
        const dy = (y + 0.5 - (R + 1)) / R;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const dz = Math.sqrt(1 - d2);
        let l = Math.max(0, -0.55 * dx - 0.5 * dy + 0.67 * dz);
        l = Math.min(1, Math.pow(l, 0.85) * 1.05);
        const lon = Math.atan2(dx, dz) + seed;
        const lat = Math.asin(dy);
        const n = fbm(lon * 1.7 + seed * 3, lat * 2.3 + 7, seed);
        let i = Math.floor((l + (BAYER[y % 4][x % 4] / 16 - 0.5) * 0.3) * 5);
        i = Math.max(0, Math.min(4, i));
        let pal: string[];
        if (kind === "earth") {
          const cl = fbm(lon * 2.6 + 11, lat * 5 + 3, seed + 9);
          pal = Math.abs(lat) > 1.2 ? PAL.cloud : cl > 0.63 ? PAL.cloud : n > 0.54 ? PAL.land : PAL.ocean;
        } else {
          pal = lat < -1.12 ? PAL.cap : n > 0.57 ? PAL.dark : PAL.rust;
        }
        let col = pal[i];
        if (kind === "earth" && d2 > 0.8 && l > 0.2) col = i > 2 ? "#9fd8ff" : "#4f8fd8";
        if (kind === "mars" && d2 > 0.86 && l > 0.25) col = "#ffb37a";
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
  });
}

/** Mars at radius R (one of MARS_RADII): a (2R+2)px square image. */
export function marsArt(R: number): string {
  return once(`mars${R}`, () => planet(R, "mars", 0.6));
}

/** Earth at radius R (one of EARTH_RADII). */
export function earthArt(R: number): string {
  return once(`earth${R}`, () => planet(R, "earth", 1.3));
}

/** The largest size not above r (Mars grows a step at a time). */
export function stepUp(radii: number[], r: number): number {
  return radii.filter((x) => x <= r).pop() ?? radii[0];
}

/** The smallest size not below r (Earth shrinks a step at a time). */
export function stepDown(radii: number[], r: number): number {
  return radii.filter((x) => x >= r).pop() ?? radii[0];
}

// ---------- Small bodies (the design's ball()) ----------

interface BallOpts {
  a: string[];
  b: string[];
  sq?: number;
  f?: number;
  th?: number;
  bands?: number;
  seed?: number;
}

function ball(R: number, o: BallOpts): string {
  const sq = o.sq ?? 1;
  const W = R * 2 + 2;
  const H = Math.ceil(R * 2 * sq) + 2;
  const cx = R + 1;
  const cy = H / 2;
  const seed = o.seed ?? 1;
  return px(W, H, (g) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x + 0.5 - cx) / R;
        const dy = (y + 0.5 - cy) / (R * sq);
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const dz = Math.sqrt(Math.max(0, 1 - d2));
        let l = Math.max(0, -0.55 * dx - 0.5 * dy + 0.67 * dz);
        l = Math.min(1, Math.pow(l, 0.85) * 1.05);
        const lon = Math.atan2(dx, dz || 0.001) + seed;
        const lat = Math.asin(Math.max(-1, Math.min(1, dy)));
        let pal = o.a;
        if (o.bands) {
          const t = Math.sin(lat * o.bands + fbm(lon * 1.3 + seed, lat * 4, seed) * 2.4);
          if (t > 0.35) pal = o.b;
        } else {
          const n = fbm(lon * (o.f ?? 1.7) + seed * 3, lat * (o.f ?? 1.7) * 1.35 + 7, seed);
          if (n > (o.th ?? 0.58)) pal = o.b;
        }
        let i = Math.floor((l + (BAYER[y % 4][x % 4] / 16 - 0.5) * 0.3) * 5);
        i = Math.max(0, Math.min(4, i));
        g.fillStyle = pal[i];
        g.fillRect(x, y, 1, 1);
      }
  });
}

const GREY = ["#14161f", "#2c303f", "#555a6c", "#8a8f9f", "#c4c7d2"];
const GREY_DARK = ["#0f1118", "#22252f", "#41444f", "#676b78", "#9a9ea9"];

/** Ceres ahead, 16×16. */
export function ceresArt(): string {
  return once("ceres", () => ball(7, { a: GREY, b: GREY_DARK, f: 2.4, th: 0.6, seed: 3 }));
}

/** Small Vesta ahead, 16×14 (squashed). */
export function vestaArt(): string {
  return once("vesta", () =>
    ball(7, {
      sq: 0.82,
      a: ["#1a1410", "#3a2f26", "#66574a", "#9a8a78", "#cdbfae"],
      b: ["#120e0b", "#2a221b", "#4a3f35", "#716253", "#9e8f7f"],
      f: 2.2,
      seed: 5,
    }),
  );
}

/** Jupiter far ahead (wide layout only), 16×16. */
export function jupiterArt(): string {
  return once("jupiter", () =>
    ball(7, {
      bands: 6,
      a: ["#2a1406", "#5c3214", "#a0602a", "#d89a5a", "#f2d2a2"],
      b: ["#2c2418", "#5e5040", "#a69276", "#dccbae", "#f6ecd8"],
      seed: 4,
    }),
  );
}

/** Phobos once Mars is close, 6×4 (the design draws it as a grey chip with a shadowed corner). */
export function phobosArt(): string {
  return once("phobos", () => grid(["ggggdd", "ggggdd", "ggggdd", "dddddd"], { g: "#8a8f9f", d: "#41444f" }));
}

/** The route strip's 8×8 swatches for the two branches after Mars. */
export function ceresSwatch(): string {
  return once("ceresSwatch", () => grid(Array(8).fill("cccccccc"), { c: "#8a8f9f" }));
}
export function vestaSwatch(): string {
  return once("vestaSwatch", () => grid(Array(8).fill("vvvvvvvv"), { v: "#9a8a78" }));
}

// ---------- Motion pieces ----------

/** Speed lines: a 128×64 tile of streaks, shown at 2× and scrolled left. */
export function streaksArt(): string {
  return once("streaks", () => {
    const r = rng(91);
    return px(128, 64, (g) => {
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(r() * 120);
        const y = Math.floor(r() * 64);
        const l = 6 + Math.floor(r() * 14);
        g.fillStyle = r() > 0.5 ? "#7fb0e6" : "#2b5a8f";
        g.fillRect(x, y, l, 1);
        g.fillStyle = "#eef3ff";
        g.fillRect(x + l - 2, y, 2, 1);
      }
    });
  });
}

/** The horizontal exhaust flame: 3 frames of 12×6 in one 36×6 sheet. */
export const FLAME = { frameWidth: 12, frameHeight: 6, frames: 3 };
export function flameArt(): string {
  return once("flame", () => {
    const F = [
      [".......rrooo", "...rrrooyyww", ".rrrooyywwww", "..rrrooyywww", "....rrrooyyy", "........rroo"],
      ["........rroo", ".....rrooyyw", "...rrooyywww", "....rrooyyww", "......rrooyy", ".........rro"],
      ["......rrrooo", "..rrrrooyyww", "rrrrooyywwww", ".rrrooyyywww", "...rrrooyyyy", ".......rrroo"],
    ];
    return grid(
      F[0].map((_, i) => F[0][i] + F[1][i] + F[2][i]),
      { r: "#e8894a", o: "#ffb37a", y: "#ffd9a8", w: "#fff4ea" },
    );
  });
}

/** The comet that crosses now and then, 18×5 (shown at 2×). */
export function cometArt(): string {
  return once("comet", () =>
    grid(["..............bb..", ".........bbBBBwww.", "...bbBBBBBBwwwwwww", ".........bbBBBwww.", "..............bb.."], {
      b: "#2b5a8f",
      B: "#8ccfff",
      w: "#eef3ff",
    }),
  );
}

/** The tiny probe on the route strip, 12×5 (shown at 2×). */
export function miniProbeArt(): string {
  return once("mini", () =>
    grid([".....ww.....", "bb..wwww..bb", "bbBBwwwwBBbb", "bb..wwww..bb", ".....ww....."], {
      b: "#2d6fbc",
      B: "#8ccfff",
      w: "#eef3ff",
    }),
  );
}
