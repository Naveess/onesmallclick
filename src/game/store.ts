import { useSyncExternalStore } from "react";
import {
  BASE_TAP_KM,
  BATCH_MS,
  COAST_KM_S,
  MAX_TAPS_PER_S,
  ROUTE_KM,
  SIGNAL_URGENT_S,
  SIGNAL_WINDOW_MS,
  distanceAt,
  setbackMs,
  type BadgeTier,
  type DeviceToday,
  type PingResult,
  type ProbeSnapshot,
  type ServerMessage,
} from "../../shared/mission";
import type { LiveVote, VoteResult } from "../../shared/votes";
import { PRESTIGE_AT_KM, type Progress, type WelcomeBack } from "../../shared/upgrades";
import { request, startProbe, type Connection } from "./probeClient";
import { MILESTONES, UPGRADES, upgradeCost, type UpgradeKey, type UpgradeLevels } from "./rules";
import { preloadTurnstile, turnstileToken } from "./turnstile";

// The game's state for the screens.
//   REAL from phase 4: the shared probe (distance, crew pace, people here, mission day, arrival date)
//                      and this device's km today, from the Probe Durable Object over a WebSocket.
//   REAL from phase 5: the signal timer, safe mode and its setback, Ping (POST /api/ping), streaks.
//   REAL from phase 6: credits, upgrades, auto-thrust, prestige patches, welcome back. The server
//                      decides every purchase; between messages credits tick up at your auto rate.
//   REAL from phase 7a: today's crew vote (POST /api/vote, live tallies) and the mission log (/log).
// Time is the server's clock: every message carries it, and `now` below is Date.now() + that offset.

export type VoteOption = LiveVote["options"][number];

/** Shared by everyone. */
export interface ProbeState {
  missionStartedAt: number; // epoch ms, server clock
  /** The route, including setbacks already made permanent. */
  routeKm: number;
  /** What to show: the server's distance, plus coasting and auto-thrust since, plus this device's taps not yet credited. */
  distanceKm: number;
  coastKmS: number;
  /** Everyone connected's auto-thrust after the ceiling (it moves the probe continuously). */
  autoKmS: number;
  /** What the crew adds: recent taps plus auto-thrust, after the ceiling (0 in safe mode). */
  crewKmS: number;
  /** The share of a crew km that moves the shared probe (the ceiling; 1 for a normal crew). */
  crewFactor: number;
  online: number;
  /** "+N thrusters idling": shown only when a handful are here (?crew=handful forces it, for the look). */
  idling: number | null;
  signalDeadline: number;
  /** When safe mode began, or null while the probe is talking. */
  safeSince: number | null;
  /** Today's crew vote, with live tallies. */
  vote: LiveVote;
  /** The newest mission log entry's id (the log page reloads when it changes). */
  logId: number;
}

/** This player's own state. */
export interface PlayerState {
  /** This device's generated name, e.g. orbit_otter. */
  name: string;
  /** Credits now: the server's, plus auto-thrust since its last message, plus taps not yet credited. */
  credits: number;
  levels: UpgradeLevels;
  patches: number;
  /** Prestige progress: km pushed since the last handover. */
  kmSinceShift: number;
  /** Your auto-thrust (km/s) and tap power, with the patches. */
  autoKmS: number;
  tapKm: number;
  /** A purchase or handover waiting for the server's answer. */
  buying: UpgradeKey | "prestige" | null;
  /** Km this device pushed today (UTC). */
  kmToday: number;
  /** Km from taps today; sets "your taps today got us there X sooner". */
  tapKmToday: number;
  pingedToday: boolean;
  /** True while a ping is on its way (bot check, then the server). */
  pinging: boolean;
  /** Your option in today's round, or null. */
  voteChoice: number | null;
  /** True while a vote is on its way (bot check, then the server). */
  voting: boolean;
  pingStreakDays: number;
}

/** A short message after a ping. */
export interface Toast {
  id: number;
  tier: BadgeTier | null;
  title: string;
  body: string;
}

export interface GameState {
  now: number;
  connection: Connection;
  /** False until the first word from the server (or a cached copy) arrives. */
  ready: boolean;
  probe: ProbeState;
  player: PlayerState;
  toast: Toast | null;
  /** The welcome back summary (1d), until it's closed. */
  welcome: WelcomeBack | null;
}

/** Test switches, from the URL: ?crew=handful  ?ads=off */
export interface TestSwitches {
  handful: boolean;
  ads: boolean;
}

function readSwitches(): TestSwitches {
  const q = new URLSearchParams(window.location.search);
  return {
    handful: q.get("crew") === "handful",
    ads: q.get("ads") !== "off",
  };
}

export const switches = readSwitches();

const DAY_MS = 86_400_000;
const CACHE_KEY = "osc.probe.v4";
const TOAST_MS = 7_000;
/** "+N thrusters idling" shows only when this few are here (the design's "handful"). */
const HANDFUL = 20;
/** A purchase with no answer by then is given up (the button comes back). */
const BUY_TIMEOUT_MS = 5_000;
/** Taps held while the socket is down; the server would cap anything beyond this anyway. */
const MAX_PENDING_TAPS = Math.round(MAX_TAPS_PER_S * (BATCH_MS / 1000) * 1.5);

// ---------- What the server told us ----------

let server: ProbeSnapshot | null = readCache();
let offsetMs = 0; // server clock − device clock
let serverToday: DeviceToday = { kmToday: 0, tapKmToday: 0, pingedToday: false, pingStreakDays: 0, vote: null };
let pendingTaps = 0;
const inFlight = new Map<number, number>(); // seq → taps sent, not yet credited
let me: Progress | null = null;
let meAt = 0; // server time of `me`
let buyingSeq: number | null = null;
let buyTimer: number | undefined;

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
      autoKmS: server?.autoKmS ?? 0,
      crewKmS: server?.crewKmS ?? 0,
      crewFactor: server?.crewFactor ?? 1,
      online: server?.online ?? 1,
      idling: switches.handful ? 48_206 : null,
      signalDeadline: server?.signalDeadline ?? now + SIGNAL_WINDOW_MS,
      safeSince: server?.safeSince ?? null,
      vote: server?.vote ?? { round: "", question: "Which way today?", options: [], closesAt: nextUtcMidnight(now) },
      logId: server?.logId ?? 0,
    },
    player: {
      name: "",
      credits: 0,
      levels: { cold: 0, ion: 0, sail: 0, hands: 0, chant: 0 },
      patches: 0,
      kmSinceShift: 0,
      autoKmS: 0,
      tapKm: BASE_TAP_KM,
      buying: null,
      kmToday: 0,
      tapKmToday: 0,
      pingedToday: false,
      pinging: false,
      voteChoice: null,
      voting: false,
      pingStreakDays: 0,
    },
    toast: null,
    welcome: null,
  };
}

let state: GameState = initialState();
const listeners = new Set<() => void>();
let timer: number | undefined;

function set(next: GameState) {
  state = next;
  listeners.forEach((fn) => fn());
}

/** Rebuilds the shown probe and your numbers from the server's, plus auto-thrust since and unconfirmed taps. */
function compose(base: GameState, connection = base.connection): GameState {
  const now = serverNow();
  const p = server;
  const optimisticKm = unconfirmedTaps() * (me?.tapKm ?? BASE_TAP_KM);
  // Auto-thrust pays while connected and the thrusters are awake; the server settles it exactly.
  const awake = connection === "live" && p !== null && p.safeSince === null;
  const autoSince = me && awake ? (me.autoKmS * Math.max(0, now - meAt)) / 1000 : 0;
  const idling = switches.handful ? 48_206 : p && p.online <= HANDFUL && p.idling > 0 ? p.idling : null;
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
        distanceKm: Math.min(p.routeKm, distanceAt(p, now) + optimisticKm * (p.crewFactor ?? 1)),
        coastKmS: p.coastKmS,
        autoKmS: p.autoKmS ?? 0,
        crewKmS: p.crewKmS,
        crewFactor: p.crewFactor ?? 1,
        online: p.online,
        idling,
        signalDeadline: p.signalDeadline,
        safeSince: p.safeSince,
        vote: p.vote,
        logId: p.logId,
      }),
    },
    player: {
      ...base.player,
      ...(me && {
        credits: me.credits + autoSince + optimisticKm,
        levels: me.levels,
        patches: me.patches,
        kmSinceShift: me.kmSinceShift + autoSince + optimisticKm,
        autoKmS: me.autoKmS,
        tapKm: me.tapKm,
      }),
      kmToday: serverToday.kmToday + optimisticKm,
      tapKmToday: serverToday.tapKmToday + optimisticKm,
      pingedToday: serverToday.pingedToday,
      pingStreakDays: serverToday.pingStreakDays,
      // Your vote counts only for the round it was cast in; a new round starts empty.
      voteChoice: p && serverToday.vote?.round === p.vote.round ? serverToday.vote.option : null,
    },
  };
}

function doneBuying(s: GameState): GameState {
  buyingSeq = null;
  window.clearTimeout(buyTimer);
  return s.player.buying === null ? s : { ...s, player: { ...s.player, buying: null } };
}

function onMessage(msg: ServerMessage) {
  offsetMs = msg.now - Date.now();
  let next = state;
  if (msg.t === "hello" || msg.t === "credited") {
    serverToday = {
      kmToday: msg.kmToday,
      tapKmToday: msg.tapKmToday,
      pingedToday: msg.pingedToday,
      pingStreakDays: msg.pingStreakDays,
      vote: msg.vote,
    };
  }
  if (msg.t === "hello" || msg.t === "credited" || msg.t === "me") {
    me = msg.me;
    meAt = msg.now;
  }
  if (msg.t === "hello" && msg.welcome) next = { ...next, welcome: msg.welcome };
  if (msg.t === "me" && msg.seq !== 0 && msg.seq === buyingSeq) next = doneBuying(next);
  if (msg.t === "credited") inFlight.delete(msg.seq);
  if (msg.t !== "me") server = msg.probe;
  if (msg.t === "hello" || msg.t === "state") writeCache(msg.probe);
  set(compose(next));
}

let started = false;

function startServer() {
  if (started) return;
  started = true;
  preloadTurnstile();
  startProbe({
    onMessage,
    onConnection: (c) => set(compose(state, c)),
    onName: (name) => {
      if (name !== state.player.name) set({ ...state, player: { ...state.player, name } });
    },
    onDropped: () => {
      // We can't know whether those batches were credited; drop them rather than count them twice.
      inFlight.clear();
      set(compose(doneBuying(state)));
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
  set(compose(state));
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

// --- Toasts ---

let toastId = 0;
let toastTimer: number | undefined;

function showToast(t: Omit<Toast, "id">) {
  toastId += 1;
  set({ ...state, toast: { ...t, id: toastId } });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(dismissToast, TOAST_MS);
}

export function dismissToast() {
  window.clearTimeout(toastTimer);
  if (state.toast) set({ ...state, toast: null });
}

const TIER_NAME: Record<BadgeTier, string> = { blue: "Blue", orange: "Orange", red: "Red" };

function timeLeftText(s: number): string {
  if (s < 90) return `${Math.max(1, Math.round(s))} s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// --- Actions ---

/** One tap of THRUST: shown straight away, sent in the next batch. Returns the km for the "+km" popup. */
export function thrust(): number {
  if (state.probe.safeSince !== null) return 0; // thrusters asleep
  const km = state.player.tapKm;
  if (unconfirmedTaps() < MAX_PENDING_TAPS || state.connection === "live") pendingTaps += 1;
  set(compose(state));
  return km;
}

/** Today's Ping: the invisible bot check, then the server. Shows a toast with the result. */
export async function ping() {
  if (state.player.pingedToday || state.player.pinging) return;
  const setPinging = (pinging: boolean) => set({ ...state, player: { ...state.player, pinging } });
  setPinging(true);
  let result: PingResult;
  try {
    const token = await turnstileToken();
    const res = await fetch("/api/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
    });
    result = (await res.json()) as PingResult;
  } catch {
    result = { ok: false, reason: "unavailable" };
  }
  setPinging(false);

  if (result.ok) {
    serverToday = { ...serverToday, pingedToday: true, pingStreakDays: result.pingStreakDays };
    set(compose(state));
    const tier = TIER_NAME[result.tier];
    showToast(
      result.woke
        ? {
            tier: result.tier,
            title: "You woke the probe",
            body: `${tier} signal badge. The thrusters are back on.`,
          }
        : {
            tier: result.tier,
            title: result.secondsLeft <= SIGNAL_URGENT_S ? "Saved it!" : "Signal kept alive",
            body: `${tier} signal badge · pinged with ${timeLeftText(result.secondsLeft)} left.`,
          },
    );
    return;
  }

  switch (result.reason) {
    case "already-pinged":
      serverToday = { ...serverToday, pingedToday: true };
      set(compose(state));
      showToast({ tier: null, title: "Already pinged today", body: "Your next ping is ready after midnight UTC." });
      break;
    case "just-saved":
      showToast({
        tier: null,
        title: "Someone just saved it",
        body: "Another crew member pinged a moment before you. Your ping is still yours today.",
      });
      break;
    case "bot-check":
      showToast({ tier: null, title: "Ping didn't go through", body: "The bot check failed. Please try again." });
      break;
    default:
      showToast({ tier: null, title: "Ping didn't go through", body: "We couldn't reach the probe. Please try again." });
  }
}

/** Today's vote: the invisible bot check, then the server. The tallies update for everyone. */
export async function castVote(index: number) {
  if (state.player.voteChoice !== null || state.player.voting || !server) return;
  const round = server.vote.round;
  const setVoting = (voting: boolean) => set({ ...state, player: { ...state.player, voting } });
  setVoting(true);
  let result: VoteResult;
  try {
    const token = await turnstileToken("vote");
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, round, option: index }),
      credentials: "same-origin",
    });
    result = (await res.json()) as VoteResult;
  } catch {
    result = { ok: false, reason: "unavailable" };
  }
  setVoting(false);

  if (result.ok || (result.reason === "already-voted" && result.option !== undefined)) {
    const option = result.ok ? result.option : result.option!;
    serverToday = { ...serverToday, vote: { round, option } };
    if (result.ok && server && server.vote.round === round) {
      const tallies = result.tallies;
      server = { ...server, vote: { ...server.vote, options: server.vote.options.map((o, i) => ({ ...o, votes: tallies[i] ?? o.votes })) } };
    }
    set(compose(state));
    if (!result.ok) showToast({ tier: null, title: "Already voted", body: "You've voted in today's round. A new one opens at 00:00 UTC." });
    return;
  }
  switch (result.reason) {
    case "closed":
      showToast({ tier: null, title: "That vote just closed", body: "A new round is open. Have another look." });
      break;
    case "bot-check":
      showToast({ tier: null, title: "Vote didn't go through", body: "The bot check failed. Please try again." });
      break;
    default:
      showToast({ tier: null, title: "Vote didn't go through", body: "We couldn't reach the probe. Please try again." });
  }
}

/** Asks the server for a purchase or a handover; the button waits for its answer. */
function ask(what: UpgradeKey | "prestige") {
  if (state.player.buying !== null || state.connection !== "live") return;
  const seq = request((n) => (what === "prestige" ? { t: "prestige", seq: n } : { t: "buy", key: what, seq: n }));
  if (seq === null) return;
  buyingSeq = seq;
  window.clearTimeout(buyTimer);
  buyTimer = window.setTimeout(() => set(compose(doneBuying(state))), BUY_TIMEOUT_MS);
  set({ ...state, player: { ...state.player, buying: what } });
}

/** Buys one level. The server checks the credits; a refused purchase just brings back the real balance. */
export function buyUpgrade(key: UpgradeKey) {
  if (state.player.credits < upgradeCost(key, state.player.levels[key])) return;
  ask(key);
}

/** "Hand over the shift": the server checks it's unlocked, then resets upgrades and credits for 3 patches. */
export function handOver() {
  if (state.player.kmSinceShift < PRESTIGE_AT_KM) return;
  ask("prestige");
}

export function dismissWelcome() {
  if (state.welcome) set({ ...state, welcome: null });
}

// --- Reading the state ---

export function useGame() {
  const s = useSyncExternalStore(subscribe, () => state);
  return { ...s, view: derive(s) };
}

/** Everything the screens show that is worked out from the state. */
function derive({ now, probe, player }: GameState) {
  // Coasting plus the crew's push (taps and auto-thrust, after the ceiling).
  const speedKmS = probe.coastKmS + probe.crewKmS;
  const safe = probe.safeSince !== null;
  // The current outage's setback, as extra km to fly (it becomes permanent route when someone pings).
  const setback = setbackMs(probe.safeSince, now);
  const setbackKm = (setback / 1000) * probe.coastKmS;
  const toGoKm = Math.max(0, probe.routeKm + setbackKm - probe.distanceKm);
  const signalLeftS = safe ? 0 : Math.max(0, (probe.signalDeadline - now) / 1000);
  const next = MILESTONES.find((m) => m.km > probe.distanceKm) ?? null;
  const upgrades = UPGRADES.map((def) => {
    const level = player.levels[def.key];
    const cost = upgradeCost(def.key, level);
    return { def, level, cost, affordable: player.credits >= cost };
  });
  const arrivalAt = now + (toGoKm / speedKmS) * 1000;
  return {
    missionDay: Math.floor((now - probe.missionStartedAt) / DAY_MS) + 1,
    speedKmS,
    /** Your own auto-thrust and tap power (with patches), from the server. */
    autoKmS: player.autoKmS,
    tapKm: player.tapKm,
    toGoKm,
    progress: probe.distanceKm / (probe.routeKm + setbackKm), // 0..1
    arrivalAt,
    safe,
    /** Safe mode: how long ago the signal was lost, and the arrival date before this outage. */
    quietS: safe ? Math.max(0, (now - probe.safeSince!) / 1000) : 0,
    setbackMs: setback,
    arrivalBeforeAt: arrivalAt - (setbackKm / speedKmS) * 1000,
    /** Seconds sooner thanks to your taps today (what they moved the shared probe, after the ceiling). */
    savedS: (player.tapKmToday * probe.crewFactor) / speedKmS,
    signalLeftS,
    signalUrgent: !safe && signalLeftS < SIGNAL_URGENT_S && !player.pingedToday,
    nextMilestone: next,
    toNextKm: next ? next.km - probe.distanceKm : 0,
    voteLeftS: Math.max(0, (probe.vote.closesAt - now) / 1000),
    voteTotal: probe.vote.options.reduce((sum, o) => sum + o.votes, 0),
    /** Mission day of a moment, as the log shows it. */
    missionDayAt: (at: number) => Math.floor((at - probe.missionStartedAt) / DAY_MS) + 1,
    upgrades,
    affordable: upgrades.filter((u) => u.affordable).length,
    prestigeReady: player.kmSinceShift >= PRESTIGE_AT_KM,
  };
}

export type GameView = ReturnType<typeof derive>;
