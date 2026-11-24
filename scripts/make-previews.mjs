// Makes the link-preview images (phase S1, prompt 62): public/share/<name>.png, 1200 × 630, one per moment,
// milestone and destination, plus a default. Built from the shipped sprites, fonts and pixel kit (no new art,
// no PixelLab generations), so they match the game. Personal numbers never go in the image (they're in the
// preview text, written by worker/share.ts), so these are made once and committed, not drawn on demand.
//
//   node scripts/make-previews.mjs [name ...]     (all of shared/share.ts PREVIEW_IMAGES by default)
//
// How: a small local server lays out each image as an HTML page using the game's own CSS, and headless
// Microsoft Edge takes a 1200 × 630 screenshot of it. Set EDGE to Edge's or Chrome's path if it isn't
// in the usual Windows place. No dependencies: plain Node.

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const EDGE = process.env.EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const W = 1200;
const H = 630;

// The Mars leg's milestones (E3 moved them to content/milestones/mars.json; the other legs' images wait for their art).
const { milestones } = JSON.parse(read("content/milestones/mars.json"));
const flagIndex = JSON.parse(read("src/game/flagIndex.json"));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- Art pieces (whole-number scales only) ----------

const img = (src, w, h, scale, style = "") =>
  `<img src="${src}" width="${w * scale}" height="${h * scale}" alt="" style="${style}" />`;
/** One frame of a horizontal sprite sheet. */
const frame = (src, fw, fh, frames, i, scale, style = "") =>
  `<span style="display:inline-block;width:${fw * scale}px;height:${fh * scale}px;background:url(${src}) -${i * fw * scale}px 0 / ${fw * frames * scale}px ${fh * scale}px no-repeat;${style}"></span>`;
const probe = (scale, style = "") => frame("/sprites/thruster-sheet.png", 64, 40, 5, 1, scale, style);
const flag = (cc, scale) => {
  const i = flagIndex[cc];
  const rows = Math.ceil(Object.keys(flagIndex).length / 16);
  return `<span style="display:inline-block;width:${16 * scale}px;height:${12 * scale}px;background:url(/sprites/flags-16x12.png) -${(i % 16) * 16 * scale}px -${Math.floor(i / 16) * 12 * scale}px / ${16 * 16 * scale}px ${rows * 12 * scale}px no-repeat;outline:3px solid var(--outline)"></span>`;
};

/** Absolute positions inside the 560 × 630 art area on the right. */
const at = (x, y, html) => `<div style="position:absolute;left:${x}px;top:${y}px">${html}</div>`;

// ---------- The images ----------

const moonArt = [at(320, 120, img("/sprites/moon.png", 32, 32, 5)), at(60, 330, probe(4)), at(380, 330, img("/sprites/milestone-flag.png", 32, 32, 4))];
const marsArt = [at(250, 80, img("/sprites/mars.png", 128, 128, 2)), at(20, 380, probe(4)), at(400, 400, img("/sprites/milestone-flag.png", 32, 32, 4))];

const IMAGES = {
  default: {
    tone: "blue",
    label: "ONESMALLCLICK",
    title: "Push one probe to Mars, together",
    sub: "Everyone taps THRUST. Every click counts.",
    art: [at(10, 330, img("/sprites/earth.png", 64, 64, 3)), at(210, 250, probe(3)), at(300, 40, img("/sprites/mars.png", 128, 128, 2))],
  },
  ...Object.fromEntries(
    milestones.map((m) => [
      `milestone-${m.slug}`,
      {
        tone: "orange",
        label: `MILESTONE ${m.n} OF ${milestones.length}`,
        title: m.title,
        sub: "The crew got OSC-1 this far. Keep it going.",
        art: m.n <= 2 ? moonArt : marsArt,
      },
    ]),
  ),
  "arrival-mars": {
    tone: "orange",
    label: "ORBIT REACHED",
    title: "We made it to Mars",
    sub: "A whole crew of strangers flew one probe there.",
    art: [at(80, 60, img("/sprites/mars.png", 128, 128, 3)), at(300, 470, probe(2)), at(40, 470, img("/sprites/firework.png", 64, 64, 2))],
  },
  "branch-mars": {
    tone: "blue",
    label: "CREW VOTE · NEXT STOP",
    title: "Ceres or Vesta?",
    sub: "The crew picks where the probe goes next.",
    art: [at(40, 60, img("/sprites/mars.png", 128, 128, 2)), at(250, 360, probe(4)), at(330, 120, `<span class="q">?</span>`)],
  },
  signal: {
    tone: "orange",
    label: "PING THE PROBE",
    title: "The signal is running out",
    sub: "One Ping from anyone keeps it alive.",
    art: [at(150, 60, img("/sprites/signal-badge-red.png", 32, 32, 8)), at(130, 400, probe(4))],
  },
  safe: {
    tone: "muted",
    label: "SAFE MODE",
    title: "The probe has gone quiet",
    sub: "One Ping from anyone wakes it up.",
    art: [at(150, 60, img("/sprites/signal-badge-orange.png", 32, 32, 8)), at(130, 400, img("/sprites/probe.png", 64, 40, 4, "filter:grayscale(1) brightness(0.8)"))],
  },
  badge: {
    tone: "orange",
    label: "CREW BADGE",
    title: "A new badge earned",
    sub: "Ping, vote and push to collect them all.",
    art: [
      at(20, 150, img("/sprites/signal-badge-blue.png", 32, 32, 5)),
      at(190, 150, img("/sprites/signal-badge-orange.png", 32, 32, 5)),
      at(360, 150, img("/sprites/signal-badge-red.png", 32, 32, 5)),
      at(130, 400, probe(4)),
    ],
  },
  countries: {
    tone: "blue",
    label: "COUNTRIES BOARD",
    title: "Every tap counts for your country",
    sub: "Push your flag up today's board.",
    art: [
      ...["GB", "US", "IN", "FR", "BR", "JP", "DE", "NG", "CA"].map((cc, i) => at(30 + (i % 3) * 170, 60 + Math.floor(i / 3) * 120, flag(cc, 8))),
      at(160, 440, probe(3)),
    ],
  },
  "destination-mars": {
    tone: "blue",
    label: "DESTINATION FILE · MARS",
    title: "A fact a day about Mars",
    sub: "From the crew flying one probe there.",
    art: [at(80, 60, img("/sprites/mars.png", 128, 128, 3)), at(150, 480, probe(2))],
  },
};

function html(name) {
  const p = IMAGES[name];
  const css = ["src/styles/fonts.css", "src/styles/theme.css", "src/styles/base.css", "src/components/Window.css", "src/components/Sky.css"]
    .map(read)
    .join("\n");
  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8" /><style>${css}
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--page); }
.frame { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
.sky__stars, .sky__nebula { animation: none !important; }
.text { position: absolute; left: 56px; top: 50%; transform: translateY(-50%); width: 560px; padding: 36px 36px 40px; }
.label { margin: 0 0 18px; font: 400 30px/1 "VT323", monospace; letter-spacing: 2px; color: var(--text-orange); }
.window--blue .label { color: var(--blue); }
h1 { margin: 0; font: 700 62px/1.08 "Pixelify Sans", sans-serif; color: var(--text); }
.sub { margin: 22px 0 0; font: 500 28px/1.3 "Pixelify Sans", sans-serif; color: var(--text-orange-soft); }
.window--blue .sub, .window--muted .sub { color: var(--text-soft, var(--text)); }
.brand { position: absolute; right: 40px; bottom: 28px; font: 400 30px/1 "VT323", monospace; color: var(--text-dim); letter-spacing: 2px; }
.art { position: absolute; left: 640px; top: 0; width: 560px; height: ${H}px; }
.art img, .art span { image-rendering: pixelated; }
.q { font: 700 220px/1 "Pixelify Sans", sans-serif; color: var(--blue); }
</style></head><body><div class="frame">
<div class="sky" aria-hidden="true"><div class="sky__nebula"></div><div class="sky__stars sky__stars--far"></div><div class="sky__stars sky__stars--near"></div></div>
<div class="art">${p.art.join("")}</div>
<div class="window ${p.tone === "blue" ? "window--blue" : `window--${p.tone}`} text">
<p class="label">${esc(p.label)}</p><h1>${esc(p.title)}</h1><p class="sub">${esc(p.sub)}</p></div>
<div class="brand">ONESMALLCLICK</div>
</div></body></html>`;
}

// ---------- Serve and shoot ----------

const TYPES = { ".png": "image/png", ".woff2": "font/woff2", ".css": "text/css" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const m = path.match(/^\/__preview\/([a-z0-9-]+)\.html$/);
  if (m && IMAGES[m[1]]) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html(m[1]));
  }
  const file = join(root, "public", path);
  if (!file.startsWith(join(root, "public")) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

const shoot = (url, out) =>
  new Promise((resolve, reject) => {
    const profile = join(tmpdir(), `osc-previews-${process.pid}`);
    execFile(
      EDGE,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--user-data-dir=${profile}`,
        `--window-size=${W},${H}`,
        "--virtual-time-budget=4000",
        `--screenshot=${out}`,
        url,
      ],
      { timeout: 60_000 },
      (err) => (err ? reject(err) : resolve()),
    );
  });

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(IMAGES);
const unknown = names.filter((n) => !IMAGES[n]);
if (unknown.length) {
  console.error(`No such preview: ${unknown.join(", ")}. Known: ${Object.keys(IMAGES).join(", ")}`);
  process.exit(1);
}
mkdirSync(join(root, "public/share"), { recursive: true });
server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address();
  try {
    for (const name of names) {
      const out = join(root, "public/share", `${name}.png`);
      await shoot(`http://127.0.0.1:${port}/__preview/${name}.html`, out);
      const b = readFileSync(out);
      console.log(`public/share/${name}.png  ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}  ${Math.round(b.length / 1024)} KB`);
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
