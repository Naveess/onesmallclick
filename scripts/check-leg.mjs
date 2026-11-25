// E3: is a leg ready to launch? `npm run check-leg <stop>` (or `npm run check-leg` for every stop).
//
// CONTENT must pass (exit code 1 otherwise): the leg's milestones, 30 facts and detours, each with its checked
// source, Nav's approval on each file, its listing in shared/content.ts, and the campaign's leg length, probe,
// upgrade names, planet tech, map fact and next stop.
// ART is listed separately and doesn't fail the leg (Nav, prompt 74), so the list doubles as the PixelLab to-do;
// `--strict` makes it fail too. POSTCARD photos (prompts 95-97) are content: every milestone and the stop's landing
// need one, with its credit, licence, NASA source and image file (scripts/make-postcards.py).
// Plain Node, no dependencies. Reads content/, content/campaign.json, shared/content.ts and public/.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const has = (p) => existsSync(join(root, p));
const json = (p) => (has(p) ? JSON.parse(read(p)) : null);
const gb = new Intl.NumberFormat("en-GB");

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const wanted = args.filter((a) => !a.startsWith("--"));

const campaign = json("content/campaign.json");
const stops = campaign.stops;
const byId = new Map(stops.map((s) => [s.id, s]));
const probes = new Map(campaign.probes.map((p) => [p.id, p]));
const sharedPool = json("content/vote-options.json");
const registry = read("shared/content.ts");
// The planet-tech kinds the game applies (shared/tech.ts WIRED_TECH, E4b part 2a).
const WIRED_TECH = [...(/WIRED_TECH[^=]*=\s*\[([^\]]*)\]/.exec(read("shared/tech.ts"))?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]);
const UPGRADE_KEYS = ["cold", "ion", "sail", "hands", "chant"];
const FACT_COUNT = 30;
const MILESTONES_MIN = 4;
const MILESTONES_MAX = 6;
const DETOURS_MIN = 8;

/** Every file of a kind, for the checks that look across legs (unique slugs and ids). */
const all = (dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: `${dir}/${f}`, data: JSON.parse(read(`${dir}/${f}`)) }));
const allMilestones = all("content/milestones");
const allDetours = all("content/detours");

const fromsOf = (s) => (Array.isArray(s.from) ? s.from : s.from ? [s.from] : []);
const legKm = (s, from) => (typeof s.distanceKm === "number" ? s.distanceKm : s.distanceKm && typeof s.distanceKm === "object" ? (s.distanceKm[from] ?? null) : null);
const probeFor = (to, from) => probes.get(byId.get(to)?.probe ?? byId.get(from)?.probe ?? "pathfinder");
const isHttps = (u) => typeof u === "string" && /^https:\/\/\S+$/.test(u);
const nasa = (u) => /^https:\/\/([a-z0-9-]+\.)*(nasa\.gov)\//.test(u);
const text = (v) => typeof v === "string" && v.trim().length > 0;
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function check(stopId) {
  const errors = [];
  const warnings = [];
  const ok = [];
  const art = [];
  const s = byId.get(stopId);
  if (!s) return { stopId, errors: [`"${stopId}" isn't a stop in content/campaign.json`], warnings, ok, art, title: stopId };
  if (s.kind === "start" || s.kind === "endless")
    return { stopId, errors: [`${s.name} is the ${s.kind === "start" ? "start" : "endless last stage"}, not a leg`], warnings, ok, art, title: s.name };
  const froms = fromsOf(s);
  const lengths = froms.map((f) => [f, legKm(s, f)]);
  const title = `${froms.map((f) => byId.get(f)?.name ?? f).join(" or ")} → ${s.name}`;

  // ---------- Campaign ----------
  for (const [f, km] of lengths) {
    if (typeof km === "number" && km > 0) ok.push(`leg length from ${byId.get(f)?.name ?? f}: ${gb.format(km)} km`);
    else errors.push(`campaign.json: no checked leg length from ${f} (distanceKm is ${JSON.stringify(s.distanceKm)})`);
  }
  const tech = s.tech;
  if (tech && ["short", "name", "what", "gold", "silver", "bronze"].every((k) => text(tech[k]))) ok.push(`planet tech: ${tech.name}`);
  else errors.push("campaign.json: the planet tech needs short, name, what, gold, silver and bronze");
  const fx = tech?.effect;
  if (!fx || !["gold", "silver", "bronze"].every((m) => typeof fx[m] === "number" && fx[m] > 0)) {
    errors.push("campaign.json: the planet tech needs an effect {kind, gold, silver, bronze} (E4b)");
  } else if (!WIRED_TECH.includes(fx.kind)) {
    errors.push(`the planet tech's kind "${fx.kind}" isn't applied by the game yet (add it to shared/tech.ts and the Probe)`);
  } else ok.push(`planet tech effect: ${fx.kind} ${fx.gold} / ${fx.silver} / ${fx.bronze}`);
  // The map card shows the Destination file's first fact when there is one (MapPage), else campaign.json's.
  if (has(`content/facts/${stopId}.json`)) ok.push("map fact: the Destination file's fact 1");
  else if (s.fact && text(s.fact.text) && isHttps(s.fact.source) && text(s.fact.quote) && isDate(s.fact.checked)) ok.push("map fact, with source and quote");
  else errors.push("campaign.json: the map fact needs text, an https source, a quote and a checked date");
  const legProbes = [...new Set(froms.map((f) => probeFor(stopId, f)))];
  for (const p of legProbes) {
    if (!p) {
      errors.push("campaign.json: no probe for this leg");
      continue;
    }
    const missing = UPGRADE_KEYS.filter((k) => !text(p.upgrades?.[k]?.name) || !text(p.upgrades?.[k]?.line));
    if (missing.length) errors.push(`campaign.json: ${p.name} needs an upgrade name and line for ${missing.join(", ")}`);
    else ok.push(`probe ${p.name}, with all five upgrade names`);
    if (!text(p.pitch)) errors.push(`campaign.json: ${p.name} needs a pitch (the new probe reveal)`);
  }
  if (s.branchVote) {
    const bad = s.branchVote.filter((b) => !byId.has(b));
    if (s.branchVote.length === 2 && bad.length === 0) ok.push(`next: the crew votes ${s.branchVote.map((b) => byId.get(b).name).join(" or ")}`);
    else errors.push(`campaign.json: branchVote should name two stops (${JSON.stringify(s.branchVote)})`);
  } else {
    const next = stops.find((n) => fromsOf(n).includes(stopId) && n.kind !== "branch");
    if (next) ok.push(`next: ${next.name} (no vote)`);
    else errors.push("campaign.json: nothing follows this stop (no branchVote, and no stop lists it in 'from')");
  }

  // ---------- Listed in shared/content.ts ----------
  for (const kind of ["milestones", "facts", "detours"]) {
    const file = `content/${kind}/${stopId}.json`;
    if (has(file) && !registry.includes(`../${file}`)) errors.push(`shared/content.ts: import ${file} and add ${stopId} to LEG_${kind.toUpperCase()}`);
  }

  const approval = (file, d) => {
    if (d.approved && isDate(d.approved)) ok.push(`${file}: approved ${d.approved}`);
    else errors.push(`${file}: waiting for Nav's approval ("approved" is ${JSON.stringify(d.approved ?? null)})`);
  };

  // ---------- Milestones ----------
  const msFile = `content/milestones/${stopId}.json`;
  const msData = json(msFile);
  const msFacts = [];
  if (!msData) errors.push(`${msFile}: missing (${MILESTONES_MIN}–${MILESTONES_MAX} milestones)`);
  else {
    approval(msFile, msData);
    const list = msData.milestones ?? [];
    if (msData.stop !== stopId) errors.push(`${msFile}: "stop" should be "${stopId}"`);
    if (list.length < MILESTONES_MIN || list.length > MILESTONES_MAX) errors.push(`${msFile}: ${list.length} milestones (want ${MILESTONES_MIN}–${MILESTONES_MAX})`);
    const shortest = Math.min(...lengths.map(([, km]) => km ?? Infinity));
    let lastKm = 0;
    list.forEach((m, i) => {
      const at = `${msFile} milestone ${i + 1}`;
      if (m.n !== i + 1) errors.push(`${at}: n is ${m.n}, should be ${i + 1}`);
      if (!(typeof m.km === "number" && m.km > lastKm)) errors.push(`${at}: km ${m.km} should be more than the one before (${lastKm})`);
      if (typeof m.km === "number" && Number.isFinite(shortest) && m.km >= shortest) errors.push(`${at}: km ${gb.format(m.km)} is past the end of the leg (${gb.format(shortest)})`);
      lastKm = typeof m.km === "number" ? m.km : lastKm;
      for (const k of ["name", "title", "fact", "sub", "description"]) if (!text(m[k])) errors.push(`${at}: "${k}" is empty`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.slug ?? "")) errors.push(`${at}: slug "${m.slug}" should be lower-case words and dashes`);
      const twins = allMilestones.filter((f) => f.file !== msFile && f.data.milestones?.some((o) => o.slug === m.slug));
      if (twins.length) errors.push(`${at}: slug "${m.slug}" is also used in ${twins.map((t) => t.file).join(", ")} (fact pages are /milestones/<slug>)`);
      if (!Array.isArray(m.page) || m.page.length === 0 || !m.page.every(text)) errors.push(`${at}: "page" needs at least one paragraph`);
      if (!Array.isArray(m.sources) || m.sources.length === 0 || !m.sources.every((x) => text(x.label) && isHttps(x.url)))
        errors.push(`${at}: "sources" needs at least one {label, https url}`);
      else for (const x of m.sources) if (!nasa(x.url)) warnings.push(`${at}: source isn't a NASA page: ${x.url}`);
      if (msFacts.includes(m.fact)) errors.push(`${at}: the same fact as an earlier milestone`);
      msFacts.push(m.fact);
    });
    const halves = list.filter((m) => m.halfway);
    if (halves.length !== 1) errors.push(`${msFile}: exactly one milestone should be "halfway": true (the Halfway Crew badge), found ${halves.length}`);
    else if (lengths.length === 1 && typeof lengths[0][1] === "number") {
      const half = lengths[0][1] / 2;
      if (Math.abs(halves[0].km - half) > half * 0.02) errors.push(`${msFile}: the halfway milestone is at ${gb.format(halves[0].km)} km, but half the leg is ${gb.format(half)}`);
    } else warnings.push(`${msFile}: this stop has legs from ${froms.length} stops, so "halfway" can only be right for one of them`);
    if (list.length >= MILESTONES_MIN) ok.push(`${list.length} milestones, the last at ${gb.format(lastKm)} km`);
  }

  // ---------- Facts ----------
  const fFile = `content/facts/${stopId}.json`;
  const fData = json(fFile);
  if (!fData) errors.push(`${fFile}: missing (${FACT_COUNT} facts)`);
  else {
    approval(fFile, fData);
    const list = fData.facts ?? [];
    if (fData.destination !== stopId) errors.push(`${fFile}: "destination" should be "${stopId}"`);
    if (!isDate(fData.checked)) errors.push(`${fFile}: "checked" should be the date the facts were checked`);
    if (list.length !== FACT_COUNT) errors.push(`${fFile}: ${list.length} facts (want ${FACT_COUNT})`);
    const seen = new Set();
    list.forEach((f, i) => {
      const at = `${fFile} fact ${i + 1}`;
      if (f.n !== i + 1) errors.push(`${at}: n is ${f.n}, should be ${i + 1}`);
      if (!text(f.fact)) errors.push(`${at}: empty`);
      else if (f.fact.length > 160) warnings.push(`${at}: ${f.fact.length} characters (the card fits about 160)`);
      if (!text(f.source?.label) || !isHttps(f.source?.url)) errors.push(`${at}: needs a source {label, https url}`);
      else if (!nasa(f.source.url)) warnings.push(`${at}: source isn't a NASA page: ${f.source.url}`);
      if (!text(f.quote)) errors.push(`${at}: needs the quote from its source`);
      if (seen.has(f.fact)) errors.push(`${at}: repeats an earlier fact`);
      seen.add(f.fact);
      if (msFacts.includes(f.fact)) errors.push(`${at}: repeats a milestone's fact`);
    });
    if (list.length === FACT_COUNT) ok.push(`${FACT_COUNT} facts, each with a source and quote`);
  }

  // ---------- Detours ----------
  const dFile = `content/detours/${stopId}.json`;
  const dData = json(dFile);
  if (!dData) errors.push(`${dFile}: missing (at least ${DETOURS_MIN} detours)`);
  else {
    approval(dFile, dData);
    const list = dData.detours ?? [];
    if (dData.stop !== stopId) errors.push(`${dFile}: "stop" should be "${stopId}"`);
    if (list.length < DETOURS_MIN) errors.push(`${dFile}: ${list.length} detours (want at least ${DETOURS_MIN}; one is picked a day, avoiding the last 3)`);
    const sharedIds = new Set(sharedPool.options.map((o) => o.id));
    const noQuote = [];
    list.forEach((d, i) => {
      const at = `${dFile} detour ${i + 1} (${d.id})`;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id ?? "")) errors.push(`${at}: id should be lower-case words and dashes`);
      const twins = allDetours.filter((f) => f.file !== dFile && f.data.detours?.some((o) => o.id === d.id));
      if (twins.length || sharedIds.has(d.id) || list.filter((o) => o.id === d.id).length > 1)
        errors.push(`${at}: id is used twice (also ${[...twins.map((t) => t.file), ...(sharedIds.has(d.id) ? ["content/vote-options.json"] : [])].join(", ") || "in this file"})`);
      if (!(Number.isInteger(d.hours) && d.hours >= 1 && d.hours <= 4)) errors.push(`${at}: hours should be 1 to 4`);
      const h = `${d.hours} hour${d.hours === 1 ? "" : "s"}`;
      if (!text(d.label) || !d.label.endsWith(`about ${h} later`)) errors.push(`${at}: the label should end "about ${h} later"`);
      if (d.result !== `Arrival about ${h} later.`) errors.push(`${at}: the result should be "Arrival about ${h} later."`);
      if (!text(d.fact)) errors.push(`${at}: needs a fact`);
      if (!isHttps(d.source)) errors.push(`${at}: needs an https source`);
      else if (!nasa(d.source)) warnings.push(`${at}: source isn't a NASA page: ${d.source}`);
      if (!text(d.quote)) noQuote.push(d.id);
    });
    if (noQuote.length) warnings.push(`${dFile}: ${noQuote.length} detour${noQuote.length === 1 ? " has" : "s have"} no quote from the source (${noQuote.join(", ")})`);
    if (list.length >= DETOURS_MIN) ok.push(`${list.length} detours, each with a fact and source`);
  }

  // ---------- Art (listed, doesn't fail the leg unless --strict) ----------
  const artItem = (label, path, alt) => art.push({ label, path, ok: has(path) || (alt ? has(alt) : false) });
  for (const p of legProbes.filter(Boolean)) {
    const pathfinder = p.id === "pathfinder";
    artItem(`${p.name}: still`, pathfinder ? "public/sprites/probe.png" : `public/sprites/probe-${p.id}.png`);
    artItem(`${p.name}: engine strip, 5 frames`, pathfinder ? "public/sprites/thruster-sheet.png" : `public/sprites/thruster-${p.id}-sheet.png`);
  }
  artItem(`${s.name}: map and reveal art`, `public/sprites/${stopId}.png`, `public/sprites/${stopId}-rotating-sheet.png`);
  artItem(`${s.name}: stamp icon, 16×16`, `public/sprites/stamps/${stopId}.png`, `public/sprites/${stopId}-32.png`);
  artItem(`${s.name}: Destination file link preview, 1200×630`, `public/share/destination-${stopId}.png`);
  for (const m of msData?.milestones ?? []) artItem(`milestone ${m.n} link preview, 1200×630`, `public/share/milestone-${m.slug}.png`);

  // ---------- Postcards: real NASA photos (prompts 95-97) ----------
  const cards = msData ? [...(msData.milestones ?? []).map((m) => [`milestone ${m.n}`, m.postcard]), ["the landing postcard", msData.landingPostcard]] : [];
  for (const [what, c] of cards) {
    if (!c) errors.push(`${what}: no postcard photo (content/milestones/${stopId}.json; docs/postcard-photos.md)`);
    else if (!(c.nasaId && c.alt && c.credit && c.licence && /^https:\/\//.test(c.source ?? "")))
      errors.push(`${what}: the postcard needs nasaId, alt, credit, licence and an https source`);
    else if (c.image !== `/postcards/${c.nasaId.toLowerCase()}.jpg` || !has(`public${c.image}`))
      errors.push(`${what}: no image at public/postcards/${c.nasaId.toLowerCase()}.jpg (run python -I scripts/make-postcards.py)`);
  }

  return { stopId, title, errors, warnings, ok, art };
}

function report(r, detail) {
  const artMissing = r.art.filter((a) => !a.ok);
  const fail = r.errors.length > 0 || (strict && artMissing.length > 0);
  if (!detail) {
    console.log(
      `${r.stopId.padEnd(12)} ${r.errors.length ? `CONTENT FAIL (${r.errors.length})` : "content PASS"}${r.art.length ? ` · art ${r.art.length - artMissing.length}/${r.art.length}` : ""}${r.warnings.length ? ` · ${r.warnings.length} warning${r.warnings.length === 1 ? "" : "s"}` : ""}`,
    );
    return fail;
  }
  console.log(`\ncheck-leg ${r.stopId}: ${r.title}\n`);
  console.log("CONTENT (must pass)");
  for (const line of r.ok) console.log(`  ok    ${line}`);
  for (const line of r.errors) console.log(`  FAIL  ${line}`);
  if (r.warnings.length) {
    console.log("\nWARNINGS");
    for (const line of r.warnings) console.log(`  warn  ${line}`);
  }
  if (r.art.length) {
    console.log(`\nART (PixelLab; ${strict ? "--strict: must pass" : "listed, doesn't block the content"})`);
    for (const a of r.art) console.log(`  ${a.ok ? "ok   " : "need "} ${a.label}  (${a.path})`);
  }
  console.log(
    `\nRESULT: content ${r.errors.length ? `FAIL, ${r.errors.length} to fix` : "PASS"} · art ${r.art.length - artMissing.length} of ${r.art.length} made${fail ? "" : " · ready to launch"}${!fail && artMissing.length ? " (with stand-in art)" : ""}`,
  );
  return fail;
}

const ids = wanted.length ? wanted : stops.filter((s) => s.kind !== "start" && s.kind !== "endless").map((s) => s.id);
if (!wanted.length) console.log("check-leg: every leg (npm run check-leg <stop> for the details)\n");
let failed = false;
for (const id of ids) {
  const r = check(id);
  if (report(r, wanted.length > 0) && (wanted.length > 0 || has(`content/milestones/${id}.json`))) failed = true;
}
process.exit(failed ? 1 : 0);
