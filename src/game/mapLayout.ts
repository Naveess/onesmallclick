// The campaign map (E1, design screen 1m): where each stop sits on the star chart, the path between them,
// and each stop's state from the legs flown (GET /api/tour) and the live probe. Ported from the design's
// buildMap() and mapVals(): same rows, sides, spacing and path shapes, read from content/campaign.json.

import { STOPS, stop as stopById, type Stop } from "../../shared/campaign";
import { medalFor, type Medal } from "../../shared/medals";
import type { TourLeg } from "../../shared/boards";

const DAY_MS = 86_400_000;

/** visited · next (the leg's destination, on the way) · vote (the open branch vote) · teaser (the branches after
 * the next stop) · future · skip (the branch not taken). */
export type StopState = "visited" | "next" | "vote" | "teaser" | "future" | "skip";
export type PathState = "done" | "cur" | "vote" | "fut" | "skip";

/** Row (0 = Earth, 12 = interstellar space) and side (-1 left/top, 0 middle, 1 right/bottom) of each stop. */
interface Place {
  row: number;
  side: number;
}

function places(): Map<string, Place> {
  const out = new Map<string, Place>();
  for (const s of STOPS) {
    if (s.kind === "start") {
      out.set(s.id, { row: 0, side: 0 });
      continue;
    }
    const froms = Array.isArray(s.from) ? s.from : s.from ? [s.from] : [];
    const row = Math.max(...froms.map((f) => out.get(f)?.row ?? 0)) + 1;
    let side = 0;
    if (s.kind === "branch") {
      const parent = stopById(froms[0]);
      side = parent?.branchVote?.indexOf(s.id) === 0 ? -1 : 1;
    }
    out.set(s.id, { row, side });
  }
  return out;
}

export const PLACES = places();
export const LAST_ROW = Math.max(...[...PLACES.values()].map((p) => p.row));

/** Every link on the chart: from each stop to the ones that follow it. */
export const EDGES: [string, string][] = STOPS.flatMap((s) => {
  const froms = Array.isArray(s.from) ? s.from : s.from ? [s.from] : [];
  return froms.map((f) => [f, s.id] as [string, string]);
});

/** The stops drawn as nodes (interstellar space is the label across the top of the chart). */
export const NODE_STOPS: Stop[] = STOPS.filter((s) => s.kind !== "endless");

/** The region labels down the side of the chart: the first row of each region. */
export const REGIONS: { row: number; label: string }[] = (() => {
  const seen = new Set<string>();
  const out: { row: number; label: string }[] = [];
  for (const s of NODE_STOPS) {
    if (seen.has(s.region)) continue;
    seen.add(s.region);
    out.push({ row: PLACES.get(s.id)!.row, label: s.region.toUpperCase().replace(" ", "\n") });
  }
  return out;
})();

export interface StopView {
  stop: Stop;
  state: StopState;
  leg: TourLeg | null;
  medal: Medal | null;
  /** The leg's day of arrival ("arrived on day 24 of 30"). */
  day: number | null;
}

export interface MapModel {
  stops: Map<string, StopView>;
  paths: Map<string, PathState>;
  /** Where the probe is: on this link, this far along it (0..1), or parked at a stop. */
  probe: { from: string; to: string; t: number };
  /** The leg's destination. */
  dest: string;
}

export interface LiveProbe {
  stop: string;
  fromStop: string;
  /** 0..1 of this leg. */
  progress: number;
  orbit: boolean;
  /** The open branch vote's stop ids, or none. */
  voteStops: string[];
}

const edgeKey = (a: string, b: string) => `${a}>${b}`;

/** Each stop's and each link's state, from the legs flown and the live probe. */
export function mapModel(legs: TourLeg[], live: LiveProbe): MapModel {
  const byStop = new Map(legs.map((l) => [l.stop, l]));
  const visited = new Set<string>(["earth", ...legs.map((l) => l.stop)]);
  if (live.orbit) visited.add(live.stop);
  const flown = new Set(legs.map((l) => edgeKey(l.fromStop, l.stop)));
  if (live.orbit) flown.add(edgeKey(live.fromStop, live.stop));
  const vote = new Set(live.orbit ? live.voteStops : []);
  const teaser = new Set(!live.orbit ? (stopById(live.stop)?.branchVote ?? []) : []);

  // A branch whose sibling was flown (or is being flown) wasn't taken.
  const skip = new Set<string>();
  for (const s of STOPS) {
    if (!s.branchVote) continue;
    const [a, b] = s.branchVote;
    const took = (x: string) => visited.has(x) || x === live.stop;
    if (took(a) && !took(b)) skip.add(b);
    if (took(b) && !took(a)) skip.add(a);
  }

  const stops = new Map<string, StopView>();
  for (const s of NODE_STOPS) {
    const state: StopState = visited.has(s.id)
      ? "visited"
      : s.id === live.stop
        ? "next"
        : vote.has(s.id)
          ? "vote"
          : skip.has(s.id)
            ? "skip"
            : teaser.has(s.id)
              ? "teaser"
              : "future";
    const leg = byStop.get(s.id) ?? null;
    const days = leg ? (leg.arrivedAt - leg.startedAt) / DAY_MS : null;
    stops.set(s.id, {
      stop: s,
      state,
      leg,
      medal: leg ? (leg.medal ?? medalFor(days!)) : null, // saved at arrival (E4b part 2a)
      day: days === null ? null : Math.max(1, Math.ceil(days)),
    });
  }

  const paths = new Map<string, PathState>();
  for (const [a, b] of EDGES) {
    const k = edgeKey(a, b);
    let st: PathState = "fut";
    if (flown.has(k)) st = "done";
    else if (!live.orbit && a === live.fromStop && b === live.stop) st = "cur";
    else if (live.orbit && a === live.stop && vote.has(b)) st = "vote";
    else if (skip.has(a) || skip.has(b)) st = "skip";
    paths.set(k, st);
  }
  const probe = live.orbit
    ? { from: live.fromStop, to: live.stop, t: 1 }
    : { from: live.fromStop, to: live.stop, t: Math.max(0, Math.min(1, live.progress)) };
  return { stops, paths, probe, dest: live.stop };
}

// ---------- Geometry: the design's lay() ----------

export interface Geometry {
  vertical: boolean;
  /** Width and height of the whole chart, px. */
  w: number;
  h: number;
  main: (row: number) => number;
  cross: (side: number) => number;
}

/** Phone: Earth at the bottom, rows 200px apart, sides 85px either side of the middle (the design's 390px layout). */
export function phoneGeometry(width: number): Geometry {
  const rows = LAST_ROW + 1;
  return {
    vertical: true,
    w: width,
    h: 170 + rows * 200 + 110,
    main: (row) => 170 + (rows - row) * 200,
    cross: (side) => Math.round(width / 2) + side * 85,
  };
}

/** Desktop: Earth at the left, rows 190px apart, sides 140px above and below the middle line. */
export function wideGeometry(height: number): Geometry {
  const rows = LAST_ROW + 1;
  return {
    vertical: false,
    w: 100 + rows * 190 + 300,
    h: height,
    main: (row) => 100 + row * 190,
    cross: (side) => Math.round(height / 2) + side * 140,
  };
}

export interface Segment {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Runs across the screen (for the dash direction). */
  across: boolean;
  state: PathState;
}

const THICK = 4;
const ORDER: Record<PathState, number> = { skip: 0, fut: 1, vote: 2, cur: 3, done: 4 };

/** The path pieces, drawn as boxes, and the probe's spot. Each link goes along its start's line, across, then along. */
export function layout(model: MapModel, g: Geometry) {
  const raw: [number, number, number, number, PathState][] = []; // main1, main2, cross1, cross2
  let probeAt: { main: number; cross: number } | null = null;
  const at = (id: string) => PLACES.get(id) ?? { row: LAST_ROW + 1, side: 0 };

  for (const [a, b] of EDGES) {
    const A = at(a);
    const B = at(b);
    const am = g.main(A.row);
    const bm = g.main(B.row);
    const ac = g.cross(A.side);
    const bc = g.cross(B.side);
    const mid = (am + bm) / 2;
    const parts: [number, number, number, number][] = [
      [am, mid, ac, ac],
      [mid, mid, ac, bc],
      [mid, bm, bc, bc],
    ];
    const st = model.paths.get(`${a}>${b}`) ?? "fut";
    const isProbe = a === model.probe.from && b === model.probe.to;
    if (!isProbe || st !== "cur") {
      for (const q of parts) raw.push([...q, st]);
      if (isProbe) probeAt = { main: bm, cross: bc };
      continue;
    }
    const lens = parts.map((q) => Math.abs(q[1] - q[0]) + Math.abs(q[3] - q[2]));
    let rem = lens.reduce((x, y) => x + y, 0) * model.probe.t;
    parts.forEach((q, i) => {
      if (rem <= 0) return raw.push([...q, "cur"]);
      if (rem >= lens[i]) {
        rem -= lens[i];
        return raw.push([...q, "done"]);
      }
      const f = rem / lens[i];
      const pm = q[0] + (q[1] - q[0]) * f;
      const pc = q[2] + (q[3] - q[2]) * f;
      raw.push([q[0], pm, q[2], pc, "done"], [pm, q[1], pc, q[3], "cur"]);
      probeAt = { main: pm, cross: pc };
      rem = 0;
    });
    if (!probeAt) probeAt = { main: bm, cross: bc };
  }
  if (!probeAt) {
    const d = at(model.dest);
    probeAt = { main: g.main(d.row), cross: g.cross(d.side) };
  }
  raw.sort((x, y) => ORDER[x[4]] - ORDER[y[4]]);

  const segments: Segment[] = raw
    .filter((q) => q[0] !== q[1] || q[2] !== q[3])
    .map(([m1, m2, c1, c2, state]) => {
      const alongMain = c1 === c2;
      let left: number, top: number, width: number, height: number, across: boolean;
      if (alongMain) {
        const lo = Math.min(m1, m2);
        const len = Math.abs(m2 - m1);
        if (g.vertical) [left, top, width, height, across] = [c1 - THICK / 2, lo, THICK, len, false];
        else [left, top, width, height, across] = [lo, c1 - THICK / 2, len, THICK, true];
      } else {
        const lo = Math.min(c1, c2);
        const len = Math.abs(c2 - c1) + THICK;
        if (g.vertical) [left, top, width, height, across] = [lo - THICK / 2, m1 - THICK / 2, len, THICK, true];
        else [left, top, width, height, across] = [m1 - THICK / 2, lo - THICK / 2, THICK, len, false];
      }
      return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height), across, state };
    });

  const xy = (m: number, c: number) => (g.vertical ? { x: c, y: m } : { x: m, y: c });
  const nodes = NODE_STOPS.map((s) => {
    const p = at(s.id);
    return { id: s.id, ...xy(g.main(p.row), g.cross(p.side)) };
  });
  const pr = probeAt as { main: number; cross: number };
  const probe = xy(Math.round(pr.main), Math.round(pr.cross));
  /** A band across the chart at a row (the belts and the heliopause). */
  const band = (row: number, size: number) =>
    g.vertical
      ? { left: 0, top: g.main(row) - size / 2, width: g.w, height: size }
      : { left: g.main(row) - size / 2, top: 0, width: size, height: g.h };
  const regions = REGIONS.map((r) => {
    const m = g.main(r.row) + (g.vertical ? 100 : -95);
    return { label: r.label, ...(g.vertical ? { x: 10, y: m - 14 } : { x: m + 8, y: 14 }) };
  });
  return { segments, nodes, probe, band, regions };
}

/** Where on the chart a stop's row is (to scroll to it). */
export function rowOf(id: string): number {
  return PLACES.get(id)?.row ?? 0;
}
