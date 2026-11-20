// The fact share card as a 1080 × 1080 PNG (E4b part 1, prompts 49–50).
// The design's card is 300px square. Pixel art only scales by whole numbers, so the image is laid out at
// 360px and drawn at exactly 3× (agreed in prompt 50): the same card, with spacing a fifth larger.
// Every colour is a fixed palette colour (the --space-* tokens), so the card looks the same in either theme.

const LAYOUT = 360;
const SCALE = 3;
export const SHARE_PX = LAYOUT * SCALE; // 1080

const C = {
  sky: "#05081a", // --space-deep
  outline: "#04060f", // --space-outline
  border: "#7fb0e6", // --space-border
  inset: "#06102a", // --space-inset
  orange: "#ffb37a", // --space-orange
  text: "#eef3ff", // --space-text
  shadow: "#1c3a6e", // --space-text-shadow
  rule: "#2b4c86", // --space-rule
  blue: "#8ccfff", // --space-blue
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

/** Splits text into lines no wider than `width` at the context's current font. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Letter spacing where the browser supports it on canvas (the design's labels use 0.12em). */
function spacing(g: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

export interface ShareFact {
  /** "MARS" */
  destName: string;
  n: number;
  fact: string;
  /** The destination's 128px sprite, e.g. /sprites/mars.png. */
  planetSrc: string;
}

/** Draws the share card and returns it as a PNG. */
export async function shareCardPng(f: ShareFact): Promise<Blob> {
  await Promise.all([
    document.fonts.load('400 13px "Pixelify Sans"'),
    document.fonts.load('600 23px "Pixelify Sans"'),
    document.fonts.load('24px "VT323"'),
  ]);
  const [stars, planet] = await Promise.all([loadImage("/sprites/stars-near.png"), loadImage(f.planetSrc)]);

  const canvas = document.createElement("canvas");
  canvas.width = SHARE_PX;
  canvas.height = SHARE_PX;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("No canvas");
  g.imageSmoothingEnabled = false;
  g.scale(SCALE, SCALE);

  // The sky, with the near star layer tiled at 2× (256px), as in the design.
  g.fillStyle = C.sky;
  g.fillRect(0, 0, LAYOUT, LAYOUT);
  for (let y = 0; y < LAYOUT; y += 256) for (let x = 0; x < LAYOUT; x += 256) g.drawImage(stars, x, y, 256, 256);

  // The planet, 128px, hanging off the top right.
  g.drawImage(planet, LAYOUT - 128 + 29, 19, 128, 128);

  // The window frame: dark outline, light border, dark inset, 2px each.
  const frame = (inset: number, colour: string) => {
    g.fillStyle = colour;
    g.fillRect(inset, inset, LAYOUT - inset * 2, 2);
    g.fillRect(inset, LAYOUT - inset - 2, LAYOUT - inset * 2, 2);
    g.fillRect(inset, inset, 2, LAYOUT - inset * 2);
    g.fillRect(LAYOUT - inset - 2, inset, 2, LAYOUT - inset * 2);
  };
  frame(0, C.outline);
  frame(2, C.border);
  frame(4, C.inset);

  const left = 22;
  const right = LAYOUT - 22;
  g.textBaseline = "alphabetic";

  // "DESTINATION FILE / MARS · FACT 12"
  g.font = '400 13px "Pixelify Sans"';
  spacing(g, 1.56);
  g.fillStyle = C.orange;
  g.fillText("DESTINATION FILE", left, 35);
  g.fillText(`${f.destName.toUpperCase()} · FACT ${f.n}`, left, 51);
  spacing(g, 0);

  // The footer: a rule, the name and the address.
  const ruleY = LAYOUT - 22 - 36;
  g.fillStyle = C.rule;
  g.fillRect(left, ruleY, right - left, 2);
  g.font = '600 17px "Pixelify Sans"';
  g.fillStyle = C.text;
  g.textAlign = "left";
  g.fillText("OneSmallClick", left, LAYOUT - 26);
  g.font = '24px "VT323"';
  g.fillStyle = C.blue;
  g.textAlign = "right";
  g.fillText("onesmallclick.io", right, LAYOUT - 26);
  g.textAlign = "left";

  // The fact, bottom-aligned above the footer, with the design's hard 2px shadow.
  g.font = '600 23px "Pixelify Sans"';
  const lineH = 30;
  const lines = wrap(g, f.fact, right - left);
  const lastBaseline = ruleY - 16;
  lines.forEach((line, i) => {
    const y = lastBaseline - (lines.length - 1 - i) * lineH;
    g.fillStyle = C.shadow;
    g.fillText(line, left + 2, y + 2);
    g.fillStyle = C.text;
    g.fillText(line, left, y);
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/png"),
  );
}
