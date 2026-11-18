// Every sprite the app ships, from public/sprites/ (copies of design/sprites/, unchanged).
// Sizes and frame counts are in design/sprites/README.md.

export interface SpriteSheet {
  /** Short name, used on /kit. */
  name: string;
  src: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  /** One full pass through the sheet. */
  durationMs: number;
  loop: boolean;
  /** What the design file plays (design/assets/), kept so the retiming is visible. */
  design: { frames: number; durationMs: number };
}

/**
 * Our sheets have one more frame than the design's (5/9/5/7 against 4/8/4/6).
 * Keep the design's time per frame, so each animation moves at the design's speed:
 * new duration = design duration ÷ design frames × our frames.
 */
function retime(frames: number, design: { frames: number; durationMs: number }): number {
  return Math.round((design.durationMs / design.frames) * frames);
}

const thrusterDesign = { frames: 4, durationMs: 600 }; // osc-sheet .6s steps(4): 150 ms a frame
const earthDesign = { frames: 8, durationMs: 4000 }; // osc-sheet 4s steps(8): 500 ms a frame
const marsDesign = { frames: 4, durationMs: 3200 }; // osc-sheet 3.2s steps(4): 800 ms a frame
const burstDesign = { frames: 6, durationMs: 720 }; // celebrate(): 720 ms, steps(6): 120 ms a frame

export const SPRITES = {
  thruster: {
    name: "Thruster (probe OSC-1)",
    src: "/sprites/thruster-sheet.png",
    frameWidth: 64,
    frameHeight: 40,
    frames: 5,
    durationMs: retime(5, thrusterDesign), // 750 ms
    loop: true,
    design: thrusterDesign,
  },
  earth: {
    name: "Rotating Earth",
    src: "/sprites/earth-rotating-sheet.png",
    frameWidth: 64,
    frameHeight: 64,
    frames: 9,
    durationMs: retime(9, earthDesign), // 4500 ms
    loop: true,
    design: earthDesign,
  },
  mars: {
    name: "Rotating Mars",
    src: "/sprites/mars-rotating-sheet.png",
    frameWidth: 128,
    frameHeight: 128,
    frames: 5,
    durationMs: retime(5, marsDesign), // 4000 ms
    loop: true,
    design: marsDesign,
  },
  /** The same turning Mars drawn at 64px, for the game home track (decided 2026-11-18: no half-scaling). */
  marsSmall: {
    name: "Rotating Mars, 64px",
    src: "/sprites/mars-rotating-64-sheet.png",
    frameWidth: 64,
    frameHeight: 64,
    frames: 5,
    durationMs: retime(5, marsDesign), // 4000 ms
    loop: true,
    design: marsDesign,
  },
  burst: {
    name: "Firework burst",
    src: "/sprites/firework-burst-sheet.png",
    frameWidth: 64,
    frameHeight: 64,
    frames: 7,
    durationMs: retime(7, burstDesign), // 840 ms
    loop: false,
    design: burstDesign,
  },
} satisfies Record<string, SpriteSheet>;

export interface Still {
  name: string;
  src: string;
  width: number;
  height: number;
}

export const STILLS = {
  probe: { name: "Probe (engine off)", src: "/sprites/probe.png", width: 64, height: 40 },
  earth: { name: "Earth", src: "/sprites/earth.png", width: 64, height: 64 },
  mars: { name: "Mars", src: "/sprites/mars.png", width: 128, height: 128 },
  moon: { name: "Moon", src: "/sprites/moon.png", width: 32, height: 32 },
  firework: { name: "Firework", src: "/sprites/firework.png", width: 64, height: 64 },
  milestoneFlag: { name: "Milestone flag", src: "/sprites/milestone-flag.png", width: 32, height: 32 },
  badgeBlue: { name: "Signal badge, blue", src: "/sprites/signal-badge-blue.png", width: 32, height: 32 },
  badgeOrange: { name: "Signal badge, orange", src: "/sprites/signal-badge-orange.png", width: 32, height: 32 },
  badgeRed: { name: "Signal badge, red", src: "/sprites/signal-badge-red.png", width: 32, height: 32 },
  earthSmall: { name: "Earth, tab bar", src: "/sprites/earth-small.png", width: 16, height: 16 },
} satisfies Record<string, Still>;
