// Makes the 16×12 pixel flags for the leaderboards (phase 8b follow-up, prompts 40–41).
//
//   node scripts/make-flags.mjs <flag-icons folder> [--preview <png>]
//
// <flag-icons folder> is an unpacked copy of the MIT-licensed flag-icons package
// (`npm pack flag-icons@7.2.3`, then untar; it is not a dependency of the app).
// Each two-letter country's 4×3 SVG is drawn at 64×48 in headless Edge, then every 4×4 block
// becomes its most common colour, so the result is clean pixel art rather than a blurry shrink.
// Flags with busy emblems are then replaced by the hand-tidied versions in scripts/flags/overrides.json.
//
// Writes design/sprites/flags/flags-16x12.png (the sheet, 16 flags per row, in code order),
// public/sprites/flags-16x12.png (the copy the app serves) and src/game/flagIndex.json
// (code → position in the sheet).

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC) throw new Error("usage: node scripts/make-flags.mjs <flag-icons folder> [--preview <png>]");
const previewAt = process.argv.indexOf("--preview");
const PREVIEW = previewAt > 0 ? process.argv[previewAt + 1] : null;
const W = 16;
const H = 12;
const PER_ROW = 16;

const dir = join(SRC, "flags", "4x3");
const codes = readdirSync(dir)
  .filter((f) => /^[a-z]{2}\.svg$/.test(f))
  .map((f) => f.slice(0, 2))
  .sort();
const svgs = Object.fromEntries(codes.map((c) => [c, readFileSync(join(dir, `${c}.svg`), "utf-8")]));
const overrides = JSON.parse(readFileSync(join(ROOT, "scripts", "flags", "overrides.json"), "utf-8"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "osc-flags-"));
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new",
  "--disable-gpu",
  "--remote-debugging-port=9336",
  `--user-data-dir=${profile}`,
  "about:blank",
]);
let list;
for (let i = 0; i < 120 && !list; i++) {
  await wait(250);
  list = await fetch("http://127.0.0.1:9336/json/list").then((r) => r.json()).catch(() => null);
}
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const run = async (expression) => {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};

// In the page: draw each SVG at 64×48 and pool 4×4 blocks to their most common colour.
const pixels = await run(`(async () => {
  const svgs = ${JSON.stringify(svgs)};
  const out = {};
  const c = document.createElement("canvas");
  c.width = 64; c.height = 48;
  const g = c.getContext("2d", { willReadFrequently: true });
  const hex = (r, gg, b) => "#" + [r, gg, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  for (const [code, svg] of Object.entries(svgs)) {
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    g.clearRect(0, 0, 64, 48);
    g.drawImage(img, 0, 0, 64, 48);
    const d = g.getImageData(0, 0, 64, 48).data;
    const rows = [];
    for (let y = 0; y < ${H}; y++) {
      const row = [];
      for (let x = 0; x < ${W}; x++) {
        const count = new Map();
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
          const i = ((y * 4 + dy) * 64 + (x * 4 + dx)) * 4;
          const k = hex(d[i], d[i + 1], d[i + 2]);
          count.set(k, (count.get(k) ?? 0) + 1);
        }
        row.push([...count].sort((a, b) => b[1] - a[1])[0][0]);
      }
      rows.push(row);
    }
    out[code] = rows;
  }
  return out;
})()`);

delete pixels.xx; // "unknown", not a country

// ---------- Hand tidying (scripts/flags/overrides.json) ----------

/** Simple emblems, drawn by hand: "1", "2", "3" are the flag's colours c[0..2]; "." leaves the flag. */
const SHAPES = {
  shield: ["1111", "1221", "1221", "1221", ".11."],
  crest: ["111", "121", "121", ".1."],
  disc: [".11.", "1221", "1221", ".11."],
  tri: ["..1..", ".121.", "11111"],
  star: ["..1..", "11111", ".111.", ".1.1."],
  crown: ["1.1.1", "11111", "11111"],
  cross: [".1.", "111", ".1."],
  temple: ["...1...", ".1.1.1.", "1111111"],
  nguni: [".1122.", "112222", ".1122."],
  checker: ["1212", "2121", "1212", "2121", ".12."],
  haiti: ["1111", "1221", "1221"],
  sun: ["..11..", ".1111.", "111111"],
  castle: ["1.1.1", "11111", "11111"],
  saudi: ["1.11.111.", ".........", "11111111."],
  ring: [".1.1.", "1...1", ".....", "1...1", ".1.1."],
  bigdisc: [".1111.", "111111", "112211", "112211", "111111", ".1111."],
};
/** The Union Jack, 8×6, for the canton of the flags that carry it. */
const UNION = { rows: ["wbwrrwbw", "wwwrrwww", "rrrrrrrr", "rrrrrrrr", "wwwrrwww", "wbwrrwbw"], palette: { r: "#c8102e", w: "#ffffff", b: "#012169" } };

function stamp(px, x0, y0, rows, colour) {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = colour(ch);
      if (c && px[y0 + y]?.[x0 + x] !== undefined) px[y0 + y][x0 + x] = c;
    }),
  );
}

function tidy(px, t) {
  const [ax, ay, aw, ah] = t.area ?? [0, 0, W, H];
  const count = new Map();
  for (const row of px) for (const c of row) count.set(c, (count.get(c) ?? 0) + 1);
  const rare = (c) => count.get(c) < (t.rare ?? 8);
  const spots = [];
  for (let y = ay; y < ay + ah; y++) for (let x = ax; x < ax + aw; x++) if (rare(px[y][x])) spots.push([x, y]);
  // Back to the band colour: the most common ordinary colour in the same row (or column).
  const fill = (x, y) => {
    const line = t.dir === "col" ? px.map((r) => r[x]) : px[y];
    const n = new Map();
    for (const c of line) if (!rare(c)) n.set(c, (n.get(c) ?? 0) + 1);
    return [...n].sort((p, q) => q[1] - p[1])[0]?.[0] ?? px[y][x];
  };
  const fills = spots.map(([x, y]) => fill(x, y));
  spots.forEach(([x, y], i) => (px[y][x] = fills[i]));
  if (!t.shape) return;
  const shape = SHAPES[t.shape];
  if (!shape) throw new Error(`unknown shape ${t.shape}`);
  // At the emblem's centre, or the middle of the area if shrinking lost the emblem altogether.
  const xs = spots.length ? spots.map((s) => s[0]) : [ax, ax + aw - 1];
  const ys = spots.length ? spots.map((s) => s[1]) : [ay, ay + ah - 1];
  const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
  const x0 = Math.max(0, Math.min(W - shape[0].length, Math.round(cx - shape[0].length / 2)));
  const y0 = Math.max(0, Math.min(H - shape.length, Math.round(cy - shape.length / 2)));
  stamp(px, x0, y0, shape, (ch) => (ch === "." ? null : t.c[Number(ch) - 1]));
}

for (const [code, o] of Object.entries(overrides)) {
  if (code.startsWith("_")) continue;
  if (o.same) {
    o.rows = overrides[o.same].rows;
    o.palette = overrides[o.same].palette;
  }
  if (o.rows) {
    if (o.rows.length !== H || o.rows.some((r) => r.length !== W)) throw new Error(`override ${code}: needs ${W}×${H}`);
    pixels[code] = o.rows.map((r) => [...r].map((ch) => o.palette[ch]));
    continue;
  }
  if (!pixels[code]) throw new Error(`override ${code}: no such flag`);
  if (o.union) stamp(pixels[code], 0, 0, UNION.rows, (ch) => UNION.palette[ch]);
  if (o.tidy) tidy(pixels[code], o.tidy);
}

const all = Object.keys(pixels).sort();
const index = Object.fromEntries(all.map((c, i) => [c.toUpperCase(), i]));
const sheet = await run(`(() => {
  const px = ${JSON.stringify(pixels)}, all = ${JSON.stringify(all)};
  const rowsN = Math.ceil(all.length / ${PER_ROW});
  const draw = (scale, gap) => {
    const c = document.createElement("canvas");
    c.width = ${PER_ROW} * (${W} * scale + gap); c.height = rowsN * (${H} * scale + gap);
    const g = c.getContext("2d");
    all.forEach((code, i) => {
      const ox = (i % ${PER_ROW}) * (${W} * scale + gap), oy = Math.floor(i / ${PER_ROW}) * (${H} * scale + gap);
      px[code].forEach((row, y) => row.forEach((col, x) => { g.fillStyle = col; g.fillRect(ox + x * scale, oy + y * scale, scale, scale); }));
      if (gap) { g.fillStyle = "#000"; g.font = "10px monospace"; g.fillText(code, ox + 2, oy + ${H} * scale + 10); }
    });
    return c.toDataURL("image/png");
  };
  return { sheet: draw(1, 0), preview: draw(6, 14) };
})()`);

const png = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
mkdirSync(join(ROOT, "design", "sprites", "flags"), { recursive: true });
writeFileSync(join(ROOT, "design", "sprites", "flags", "flags-16x12.png"), png(sheet.sheet));
writeFileSync(join(ROOT, "public", "sprites", "flags-16x12.png"), png(sheet.sheet));
writeFileSync(join(ROOT, "src", "game", "flagIndex.json"), JSON.stringify(index) + "\n");
if (PREVIEW) writeFileSync(PREVIEW, png(sheet.preview));
console.log(`${all.length} flags, ${Object.keys(overrides).filter((k) => !k.startsWith("_")).length} hand-tidied`);
ws.close();
edge.kill();
process.exit(0);
