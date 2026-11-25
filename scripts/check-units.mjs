// Phase M (prompt 103): every km in the game's content gets its miles (shared/units.ts). This lists each sentence
// the game changes, by file and field, and checks the formatter on known cases. Plain Node 24 (it reads the .ts).
//   node scripts/check-units.mjs [--all]      (--all prints every changed sentence, not just a count per file)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compactKmMi, kmMi, millionsKmMi, speedKmMi, speedKmhMph, withMiles } from "../shared/units.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const all = process.argv.includes("--all");
let failures = 0;
const check = (got, want) => {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${got}${ok ? "" : `   (want ${want})`}`);
};

// ---------- The formatter ----------
check(withMiles("The Moon is on average 384,400 km from Earth."), "The Moon is on average 384,400 km (238,900 miles) from Earth.");
check(withMiles("about 1.5 million km from Earth"), "about 1.5 million km (930,000 miles) from Earth");
check(withMiles("a ping across 120 million km takes"), "a ping across 120 million km (75 million miles) takes");
check(withMiles("about 6,000 km above Mars"), "about 6,000 km (3,700 miles) above Mars");
check(withMiles("1.21 million km away"), "1.21 million km (752,000 miles) away");
check(withMiles("2,000,000 km of thrust"), "2,000,000 km (1.2 million miles) of thrust");
check(withMiles("winds over 2,000 km/h"), "winds over 2,000 km/h (1,200 mph)");
check(withMiles("11 billion km"), "11 billion km (6.8 billion miles)");
check(withMiles("every km counts, 24 km/s"), "every km counts, 24 km/s");
check(withMiles(withMiles("384,400 km")), "384,400 km (238,900 miles)");
check(kmMi(38266), "38,266 km / 23,777 mi");
check(compactKmMi(186_400_000), "186M km / 116M mi");
check(millionsKmMi(57_593_689), "57.59M km / 35.79M mi");
check(speedKmMi(24.1), "24.10 km/s / 14.98 mi/s");
check(speedKmhMph(1234), "1,234 km/h / 766 mph");

// ---------- The content: what the game shows with miles ----------
// Source quotes, URLs and labels of sources are left as written.
const SKIP = new Set(["quote", "url", "source", "sources", "label_source", "_about", "checked", "approved", "image", "nasaId", "licence", "credit", "alt"]);
const changed = [];
function walk(file, path, v) {
  if (typeof v === "string") {
    const w = withMiles(v);
    if (w !== v) changed.push({ file, path, from: v, to: w });
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(file, `${path}[${i}]`, x));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!SKIP.has(k)) walk(file, path ? `${path}.${k}` : k, x);
}
const files = ["content/campaign.json", "content/share.json", "content/nudges.json", "content/beta.json", "content/vote-options.json"];
for (const dir of ["content/milestones", "content/facts", "content/detours"]) for (const f of readdirSync(join(ROOT, dir))) if (f.endsWith(".json")) files.push(`${dir}/${f}`);
for (const f of files) walk(f, "", JSON.parse(readFileSync(join(ROOT, f), "utf-8")));

console.log(`\n${changed.length} sentences get their miles:`);
const byFile = Object.groupBy(changed, (c) => c.file);
for (const [f, list] of Object.entries(byFile)) {
  console.log(`  ${f}: ${list.length}`);
  if (all) for (const c of list) console.log(`    ${c.path}\n      ${c.to}`);
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
