// E3: each leg's content, one file per stop and kind (content/milestones/, content/facts/, content/detours/).
// To add a leg, add its three files and one line for each below; `npm run check-leg <stop>` says what's missing.
// The app and the Worker both read these maps (Vite bundles the JSON), so no other code changes per leg.

import ceresDetours from "../content/detours/ceres.json";
import marsDetours from "../content/detours/mars.json";
import vestaDetours from "../content/detours/vesta.json";
import ceresFacts from "../content/facts/ceres.json";
import marsFacts from "../content/facts/mars.json";
import vestaFacts from "../content/facts/vesta.json";
import ceresMilestones from "../content/milestones/ceres.json";
import marsMilestones from "../content/milestones/mars.json";
import vestaMilestones from "../content/milestones/vesta.json";

export interface MilestoneEntry {
  n: number;
  slug: string;
  name: string;
  km: number;
  title: string;
  fact: string;
  sub: string;
  /** The Halfway Crew badge's milestone on this leg. */
  halfway?: boolean;
}

export interface FactEntry {
  n: number;
  fact: string;
}

export interface DetourEntry {
  id: string;
  hours: number;
  label: string;
  result: string;
  fact: string;
  source: string;
}

/** Each leg's milestones, by the stop it flies to. */
export const LEG_MILESTONES: Record<string, MilestoneEntry[]> = {
  mars: marsMilestones.milestones,
  ceres: ceresMilestones.milestones,
  vesta: vestaMilestones.milestones,
};

/** Each destination's 30 facts (the Destination file). */
export const LEG_FACTS: Record<string, FactEntry[]> = {
  mars: marsFacts.facts,
  ceres: ceresFacts.facts,
  vesta: vestaFacts.facts,
};

/** Each leg's detours for the daily vote (the faster and steady options are shared: content/vote-options.json). */
export const LEG_DETOURS: Record<string, DetourEntry[]> = {
  mars: marsDetours.detours,
  ceres: ceresDetours.detours,
  vesta: vestaDetours.detours,
};
