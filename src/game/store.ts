import type { CrewGoal } from "../../shared/goal";
import { burnKmAt, type BurnState } from "../../shared/burn";
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
  probeClock,
  setbackMs,
  type ArrivalInfo,
  type BadgeTier,
  type MaintenanceInfo,
  type DeviceToday,
  type PingResult,
  type ProbeSnapshot,
  type ServerMessage,
} from "../../shared/mission";
import type { AccountInfo } from "../../shared/account";
import { BADGE_INFO, type BadgeId, type EarnedBadge } from "../../shared/badges";
import { milestonesFor, type ReachedMilestone } from "../../shared/milestones";
import { MOON_LEG_KM, probeFor, probeTag, stopName } from "../../shared/campaign";
import { medalPace } from "../../shared/medals";
import { NO_TECH, creditsFor, type CrewTech } from "../../shared/tech";
import { factOfDay } from "./facts";
import type { LiveVote, VoteResult } from "../../shared/votes";
import { PRESTIGE_AT_KM, type Progress, type WelcomeBack } from "../../shared/upgrades";
import { reconnect, request, startProbe, type Connection } from "./probeClient";
import type { Hold, Standing } from "../../shared/moderation";

/** Phase A2a: nothing to show. */
const NO_STANDING: Standing = { hold: null, hidden: null, warnings: [] };
import { UPGRADES, upgradeCost, type UpgradeKey, type UpgradeLevels } from "./rules";
import { preloadTurnstile, turnstileToken } from "./turnstile";

// The game's state for the screens.
//   REAL from phase 4: the shared probe (distance, crew pace, people here, mission day, arrival date)
//                      and this device's km today, from the Probe Durable Object over a WebSocket.
//   REAL from phase 5: the signal timer, safe mode and its setback, Ping (POST /api/ping), streaks.
//   REAL from phase 6: credits, upgrades, auto-thrust, prestige patches, welcome back. The server
//                      decides every purchase; between messages credits tick up at your auto rate.
//   REAL from phase 7a: today's crew vote (POST /api/vote, live tallies) and the mission log (/log).
//   REAL from phase 7b: milestones, and the milestone moment when one is reached (shown once per browser).
//   REAL from the flight view phase and 8b: your click counts today and in all time, and your badges
//                      (a toast when you earn one).
//   RETUNE (prompts 27-28): self-balancing thrust, today's pace for the arrival date, and the idle pause
//                      ("Probe idle: tap to wake it", the date on hold); numbers in shared/balance.ts.
// Time is the server's clock: every message carries it, and `now` below is Date.now() + that offset.

export type VoteOption = LiveVote["options"][number];

/** Shared by everyone. */
export interface ProbeState {
  missionStartedAt: number; // epoch ms, server clock
  /** This leg of the Grand Tour (phase 8c): content/campaign.json ids. */
  stop: string;
  fromStop: string;
  /** When the probe reached `stop` (it's in orbit, waiting for the branch vote), or null on the way. */
  arrivedAt: number | null;
  /** The crew's planet tech from this tour's arrivals (E4b part 2a): credits and prices only. */
  tech: CrewTech;
  lastArrival: ArrivalInfo | null;
  /** The landing burn in progress (E4b part 2b), as the server last sent it, or null. */
  burn: BurnState | null;
  /** The route, including setbacks already made permanent. */
  routeKm: number;
  /** What to show: the server's distance, plus coasting and auto-thrust since, plus this device's taps not yet credited. */
  distanceKm: number;
  /** Coasting speed, or 0 while the probe is paused. */
  coastKmS: number;
  /** Everyone connected's auto-thrust as it moves the probe (it moves the probe continuously). */
  autoKmS: number;
  /** What the crew adds right now: recent taps plus auto-thrust, as they move the probe (0 in safe mode or paused). */
  crewKmS: number;
  /** How far each crew km moves the shared probe (self-balancing: above 1 for a small crew). */
  crewFactor: number;
  /** Today's pace: the probe's average speed over its last 24 hours of moving (the arrival date uses it). */
  paceKmS: number;
  /** When the probe paused for lack of players, or null while it's moving. */
  pausedSince: number | null;
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
  missionId: number;
  /** Milestones this mission has reached. */
  milestones: ReachedMilestone[];
  /** Today's crew goal (phase Q1a), or null before the server has sent it. */
  goal: CrewGoal | null;
  /** Maintenance mode (phase A1c-2): the game is frozen, with mission control's message; null normally. */
  maintenance: MaintenanceInfo | null;
}

/** This player's own state. */
export interface PlayerState {
  /** Your name: your account's when signed in, else this device's generated one, e.g. orbit_otter. */
  name: string;
  /** This device's crew number ("Keep playing as guest · Crew #48,213"). */
  crew: number;
  /** Your account (phase 8a), or null while playing as a guest. */
  account: AccountInfo | null;
  /** False until the first /api/session answer. */
  known: boolean;
  /** Email sign-in works here (phase G1: else the nudges say "Sign in with Google"). */
  emailSignIn: boolean;
  /** Phase A2a: timed out or banned, hidden from the boards, warnings to acknowledge (from /api/session). */
  standing: Standing;
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
  /** Km from taps today (your own, in full). */
  tapKmToday: number;
  /** What your taps moved the shared probe today; sets "your taps today got us there X sooner". */
  tapMovedToday: number;
  /** "You've clicked": your THRUST taps today (UTC) and in all time, from the server plus taps not yet confirmed. */
  tapsToday: number;
  tapsAll: number;
  /** Your badges (phase 8b), from the server. */
  badges: EarnedBadge[];
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
  /** A badge just earned: the toast offers to share it (phase S1). */
  badge?: BadgeId;
  /** Phase G1: a button ("Sign in") to a page. */
  action?: { label: string; href: string };
  /** Phase G1: the nudge this toast is; closing it puts that nudge away for the day. */
  nudge?: string;
}

/** A milestone moment and the leg it belongs to. */
export interface MomentState extends ReachedMilestone {
  missionId: number;
  stop: string;
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
  /**
   * A milestone moment (1e) to show: the newest milestone this browser hasn't seen yet, with the leg it was
   * reached on (the probe may have set off on the next leg since: E4b part 2a fix).
   */
  moment: MomentState | null;
  /** The arrival screen (1k) to show: the latest arrival this browser hasn't seen yet, or one reopened from the home. */
  arrival: ArrivalInfo | null;
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
let serverToday: DeviceToday = {
  kmToday: 0,
  tapKmToday: 0,
  tapMovedToday: 0,
  tapsToday: 0,
  tapsAll: 0,
  badges: [],
  pingedToday: false,
  pingStreakDays: 0,
  vote: null,
};
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
      stop: server?.stop ?? "mars",
      fromStop: server?.fromStop ?? "earth",
      arrivedAt: server?.arrivedAt ?? null,
      tech: server?.tech ?? NO_TECH,
      lastArrival: server?.lastArrival ?? null,
      burn: server?.burn ?? null,
      routeKm: server?.routeKm ?? ROUTE_KM,
      distanceKm: server ? distanceAt(server, now) : 0,
      coastKmS: server?.coastKmS ?? COAST_KM_S,
      autoKmS: server?.autoKmS ?? 0,
      crewKmS: server?.crewKmS ?? 0,
      crewFactor: server?.crewFactor ?? 1,
      paceKmS: server?.paceKmS ?? COAST_KM_S,
      pausedSince: server?.pausedSince ?? null,
      online: server?.online ?? 1,
      idling: switches.handful ? 48_206 : null,
      signalDeadline: server?.signalDeadline ?? now + SIGNAL_WINDOW_MS,
      safeSince: server?.safeSince ?? null,
      vote: server?.vote ?? { round: "", question: "Which way today?", options: [], closesAt: nextUtcMidnight(now) },
      logId: server?.logId ?? 0,
      missionId: server?.missionId ?? 0,
      milestones: server?.milestones ?? [],
      goal: server?.goal ?? null,
      maintenance: server?.maintenance ?? null,
    },
    player: {
      name: "",
      crew: 0,
      account: null,
      known: false,
      emailSignIn: false,
      standing: NO_STANDING,
      credits: 0,
      levels: { cold: 0, ion: 0, sail: 0, hands: 0, chant: 0 },
      patches: 0,
      kmSinceShift: 0,
      autoKmS: 0,
      tapKm: BASE_TAP_KM,
      buying: null,
      kmToday: 0,
      tapKmToday: 0,
      tapMovedToday: 0,
      tapsToday: 0,
      tapsAll: 0,
      badges: [],
      pingedToday: false,
      pinging: false,
      voteChoice: null,
      voting: false,
      pingStreakDays: 0,
    },
    toast: null,
    welcome: null,
    moment: null,
    arrival: null,
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
        stop: p.stop ?? "mars",
        fromStop: p.fromStop ?? "earth",
        arrivedAt: p.arrivedAt ?? null,
        tech: p.tech ?? NO_TECH,
        lastArrival: p.lastArrival ?? null,
        burn: p.burn ?? null,
        routeKm: p.routeKm,
        // During the landing burn taps fill the bar instead of moving the probe (E4b part 2b).
        distanceKm: Math.min(p.routeKm, distanceAt(p, now) + (p.burn ? 0 : optimisticKm * (p.crewFactor ?? 1))),
        coastKmS: p.coastKmS,
        autoKmS: p.autoKmS ?? 0,
        crewKmS: p.crewKmS,
        crewFactor: p.crewFactor ?? 1,
        paceKmS: p.paceKmS ?? p.coastKmS,
        pausedSince: p.pausedSince ?? null,
        online: p.online,
        idling,
        signalDeadline: p.signalDeadline,
        safeSince: p.safeSince,
        vote: p.vote,
        logId: p.logId,
        missionId: p.missionId,
        milestones: p.milestones ?? [],
        goal: p.goal ?? null,
        maintenance: p.maintenance ?? null,
      }),
    },
    player: {
      ...base.player,
      ...(me && {
        // Credits tick with the crew's planet tech, as the server pays them.
        credits: me.credits + creditsFor(autoSince, false, p?.tech ?? NO_TECH) + creditsFor(optimisticKm, true, p?.tech ?? NO_TECH),
        levels: me.levels,
        patches: me.patches,
        kmSinceShift: me.kmSinceShift + autoSince + optimisticKm,
        autoKmS: me.autoKmS,
        tapKm: me.tapKm,
      }),
      kmToday: serverToday.kmToday + optimisticKm,
      tapKmToday: serverToday.tapKmToday + optimisticKm,
      tapMovedToday: serverToday.tapMovedToday + optimisticKm * (p?.crewFactor ?? 1),
      tapsToday: serverToday.tapsToday + unconfirmedTaps(),
      tapsAll: serverToday.tapsAll + unconfirmedTaps(),
      badges: serverToday.badges,
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
  // Phase Q1a: the crew goal's bonus for a day the crew reached it, paid at 00:00 UTC (the credits come in a "me").
  if (msg.t === "bonus") {
    showToast({
      tier: null,
      title: `Crew goal bonus: +${Math.round(msg.credits).toLocaleString("en-GB")} cr`,
      body: "The crew reached the goal, so here's 10% of your km that day as credits.",
    });
    return;
  }
  if (msg.t === "badges") {
    serverToday = { ...serverToday, badges: msg.badges };
    set(compose(state));
    const names = msg.earned.map((id) => BADGE_INFO[id].name);
    if (names.length === 1)
      showToast({ tier: null, title: `Badge earned: ${names[0]}`, body: BADGE_INFO[msg.earned[0]].how + ". See it on your profile.", badge: msg.earned[0] });
    else if (names.length > 1) showToast({ tier: null, title: `${names.length} badges earned`, body: `${names.join(", ")}. See them on your profile.` });
    return;
  }
  let next = state;
  if (msg.t === "hello" || msg.t === "credited") {
    serverToday = {
      kmToday: msg.kmToday,
      tapKmToday: msg.tapKmToday,
      tapMovedToday: msg.tapMovedToday ?? 0,
      tapsToday: msg.tapsToday ?? 0,
      tapsAll: msg.tapsAll ?? 0,
      badges: msg.badges ?? [],
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
  if (msg.t !== "me") {
    // Phase Q1a: the crew just reached today's goal while you were here (the toast shows after this update).
    const was = server?.goal;
    const goal = msg.probe.goal;
    goalJustReached = msg.t !== "hello" && !!goal?.reachedAt && !!was && was.day === goal.day && !was.reachedAt;
    server = msg.probe;
    next = withArrival(withMoment(next, msg.probe), msg.probe);
  }
  if (msg.t === "hello" || msg.t === "state") writeCache(msg.probe);
  set(compose(next));
  if (goalJustReached) {
    goalJustReached = false;
    showToast({
      tier: null,
      title: "Crew goal reached!",
      body: "Everyone who pushed today gets 10% of their km today as credits at 00:00 UTC. Keep pushing: more km, more bonus.",
    });
  }
}

/** Phase Q1a: set by onMessage when a snapshot shows today's goal newly reached. */
let goalJustReached = false;

// --- Milestone moments: each browser sees each milestone once ---

const SEEN_KEY = (missionId: number) => `osc.milestoneSeen.${missionId}`;
const seenInMemory = new Map<number, number>();

function readSeen(missionId: number): number | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY(missionId));
    if (raw !== null) return Number(raw);
  } catch {
    // storage blocked: memory only
  }
  return seenInMemory.get(missionId) ?? null;
}

function writeSeen(missionId: number, n: number) {
  seenInMemory.set(missionId, n);
  try {
    localStorage.setItem(SEEN_KEY(missionId), String(n));
  } catch {
    // fine: remembered for this visit
  }
}

/** Shows the newest milestone this browser hasn't seen. A first visit to a mission starts with none owed. */
function withMoment(s: GameState, p: ProbeSnapshot): GameState {
  const reached = p.milestones ?? [];
  const top = reached.reduce<ReachedMilestone | null>((best, r) => (!best || r.n > best.n ? r : best), null);
  const seen = readSeen(p.missionId);
  if (seen === null) {
    writeSeen(p.missionId, top?.n ?? 0);
    return s;
  }
  if (top && top.n > seen && (!s.moment || s.moment.missionId !== p.missionId || s.moment.n < top.n)) {
    return { ...s, moment: { ...top, missionId: p.missionId, stop: p.stop ?? "mars" } };
  }
  return s;
}

// --- The arrival screen: each browser sees each arrival once (within a few days of it) ---

const ARRIVAL_KEY = "osc.arrivalSeen";
const ARRIVAL_SHOW_MS = 3 * DAY_MS;
let arrivalSeenInMemory = 0;

function readArrivalSeen(): number {
  try {
    return Number(localStorage.getItem(ARRIVAL_KEY) ?? 0) || arrivalSeenInMemory;
  } catch {
    return arrivalSeenInMemory;
  }
}

function withArrival(s: GameState, p: ProbeSnapshot): GameState {
  const a = p.lastArrival;
  if (!a || s.arrival || a.missionId <= readArrivalSeen()) return s;
  if (p.at - a.at > ARRIVAL_SHOW_MS) return s; // long ago: it's in the log
  return { ...s, arrival: a };
}

/** Closes the arrival screen; it won't open by itself again. */
export function dismissArrival() {
  const a = state.arrival;
  if (!a) return;
  arrivalSeenInMemory = Math.max(arrivalSeenInMemory, a.missionId);
  try {
    localStorage.setItem(ARRIVAL_KEY, String(Math.max(readArrivalSeen(), a.missionId)));
  } catch {
    // fine: remembered for this visit
  }
  set({ ...state, arrival: null });
}

/** "Watch the credits again" from the home. */
export function openArrival() {
  const a = state.probe.lastArrival;
  if (a) set({ ...state, arrival: a });
}

/** "Keep flying": this milestone (and any before it) is seen. */
export function dismissMoment() {
  const m = state.moment;
  if (!m) return;
  writeSeen(m.missionId, m.n);
  set({ ...state, moment: null });
}

let started = false;

function startServer() {
  if (started) return;
  started = true;
  preloadTurnstile();
  startProbe({
    onMessage,
    onConnection: (c) => set(compose(state, c)),
    onSession: (info) => {
      set({ ...state, player: { ...state.player, ...info, standing: info.standing ?? NO_STANDING, known: true } });
      watchHold(info.standing?.hold ?? null);
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
  // A badge toast has a Share button, so it stays a little longer; a nudge's button longer still.
  toastTimer = window.setTimeout(dismissToast, t.action ? TOAST_MS * 3 : t.badge ? TOAST_MS * 2 : TOAST_MS);
}

/** Phase G1: a nudge toast, only when no other toast is showing. Returns whether it showed. */
export function nudgeToast(t: { title: string; body: string; action: { label: string; href: string }; nudge: string }): boolean {
  if (state.toast) return false;
  showToast({ tier: null, ...t });
  return true;
}

/** A short message (e.g. "Copied"), in the same toast as Ping's results. */
export function notify(title: string, body: string) {
  showToast({ tier: null, title, body });
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
  if (state.probe.maintenance) return 0; // the game is frozen (phase A1c-2)
  if (isHeld()) return 0; // timed out or banned (phase A2a)
  const km = state.player.tapKm;
  if (unconfirmedTaps() < MAX_PENDING_TAPS || state.connection === "live") pendingTaps += 1;
  set(compose(state));
  return km;
}

/** Today's Ping: the invisible bot check, then the server. Shows a toast with the result. */
export async function ping() {
  if (state.player.pingedToday || state.player.pinging) return;
  if (frozenToast()) return;
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
    case "maintenance":
      frozenToast(true);
      break;
    case "paused":
      frozenToast(true);
      break;
    case "busy-network":
      showToast({
        tier: null,
        title: "Ping didn't go through",
        body: "Lots of pings came from your network today, so we're holding more until 00:00 UTC.",
      });
      break;
    default:
      showToast({ tier: null, title: "Ping didn't go through", body: "We couldn't reach the probe. Please try again." });
  }
}

/**
 * Maintenance mode (phase A1c-2), or this player timed out or banned (phase A2a): says so and returns true (always,
 * with `force`).
 */
function frozenToast(force = false): boolean {
  const held = isHeld();
  if (!force && !state.probe.maintenance && !held) return false;
  if (held || (force && !state.probe.maintenance)) {
    showToast({ tier: null, title: "Your account is paused", body: "Taps, pings, votes and upgrades don't count while it's paused. The note at the top says why." });
  } else showToast({ tier: null, title: "Paused for maintenance", body: "Mission control is fixing something. Pings, votes and upgrades are back soon." });
  return true;
}

/** Phase A2a: timed out or banned right now. */
export function isHeld(): boolean {
  const h = state.player.standing.hold;
  return h !== null && (h.until === null || h.until > Date.now());
}

let holdTimer: number | undefined;
/** When a time out runs out, reconnect, so the server and the screen both see it's over. */
function watchHold(hold: Hold | null) {
  window.clearTimeout(holdTimer);
  if (!hold || hold.until === null) return;
  const ms = hold.until - Date.now() + 1000;
  // setTimeout can't wait more than ~24.8 days; a time out is at most 14.
  holdTimer = window.setTimeout(() => reconnect(), Math.max(1000, Math.min(ms, 2 ** 31 - 1)));
}

/** Phase A2a: the player tapped OK on a warning. */
export async function ackWarning(id: number) {
  const standing = state.player.standing;
  set({ ...state, player: { ...state.player, standing: { ...standing, warnings: standing.warnings.filter((w) => w.id !== id) } } });
  try {
    await fetch("/api/moderation/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), credentials: "same-origin" });
  } catch {
    // it shows again next visit
  }
}

/** Today's vote: the invisible bot check, then the server. The tallies update for everyone. */
export async function castVote(index: number) {
  if (state.player.voteChoice !== null || state.player.voting || !server) return;
  if (frozenToast()) return;
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
    case "maintenance":
      frozenToast(true);
      break;
    case "paused":
      frozenToast(true);
      break;
    case "busy-network":
      showToast({
        tier: null,
        title: "Vote didn't go through",
        body: "Lots of votes came from your network today, so we're holding more until 00:00 UTC.",
      });
      break;
    default:
      showToast({ tier: null, title: "Vote didn't go through", body: "We couldn't reach the probe. Please try again." });
  }
}

/** Asks the server for a purchase or a handover; the button waits for its answer. */
function ask(what: UpgradeKey | "prestige") {
  if (state.player.buying !== null || state.connection !== "live") return;
  if (frozenToast()) return;
  const seq = request((n) => (what === "prestige" ? { t: "prestige", seq: n } : { t: "buy", key: what, seq: n }));
  if (seq === null) return;
  buyingSeq = seq;
  window.clearTimeout(buyTimer);
  buyTimer = window.setTimeout(() => set(compose(doneBuying(state))), BUY_TIMEOUT_MS);
  set({ ...state, player: { ...state.player, buying: what } });
}

/** Buys one level. The server checks the credits; a refused purchase just brings back the real balance. */
export function buyUpgrade(key: UpgradeKey) {
  if (state.player.credits < upgradeCost(key, state.player.levels[key], state.probe.tech.priceCut)) return;
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
  // Right now: coasting plus the crew's push (taps and auto-thrust, as they move the probe).
  const speedKmS = probe.coastKmS + probe.crewKmS;
  const safe = probe.safeSince !== null;
  const paused = probe.pausedSince !== null;
  // The probe's clock stands still while it's paused: the signal and any setback wait with it.
  const clock = probeClock(probe, now);
  // The current outage's setback: hours of travel at today's pace (it becomes permanent route when someone pings).
  const setback = setbackMs(probe.safeSince, clock);
  const pace = Math.max(1, probe.paceKmS);
  const toGoKm = Math.max(0, probe.routeKm - probe.distanceKm);
  const signalLeftS = safe ? 0 : Math.max(0, (probe.signalDeadline - clock) / 1000);
  const next = milestonesFor(probe.stop).find((m) => m.km > probe.distanceKm) ?? null;
  // The probe flying this leg (E2), and its names for the five upgrades (effects and prices never change).
  const flying = probeFor(probe.stop, probe.fromStop);
  const upgrades = UPGRADES.map((base) => {
    const named = flying?.upgrades?.[base.key];
    const def = named ? { ...base, name: named.name } : base;
    const level = player.levels[def.key];
    const cost = upgradeCost(def.key, level, probe.tech.priceCut); // less Vesta's planet tech (E4b)
    return { def, level, cost, affordable: player.credits >= cost, line: named?.line ?? null };
  });
  // The landing burn (E4b part 2b): the landing time is fixed, and the crew's km fill the bar.
  const b = probe.arrivedAt === null ? probe.burn : null;
  const burnKm = b ? Math.min(b.target, burnKmAt(b, now)) : 0;
  // At today's pace, plus the setback; null (on hold) while the probe is paused. During the burn, the landing time.
  const arrivalAt = b ? b.landAt : paused ? null : now + (toGoKm / pace) * 1000 + setback;
  return {
    missionDay: Math.floor((now - probe.missionStartedAt) / DAY_MS) + 1,
    speedKmS,
    /** Your own auto-thrust and tap power (with patches), from the server. */
    autoKmS: player.autoKmS,
    tapKm: player.tapKm,
    toGoKm,
    progress: probe.distanceKm / probe.routeKm, // 0..1
    arrivalAt,
    safe,
    /** The probe is waiting for a tap (decision 5). */
    paused,
    /** In orbit at this leg's stop, waiting for the branch vote (phase 8c). */
    orbit: probe.arrivedAt !== null,
    /** The probe flying this leg (E2): its id ("ceres-hopper"), full name and tag ("OSC-2"). */
    probeId: flying?.id ?? "pathfinder",
    probeName: flying?.name ?? "OSC-1 Pathfinder",
    probeTag: probeTag(flying),
    /** A leg under 10M km (the moons): the speed reads in km/h. */
    moonLeg: probe.routeKm < MOON_LEG_KM,
    /** This leg's destination and start, by name. */
    destName: stopName(probe.stop),
    fromName: stopName(probe.fromStop),
    /** Safe mode: how long ago the signal was lost, and the arrival date before this outage. */
    quietS: safe ? Math.max(0, (now - probe.safeSince!) / 1000) : 0,
    setbackMs: setback,
    arrivalBeforeAt: arrivalAt === null ? null : arrivalAt - setback,
    /** The medal we're on pace for (E4b part 1); null while paused or in orbit, when there's no estimate to judge. */
    pace: arrivalAt === null || probe.arrivedAt !== null ? null : medalPace(probe.missionStartedAt, arrivalAt),
    /** Today's Destination file fact, or null on a leg whose stop has no facts yet. */
    fact: factOfDay(probe.stop, probe.missionStartedAt, now),
    /** Seconds to the next fact (midnight UTC). */
    factLeftS: Math.max(0, (nextUtcMidnight(now) - now) / 1000),
    /** Seconds sooner thanks to your taps today: what they moved the shared probe, at today's pace. */
    savedS: player.tapMovedToday / pace,
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
    /** The landing burn in progress: seconds to landing, the crew's km (capped at the target), and how full the bar is. */
    burn: b
      ? { leftS: Math.max(0, (b.landAt - now) / 1000), km: burnKm, target: b.target, share: burnKm / b.target, filled: burnKm >= b.target, landAt: b.landAt }
      : null,
  };
}

export type GameView = ReturnType<typeof derive>;
