import { useSyncExternalStore } from "react";
import {
  BASE_TAP_KM,
  BATCH_MS,
  COAST_KM_S,
  MAX_TAPS_PER_S,
  ROUTE_KM,
  distanceAt,
  type ProbeSnapshot,
  type ServerMessage,
} from "../../shared/mission";
import { startProbe, type Connection } from "./probeClient";
import {
  MILESTONES,
  SIGNAL_URGENT_S,
  SIGNAL_WINDOW_S,
  UPGRADES,
  autoKmS,
  upgradeCost,
  type UpgradeKey,
  type UpgradeLevels,
} from "./rules";

// The game's state for the screens.
//   REAL from phase 4: the shared probe (distance, crew pace, people here, mission day, arrival date)
//                      and this device's km today, from the Probe Durable Object over a WebSocket.
//   STILL FAKE:        credits and upgrades (phase 6), the signal and Ping (phase 5), today's vote (phase 7).
// Time is the server's clock: every message carries it, and `now` below is Date.now() + that offset.

export interface VoteOption {
  label: string;
  votes: number;
}

/** Shared by everyone. */
export interface ProbeState {
  missionStartedAt: number; // epoch ms, server clock
  routeKm: number;
  /** What to show: the server's distance, plus coasting since, plus this device's taps not yet credited. */
  distanceKm: number;
  coastKmS: number;
  /** The crew's taps over the last few minutes, in km/s. */
  crewKmS: number;
  online: number;
  /** Shown when only a handful are here: everyone else's idling thrusters. (Phase 6; test switch until then.) */
  idling: number | null;
  tapKm: number;
  /** FAKE until phase 5. */
  signalDeadline: number;
  /** FAKE until phase 7. */
  vote: { question: string; options: VoteOption[]; closesAt: number };
}

/** This player's own state. */
export interface PlayerState {
  /** FAKE until phase 6. */
  credits: number;
  /** FAKE until phase 6: buying works for this visit only and doesn't change the real tap power yet. */
  levels: UpgradeLevels;
  /** Real: km this device pushed today (UTC). */
  kmToday: number;
  /** Real: km from taps today; sets "your taps today got us there X sooner". */
  tapKmToday: number;
  /** FAKE until phase 6. */
  lifetimeKm: number;
  /** FAKE until phase 5. */
  pingedToday: boolean;
  /** FAKE until phase 7. */
  voteChoice: number | null;
  /** FAKE until phase 5. */
  pingStreakDays: number;
}

export interface GameState {
  now: number;
  connection: Connection;
  /** False until the first word from the server (or a cached copy) arrives. */
  ready: boolean;
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
const CACHE_KEY = "osc.probe.v1";
/** Taps held while the socket is down; the server would cap anything beyond this anyway. */
const MAX_PENDING_TAPS = Math.round(MAX_TAPS_PER_S * (BATCH_MS / 1000) * 1.5);

// ---------- What the server told us ----------

let server: ProbeSnapshot | null = readCache();
let offsetMs = 0; // server clock − device clock
let serverToday = { kmToday: 0, tapKmToday: 0 };
let pendingTaps = 0;
const inFlight = new Map<number, number>(); // seq → taps sent, not yet credited

function readCache(): ProbeSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ProbeSnapshot) : null;
  } catch {
    return null;
  }
}

function writeCache(p: ProbeSnapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p));
  } catch {
    // private mode or storage blocked: fine, it's only a cache
  }
}

function serverNow() {
  return Date.now() + offsetMs;
}

function unconfirmedTaps() {
  let n = pendingTaps;
  for (const t of inFlight.values()) n += t;
  return n;
}

// ---------- The state the screens read ----------

function nextUtcMidnight(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
}

function initialState(): GameState {
  const now = Date.now();
  return {
    now,
    connection: "connecting",
    ready: server !== null,
    probe: {
      missionStartedAt: server?.missionStartedAt ?? now,
      routeKm: server?.routeKm ?? ROUTE_KM,
      distanceKm: server ? distanceAt(server, now) : 0,
      coastKmS: server?.coastKmS ?? COAST_KM_S,
      crewKmS: server?.crewKmS ?? 0,
      online: server?.online ?? 1,
      idling: switches.handful ? 48_206 : null,
      tapKm: server?.tapKm ?? BASE_TAP_KM,
      // FAKE (phase 5): the design's countdown.
      signalDeadline: now + (switches.finalSeconds ? 47 : 15_159) * 1000,
      // FAKE (phase 7): the design's vote.
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
      kmToday: 0,
      tapKmToday: 0,
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

/** Rebuilds the shown probe and today's km from the server's numbers and our unconfirmed taps. */
function compose(base: GameState, connection = base.connection): GameState {
  const now = serverNow();
  const p = server;
  const optimisticKm = unconfirmedTaps() * (p?.tapKm ?? BASE_TAP_KM);
  return {
    ...base,
    now,
    connection,
    ready: base.ready || p !== null,
    probe: {
      ...base.probe,
      ...(p && {
        missionStartedAt: p.missionStartedAt,
        routeKm: p.routeKm,
        distanceKm: Math.min(p.routeKm, distanceAt(p, now) + optimisticKm),
        coastKmS: p.coastKmS,
        crewKmS: p.crewKmS,
        online: p.online,
        tapKm: p.tapKm,
      }),
    },
    player: {
      ...base.player,
      kmToday: serverToday.kmToday + optimisticKm,
      tapKmToday: serverToday.tapKmToday + optimisticKm,
    },
  };
}

function onMessage(msg: ServerMessage) {
  offsetMs = msg.now - Date.now();
  server = msg.probe;
  if (msg.t === "hello" || msg.t === "credited") {
    serverToday = { kmToday: msg.kmToday, tapKmToday: msg.tapKmToday };
  }
  if (msg.t === "credited") inFlight.delete(msg.seq);
  if (msg.t !== "credited") writeCache(msg.probe);
  set(compose(state));
}

let started = false;

function startServer() {
  if (started) return;
  started = true;
  startProbe({
    onMessage,
    onConnection: (c) => set(compose(state, c)),
    onDropped: () => {
      // We can't know whether those batches were credited; drop them rather than count them twice.
      inFlight.clear();
      set(compose(state));
    },
    takeTaps: () => {
      const n = pendingTaps;
      pendingTaps = 0;
      return n;
    },
    sent: (seq, n) => inFlight.set(seq, n),
  });
}

function tick() {
  const prev = state;
  const next = compose(prev);
  const dt = Math.min(5, Math.max(0, (next.now - prev.now) / 1000)); // capped if the tab slept
  const auto = autoKmS(prev.player.levels);

  // FAKE (phase 5): the final-seconds test loops back to 59 s, as the mock-up does; a normal timer rests at zero.
  let signalDeadline = next.probe.signalDeadline;
  if (signalDeadline <= next.now) signalDeadline = switches.finalSeconds ? next.now + 59_000 : next.now;

  // FAKE (phase 7): a little drift in the vote, so it feels alive.
  const drift = Math.random() < 0.2;
  set({
    ...next,
    probe: {
      ...next.probe,
      signalDeadline,
      vote: drift
        ? {
            ...next.probe.vote,
            options: next.probe.vote.options.map((o) => ({ ...o, votes: o.votes + (Math.random() < 0.5 ? 1 : 0) })),
          }
        : next.probe.vote,
    },
    // FAKE (phase 6): auto-thrust earns credits locally; it doesn't move the shared probe yet.
    player: {
      ...next.player,
      credits: next.player.credits + auto * dt,
      lifetimeKm: next.player.lifetimeKm + auto * dt,
    },
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  startServer();
  if (timer === undefined) {
    state = compose(state);
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

// --- Actions ---

/** One tap of THRUST: shown straight away, sent in the next batch. Returns the km for the "+km" popup. */
export function thrust(): number {
  const km = state.probe.tapKm;
  if (unconfirmedTaps() < MAX_PENDING_TAPS || state.connection === "live") pendingTaps += 1;
  const next = compose(state);
  // FAKE (phase 6): credits and lifetime km.
  set({
    ...next,
    player: { ...next.player, credits: next.player.credits + km, lifetimeKm: next.player.lifetimeKm + km },
  });
  return km;
}

/** FAKE until phase 5. */
export function ping() {
  if (state.player.pingedToday) return;
  set({
    ...state,
    probe: { ...state.probe, signalDeadline: state.now + SIGNAL_WINDOW_S * 1000 },
    player: { ...state.player, pingedToday: true },
  });
}

/** FAKE until phase 7. */
export function castVote(index: number) {
  if (state.player.voteChoice !== null) return;
  const options = state.probe.vote.options.map((o, i) => (i === index ? { ...o, votes: o.votes + 1 } : o));
  set({
    ...state,
    probe: { ...state.probe, vote: { ...state.probe.vote, options } },
    player: { ...state.player, voteChoice: index },
  });
}

/** FAKE until phase 6: for this visit only. */
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
  // Until phase 6 only coasting and the crew's taps move the shared probe.
  const speedKmS = probe.coastKmS + probe.crewKmS;
  const toGoKm = Math.max(0, probe.routeKm - probe.distanceKm);
  const signalLeftS = Math.max(0, (probe.signalDeadline - now) / 1000);
  const next = MILESTONES.find((m) => m.km > probe.distanceKm) ?? null;
  const upgrades = UPGRADES.map((def) => {
    const level = player.levels[def.key];
    const cost = upgradeCost(def, level);
    return { def, level, cost, affordable: player.credits >= cost };
  });
  return {
    missionDay: Math.floor((now - probe.missionStartedAt) / DAY_MS) + 1,
    speedKmS,
    autoKmS: auto,
    /** The real tap power from the server (flat until phase 6; the fake upgrades don't change it). */
    tapKm: probe.tapKm,
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
