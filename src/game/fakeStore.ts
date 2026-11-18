import { useSyncExternalStore } from "react";
import {
  COAST_KM_S,
  MILESTONES,
  ROUTE_KM,
  SIGNAL_URGENT_S,
  SIGNAL_WINDOW_S,
  UPGRADES,
  autoKmS,
  tapKm,
  upgradeCost,
  type UpgradeKey,
  type UpgradeLevels,
} from "./rules";

// PHASE 3: a fake game that runs entirely in the browser, for this visit only (nothing is saved).
// It is shaped like the real state so phases 4–8 can swap each part for server data:
//   ProbeState  → the shared `Probe` Durable Object (phase 4), signal (5), vote (7)
//   PlayerState → the player's own progress (phase 6), ping and vote (5, 7)
// Starting numbers are the design mock-up's.

export interface VoteOption {
  label: string;
  votes: number;
}

/** Shared by everyone: the server's truth from phase 4. */
export interface ProbeState {
  missionStartedAt: number; // epoch ms
  routeKm: number;
  distanceKm: number;
  coastKmS: number;
  /** The rest of the crew's thrust right now (taps and auto-thrust). */
  crewKmS: number;
  online: number;
  /** Shown when only a handful are here: everyone else's idling thrusters. */
  idling: number | null;
  signalDeadline: number; // epoch ms
  vote: { question: string; options: VoteOption[]; closesAt: number };
}

/** This player's own state. */
export interface PlayerState {
  credits: number;
  levels: UpgradeLevels;
  kmToday: number;
  /** Km from taps today: sets "your taps today got us there X sooner". */
  tapKmToday: number;
  lifetimeKm: number;
  pingedToday: boolean;
  voteChoice: number | null;
  pingStreakDays: number;
}

export interface GameState {
  now: number;
  probe: ProbeState;
  player: PlayerState;
}

/** Test switches, from the URL: ?signal=final  ?crew=handful  ?ads=off */
export interface TestSwitches {
  finalSeconds: boolean;
  handful: boolean;
  ads: boolean;
}

function readSwitches(): TestSwitches {
  const q = new URLSearchParams(window.location.search);
  return {
    finalSeconds: q.get("signal") === "final",
    handful: q.get("crew") === "handful",
    ads: q.get("ads") !== "off",
  };
}

export const switches = readSwitches();

const DAY_MS = 86_400_000;

function nextUtcMidnight(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
}

function initialState(): GameState {
  const now = Date.now();
  return {
    now,
    probe: {
      missionStartedAt: now - 40.4 * DAY_MS, // mission day 41
      routeKm: ROUTE_KM,
      distanceKm: 182_406_311,
      coastKmS: COAST_KM_S,
      crewKmS: switches.handful ? 5.9 : 8.26,
      online: switches.handful ? 7 : 12_481,
      idling: switches.handful ? 48_206 : null,
      signalDeadline: now + (switches.finalSeconds ? 47 : 15_159) * 1000,
      vote: {
        question: "Which way today?",
        options: [
          { label: "Detour past asteroid 2026 QX for a postcard", votes: 12_840 },
          { label: "Burn hard: arrive about a day sooner", votes: 11_590 },
          { label: "Hold steady and save fuel for Mars", votes: 6_890 },
        ],
        closesAt: nextUtcMidnight(now),
      },
    },
    player: {
      credits: 5_320,
      levels: { cold: 6, ion: 3, sail: 0, hands: 4, chant: 1 },
      kmToday: 9_640,
      tapKmToday: 3_921, // about 2 min 14 s sooner at the starting pace, as in the design
      lifetimeKm: 1_204_880,
      pingedToday: false,
      voteChoice: null,
      pingStreakDays: 21,
    },
  };
}

let state: GameState = initialState();
const listeners = new Set<() => void>();
let timer: number | undefined;

function set(next: GameState) {
  state = next;
  listeners.forEach((fn) => fn());
}

function tick() {
  const now = Date.now();
  const dt = Math.min(5, (now - state.now) / 1000); // seconds since the last tick, capped if the tab slept
  const { probe, player } = state;
  const auto = autoKmS(player.levels);
  const speed = probe.coastKmS + probe.crewKmS + auto;

  let signalDeadline = probe.signalDeadline;
  if (signalDeadline <= now) {
    // Safe mode is phase 5. Until then the final-seconds test loops back to 59 s, as the mock-up does,
    // and a normal timer rests at zero.
    signalDeadline = switches.finalSeconds ? now + 59_000 : now;
  }

  // The fake crowd: a little drift in people here and in the vote, so the numbers feel alive.
  const drift = Math.random() < 0.2;
  set({
    now,
    probe: {
      ...probe,
      distanceKm: Math.min(probe.routeKm, probe.distanceKm + speed * dt),
      signalDeadline,
      online: drift && !switches.handful ? probe.online + Math.round((Math.random() - 0.5) * 12) : probe.online,
      vote: drift
        ? { ...probe.vote, options: probe.vote.options.map((o) => ({ ...o, votes: o.votes + (Math.random() < 0.5 ? 1 : 0) })) }
        : probe.vote,
    },
    player: {
      ...player,
      credits: player.credits + auto * dt,
      kmToday: player.kmToday + auto * dt,
      lifetimeKm: player.lifetimeKm + auto * dt,
    },
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (timer === undefined) {
    state = { ...state, now: Date.now() };
    timer = window.setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

// --- Actions (each becomes a request to the server in a later phase) ---

/** One tap of THRUST. Returns the km it added, for the "+km" popup. */
export function thrust(): number {
  const km = tapKm(state.player.levels);
  const { probe, player } = state;
  set({
    ...state,
    probe: { ...probe, distanceKm: Math.min(probe.routeKm, probe.distanceKm + km) },
    player: {
      ...player,
      credits: player.credits + km,
      kmToday: player.kmToday + km,
      tapKmToday: player.tapKmToday + km,
      lifetimeKm: player.lifetimeKm + km,
    },
  });
  return km;
}

export function ping() {
  if (state.player.pingedToday) return;
  set({
    ...state,
    probe: { ...state.probe, signalDeadline: Date.now() + SIGNAL_WINDOW_S * 1000 },
    player: { ...state.player, pingedToday: true },
  });
}

export function castVote(index: number) {
  if (state.player.voteChoice !== null) return;
  const options = state.probe.vote.options.map((o, i) => (i === index ? { ...o, votes: o.votes + 1 } : o));
  set({
    ...state,
    probe: { ...state.probe, vote: { ...state.probe.vote, options } },
    player: { ...state.player, voteChoice: index },
  });
}

export function buyUpgrade(key: UpgradeKey) {
  const def = UPGRADES.find((u) => u.key === key)!;
  const cost = upgradeCost(def, state.player.levels[key]);
  if (state.player.credits < cost) return;
  set({
    ...state,
    player: {
      ...state.player,
      credits: state.player.credits - cost,
      levels: { ...state.player.levels, [key]: state.player.levels[key] + 1 },
    },
  });
}

// --- Reading the state ---

export function useGame() {
  const s = useSyncExternalStore(subscribe, () => state);
  return { ...s, view: derive(s) };
}

/** Everything the screens show that is worked out from the state. */
function derive({ now, probe, player }: GameState) {
  const auto = autoKmS(player.levels);
  const speedKmS = probe.coastKmS + probe.crewKmS + auto;
  const toGoKm = Math.max(0, probe.routeKm - probe.distanceKm);
  const signalLeftS = Math.max(0, (probe.signalDeadline - now) / 1000);
  const next = MILESTONES.find((m) => m.km > probe.distanceKm) ?? null;
  const upgrades = UPGRADES.map((def) => {
    const level = player.levels[def.key];
    const cost = upgradeCost(def, level);
    return { def, level, cost, affordable: player.credits >= cost };
  });
  return {
    missionDay: Math.floor((now - probe.missionStartedAt) / 86_400_000) + 1,
    speedKmS,
    autoKmS: auto,
    tapKm: tapKm(player.levels),
    toGoKm,
    progress: probe.distanceKm / probe.routeKm, // 0..1
    arrivalAt: now + (toGoKm / speedKmS) * 1000,
    /** Seconds sooner thanks to your taps today. */
    savedS: player.tapKmToday / speedKmS,
    signalLeftS,
    signalUrgent: signalLeftS < SIGNAL_URGENT_S && !player.pingedToday,
    nextMilestone: next,
    toNextKm: next ? next.km - probe.distanceKm : 0,
    voteLeftS: Math.max(0, (probe.vote.closesAt - now) / 1000),
    voteTotal: probe.vote.options.reduce((sum, o) => sum + o.votes, 0),
    upgrades,
    affordable: upgrades.filter((u) => u.affordable).length,
  };
}

export type GameView = ReturnType<typeof derive>;
