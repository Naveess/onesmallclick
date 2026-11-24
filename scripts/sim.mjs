// npm run sim: how many days the mission takes for different crowd sizes, using the real balance
// (shared/balance.ts) and the real upgrade rules (shared/upgrades.ts).
//
// The players here are assumptions, not game rules: each day every player plays a few short
// sessions at random times, taps at a steady rate, collects up to 8 hours of offline thrust when
// they come back, and spends their credits on whichever upgrade adds the most km per credit.
// One-minute steps; the idle pause stops coasting after 8 hours with no session.

import { registerHooks } from "node:module";

// shared/ uses extensionless imports (Vite's style); let Node find the .ts files.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (err) {
      if (spec.startsWith(".") && !/\.[cm]?[jt]s$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw err;
    }
  },
});

import { readFileSync } from "node:fs";

const B = await import("../shared/balance.ts");
const U = await import("../shared/upgrades.ts");

const MIN = 60;
const DAY_MIN = 1440;
const MAX_DAYS = 400;
const PAUSE_MIN = B.IDLE_PAUSE_MS / 60_000;
const CAP_MIN = U.OFFLINE_CAP_MS / 60_000;

/** Who's playing. Sessions a day × minutes each × taps a second while playing. */
const PROFILES = {
  light: { label: "Light (2 min a day)", sessions: 2, minutes: 1, tapsPerS: 3 },
  typical: { label: "Typical (5 min a day)", sessions: 2, minutes: 2.5, tapsPerS: 4 },
  keen: { label: "Keen (16 min a day)", sessions: 4, minutes: 4, tapsPerS: 5 },
};

/** The daily vote's "faster" options (hours sooner, at today's pace), for the worst case: faster wins every day. */
const FASTER = JSON.parse(readFileSync(new URL("../content/vote-options.json", import.meta.url), "utf-8"))
  .options.filter((o) => o.kind === "faster")
  .map((o) => -o.hours);

const CROWDS = [1, 10, 20, 35, 50, 200, 1_000, 10_000];

// A small seeded random, so every run prints the same table.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function newPlayer() {
  return { credits: 0, levels: { cold: 0, ion: 0, sail: 0, hands: 0, chant: 0 }, patches: 0, lastEnd: null };
}

/** Spend credits on the upgrade with the most km a day per credit, while any is affordable. */
function shop(p, prof) {
  const tapsPerDay = prof.sessions * prof.minutes * 60 * prof.tapsPerS;
  // Auto-thrust pays while connected and for up to 8 hours of each gap between sessions.
  const gapMin = DAY_MIN / prof.sessions;
  const autoSecondsPerDay = prof.sessions * (prof.minutes + Math.min(CAP_MIN, gapMin)) * 60;
  for (;;) {
    let best = null;
    for (const key of U.UPGRADE_KEYS) {
      const cost = U.upgradeCost(key, p.levels[key]);
      if (cost > p.credits) continue;
      const next = { ...p.levels, [key]: p.levels[key] + 1 };
      const gain =
        (U.tapKm(next, p.patches) - U.tapKm(p.levels, p.patches)) * tapsPerDay +
        (U.autoKmS(next, p.patches) - U.autoKmS(p.levels, p.patches)) * autoSecondsPerDay;
      const value = gain / cost;
      if (gain > 0 && (!best || value > best.value)) best = { key, cost, value };
    }
    if (!best) return;
    p.credits -= best.cost;
    p.levels[best.key] += 1;
  }
}

/** One mission from Earth to Mars. Returns the days it took and the players (to run a second mission).
 * `leg` (E2) flies a Grand Tour leg instead: its length scales coasting and the crew's top speed, and
 * `crewHalf` is that leg's recalibrated balance, as worker/probe.ts does. */
function mission(n, prof, seed, players = Array.from({ length: n }, newPlayer), fasterVotes = false, leg = null) {
  const scale = leg ? leg.km / B.ROUTE_KM : 1;
  const crewHalf = leg ? leg.crewHalf : B.CREW_HALF_KM_S;
  const dayKm = []; // the crew's raw km each day, for the next leg's recalibration
  const rand = rng(seed);
  const window = new Float64Array(B.CREW_WINDOW_MIN); // raw crew km per minute, the last hour
  let windowSum = 0;
  let distance = 0;
  let lastActive = 0; // the mission starts with the launch crowd
  let route = leg ? leg.km : B.ROUTE_KM;
  let dayStart = 0; // distance and moving minutes at the start of the day, for today's pace
  let movingMin = 0;
  let dayMoving = 0;
  for (const p of players) p.lastEnd = null;

  for (let day = 0; day < MAX_DAYS; day++) {
    // The vote closes at midnight: "faster" wins, hours at today's pace.
    if (fasterVotes && day > 0 && movingMin - dayMoving > 0) {
      const pace = (distance - dayStart) / ((movingMin - dayMoving) * MIN);
      route -= FASTER[Math.floor(rand() * FASTER.length)] * 3600 * pace;
    }
    dayStart = distance;
    dayMoving = movingMin;
    dayKm.push(0);
    // Today's sessions, in time order.
    const sessions = [];
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < prof.sessions; s++) sessions.push([Math.floor(rand() * DAY_MIN), i]);
    }
    sessions.sort((a, b) => a[0] - b[0]);
    let next = 0;

    for (let m = 0; m < DAY_MIN; m++) {
      const t = day * DAY_MIN + m;
      let raw = 0;
      while (next < sessions.length && sessions[next][0] === m) {
        const p = players[sessions[next][1]];
        next++;
        const auto = U.autoKmS(p.levels, p.patches);
        const catchup = p.lastEnd === null ? 0 : auto * Math.min(CAP_MIN, Math.max(0, t - p.lastEnd)) * MIN;
        const taps = prof.minutes * 60 * prof.tapsPerS * U.tapKm(p.levels, p.patches);
        const connected = auto * prof.minutes * 60;
        const km = catchup + taps + connected;
        p.credits += km; // your own km count in full
        p.lastEnd = t + prof.minutes;
        raw += km;
        dayKm[day] += km;
        lastActive = t;
        shop(p, prof);
      }
      const slot = t % window.length;
      windowSum += raw - window[slot];
      window[slot] = raw;
      const rawKmS = windowSum / (window.length * MIN);
      const paused = t - lastActive > PAUSE_MIN;
      if (!paused) movingMin++;
      const factor = (B.CREW_TOP_KM_S * scale) / (Math.max(0, rawKmS) + crewHalf);
      distance += (paused ? 0 : B.COAST_KM_S * scale * MIN) + raw * factor;
      if (distance >= route) return { days: day + m / DAY_MIN, players, dayKm };
    }
  }
  return { days: Infinity, players, dayKm };
}

const fmt = (d) => (d === Infinity ? `>${MAX_DAYS}` : d.toFixed(1));
const pad = (s, w) => String(s).padStart(w);

console.log(`Days from Earth to Mars (${(B.ROUTE_KM / 1e6).toFixed(0)}M km), no votes or safe mode.`);
console.log(
  `Crew speed = ${B.CREW_TOP_KM_S.toFixed(0)} × R / (R + ${B.CREW_HALF_KM_S}) km/s on top of ${B.COAST_KM_S} km/s coasting; ` +
    `the floor is ${(B.ROUTE_KM / ((B.COAST_KM_S + B.CREW_TOP_KM_S) * 86_400)).toFixed(1)} days.\n`,
);
const keys = Object.keys(PROFILES);
console.log(pad("Players a day", 14) + keys.map((k) => pad(PROFILES[k].label, 24)).join("") + pad("Typical, 2nd mission", 24));
for (const n of CROWDS) {
  const cells = keys.map((k) => pad(fmt(mission(n, PROFILES[k], 1000 + n).days), 24));
  const first = mission(n, PROFILES.typical, 1000 + n);
  const second = mission(n, PROFILES.typical, 2000 + n, first.players);
  console.log(pad(n.toLocaleString("en-GB"), 14) + cells.join("") + pad(fmt(second.days), 24));
}
{
  const worst = mission(10_000, PROFILES.keen, 4000, undefined, true);
  const small = mission(35, PROFILES.typical, 4001, undefined, true);
  console.log(`\nIf "faster" wins every day's vote: 10,000 keen players ${fmt(worst.days)} days; 35 typical players ${fmt(small.days)} days.`);
}
console.log(`Coasting alone: ${fmt(mission(0, PROFILES.typical, 1).days)} days (it pauses after 8 hours).`);

// Progress is kept between missions (decision 6), so a crew that stays gets stronger.
{
  const n = 35;
  let players;
  const days = [];
  for (let i = 0; i < 5; i++) {
    const r = mission(n, PROFILES.typical, 3000 + i, players);
    players = r.players;
    days.push(fmt(r.days));
  }
  console.log(`The same ${n} typical players, five missions in a row: ${days.join(", ")} days.`);
}

// E2: the whole Grand Tour, one branch each way (the shorter-named first), with each leg scaled to its
// length and the crew balance recalibrated at every launch, exactly as worker/probe.ts nextCrewHalf() does:
// the Mars leg's average push is the yardstick, and each later leg's balance scales with the last 3 days'.
{
  const C = JSON.parse(readFileSync(new URL("../content/campaign.json", import.meta.url), "utf-8"));
  const byId = Object.fromEntries(C.stops.map((s) => [s.id, s]));
  const kmOf = (from, to) => {
    const d = byId[to].distanceKm;
    return typeof d === "number" ? d : d && typeof d === "object" ? d[from] : null;
  };
  const path = ["earth", "mars", "ceres", "jupiter", "europa", "saturn", "titan", "uranus", "miranda", "neptune", "pluto"];
  const legs = path.slice(1).map((to, i) => ({ from: path[i], to, km: kmOf(path[i], to) }));
  const tour = (n, seed) => {
    let players;
    let crewHalf = B.CREW_HALF_KM_S;
    let base = null;
    return legs.map((leg, i) => {
      const r = mission(n, PROFILES.typical, seed + i, players, false, { km: leg.km, crewHalf });
      players = r.players;
      const whole = r.dayKm.reduce((a, b) => a + b, 0) / Math.max(1, r.days * 86_400);
      const full = r.dayKm.slice(0, Math.floor(r.days)).slice(-3);
      const recent = full.length ? full.reduce((a, b) => a + b, 0) / (full.length * 86_400) : whole;
      if (i === 0 || !base) base = whole;
      crewHalf = base > 0 && recent > 0 ? Math.min(B.CREW_HALF_KM_S * 50, Math.max(B.CREW_HALF_KM_S / 4, (B.CREW_HALF_KM_S * recent) / base)) : B.CREW_HALF_KM_S;
      return r.days;
    });
  };
  console.log(`\nThe Grand Tour, typical players, recalibrated each leg (days per leg; moon legs marked *):`);
  console.log(pad("Players a day", 14) + legs.map((l) => pad(`${byId[l.to].name}${l.km < 10_000_000 ? "*" : ""}`, 10)).join(""));
  for (const n of [10, 35, 200]) {
    console.log(pad(n, 14) + tour(n, 5000 + n).map((d) => pad(fmt(d), 10)).join(""));
  }
}
