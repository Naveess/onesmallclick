// The Grand Tour (E0, approved 2026-11-20): stops, branches, leg lengths and probes, from
// content/campaign.json. Phase 8c uses it for arrival and the branch vote; E1–E4b add the rest.

import campaignRaw from "../content/campaign.json";
import { milesInContent } from "./units";

// Phase M: the miles in every sentence a player reads (shared/units.ts).
const campaign = milesInContent(campaignRaw);

export interface PlanetTech {
  short: string;
  name: string;
  what: string;
  gold: string;
  silver: string;
  bronze: string;
  /** What the game applies at each medal (E4b part 2a; shared/tech.ts). */
  effect?: { kind: string; gold: number; silver: number; bronze: number };
}

/** A stop's one map fact (E1), checked against the NASA page in `source`. */
export interface StopFact {
  text: string;
  source: string;
  quote: string;
  checked: string;
}

export interface Stop {
  id: string;
  name: string;
  kind: "start" | "planet" | "branch" | "endless";
  region: string;
  from?: string | string[];
  /** Km from the stop before (a number, or by previous stop when it has two), or "TODO"/null when unknown. */
  distanceKm?: number | Record<string, number> | string | null;
  mission?: number;
  probe?: string;
  tech?: PlanetTech;
  /** The two branches the crew votes between on arriving here. */
  branchVote?: string[];
  /** The campaign map's fact for this stop (E1; Mars uses content/facts/mars.json). */
  fact?: StopFact;
}

export interface ProbeDef {
  id: string;
  name: string;
  mission: number;
  pitch: string;
  /** Each upgrade's name and flavour line on this probe (E2). Effects and prices never change (shared/upgrades.ts). */
  upgrades?: Record<string, { name: string; line: string }>;
}

export const STOPS = campaign.stops as Stop[];
export const PROBES = campaign.probes as ProbeDef[];
const BY_ID = new Map(STOPS.map((s) => [s.id, s]));

export const FIRST_STOP = "mars";
export const START_STOP = "earth";

export function stop(id: string): Stop | undefined {
  return BY_ID.get(id);
}

export function stopName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

/** The leg's length from `from` to `to`, or null when the campaign doesn't give one yet. */
export function legKm(from: string, to: string): number | null {
  const d = BY_ID.get(to)?.distanceKm;
  if (typeof d === "number") return d;
  if (d && typeof d === "object") return d[from] ?? null;
  return null;
}

/** Where the tour goes after `id` when there's no vote: the stop that follows it. */
export function nextStop(id: string): Stop | undefined {
  return STOPS.find((s) => (Array.isArray(s.from) ? s.from.includes(id) : s.from === id) && s.kind !== "branch");
}

/** The probe flying the leg to `to`: the branch's own probe, or the one that flew the branch before a planet. */
export function probeFor(to: string, from: string): ProbeDef | undefined {
  const own = BY_ID.get(to)?.probe;
  const id = own ?? BY_ID.get(from)?.probe ?? "pathfinder";
  return PROBES.find((p) => p.id === id);
}

export function probeById(id: string): ProbeDef | undefined {
  return PROBES.find((p) => p.id === id);
}

/** "OSC-2" from "OSC-2 Ceres Hopper". */
export function probeTag(p: ProbeDef | undefined): string {
  return p?.name.split(" ")[0] ?? "OSC-1";
}

/** The probe that flew the leg into `stopId` (the leg before the current one), for "Cold-gas jets are now Hop jets". */
export function probeBefore(stopId: string): ProbeDef | undefined {
  const s = BY_ID.get(stopId);
  if (!s || s.kind === "start") return undefined;
  const from = Array.isArray(s.from) ? s.from[0] : (s.from ?? START_STOP);
  return probeFor(stopId, from);
}

/** Legs shorter than this are "moon legs" (E0 decision 2, option A): still about 30 days, but the probe's speed
 * reads in km/h and the flight view leads with "% of the way". */
export const MOON_LEG_KM = 10_000_000;

/** Option ids in a branch vote are "branch:<stop id>". */
export const BRANCH_PREFIX = "branch:";

export function branchStopId(optionId: string): string | null {
  return optionId.startsWith(BRANCH_PREFIX) ? optionId.slice(BRANCH_PREFIX.length) : null;
}
