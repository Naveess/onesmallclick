import { DurableObject } from "cloudflare:workers";
import {
  BATCH_MS,
  COAST_KM_S,
  CREW_WINDOW_MIN,
  DEAD_SOCKET_MS,
  LAST_SEEN_EVERY_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  IDLE_PAUSE_MS,
  MAX_TAPS_PER_S,
  PACE_WINDOW_MIN,
  ROUTE_KM,
  SIGNAL_URGENT_S,
  SIGNAL_WINDOW_MS,
  arrivalAt,
  distanceAt,
  probeClock,
  setbackMs,
  tierFor,
  utcDay,
  type AdminState,
  type ClientMessage,
  type DeviceToday,
  type PingResult,
  type ProbeSnapshot,
  type ServerMessage,
  type ArrivalInfo,
} from "../shared/mission";
import { CREW_HALF_KM_S, CREW_TOP_KM_S, TODAY_PACE_MIN_MS, TODAY_PACE_MS } from "../shared/balance";
import {
  BRANCH_PREFIX,
  FIRST_STOP,
  START_STOP,
  branchStopId,
  legKm,
  nextStop,
  probeFor,
  stop as campaignStop,
  stopName,
} from "../shared/campaign";
import {
  MAX_LEVEL,
  OFFLINE_CAP_MS,
  PATCHES_PER_SHIFT,
  PRESTIGE_AT_KM,
  UPGRADE_KEYS,
  WELCOME_MIN_AWAY_MS,
  autoKmS,
  tapKm,
  upgradeCost,
  type Progress,
  type UpgradeKey,
  type UpgradeLevels,
  type WelcomeBack,
} from "../shared/upgrades";
import { milestonesFor, type ReachedMilestone } from "../shared/milestones";
import { medalFor, type Medal } from "../shared/medals";
import { NO_TECH, creditsFor, crewTech, offlineCapMs, type CrewTech } from "../shared/tech";
import { CLICK_BADGES } from "../shared/clicks";
import { RECRUIT_TAPS, RECRUITS_PER_DAY } from "../shared/share";
import {
  CLICK_BADGE_IDS,
  KEEPER_DAYS,
  KEEPER_IDS,
  NIGHT_SHIFT_FROM_HOUR,
  NIGHT_SHIFT_TO_HOUR,
  RECRUITER_IDS,
  VOTER_ROUNDS,
  longestStreak,
  recruiterLevel,
  type BadgeId,
  type EarnedBadge,
} from "../shared/badges";
import { betaOpen } from "../shared/beta";
import { BURN_MS, BURN_TAP_MULTIPLIER, BURN_TARGET_KM, burnKmAt, spareText, type BurnResult, type BurnState } from "../shared/burn";
import {
  VOTE_QUESTION,
  VOTE_RECENT_ROUNDS,
  pickOptions,
  shortLabel,
  voteOption,
  winnerIndex,
  type LiveVote,
  type VoteResult,
} from "../shared/votes";

// The one shared probe. Every browser holds a WebSocket to this object (hibernation API, so an
// idle crew costs almost nothing). It:
//   - credits batched taps at each device's own tap power, capped per device (a token bucket);
//   - keeps the distance as "km at time `at`" and lets coasting plus connected auto-thrust run on the clock;
//   - keeps everyone's idle game (credits, upgrades, patches) and decides every purchase;
//   - pays auto-thrust while connected, and up to 8 hours of it when a device comes back;
//   - balances the crew's push on the shared probe: a small crew is boosted, a big one squeezed (shared/balance.ts);
//   - pauses the probe after 8 hours with no tap batch and no connected auto-thrust (an alarm), until a tap wakes it;
//   - keeps today's pace (the average speed over the last 24 hours of moving) for the arrival date;
//   - keeps the signal: a deadline, an alarm when it runs out, safe mode until someone pings;
//   - notices milestones (also on an alarm, when nobody's around), records and logs them;
//   - runs the daily crew vote: live tallies, closing at 00:00 UTC (the same alarm), the winner's effect on the route;
//   - sends an update to everyone when something changes, at most once a second (no ticking timer);
//   - saves the probe to its own SQLite at most every 5 s (the signal and purchases straight away),
//     everyone's progress and the km waiting for D1 every 60 s, and daily km and progress to D1 every 5 minutes
//     (phase 9a: storage is billed by rows written; see docs/load-test.md, "Storage").
// All times are the server's clock plus the /admin clock offset.

const SAVE_MS = 5_000;
/** Players' progress and the D1 queue: a probe restart (a deploy, a crash) loses at most this much of them. */
const PROGRESS_SAVE_MS = 60_000;
/** How often km, taps and progress go to D1 (the leaderboards' "today" lags up to this). */
const D1_FLUSH_MS = 300_000;
const BROADCAST_MS = 1_000;
/**
 * How long the list of who's online is kept between tap batches (phase 9a, load test). Every batch needs it several
 * times, and rebuilding it reads every socket's attachment, so with N players that was N×N work a second.
 * Sockets opening, closing and buying clear it at once; only silent sockets (DEAD_SOCKET_MS, 90 s) wait for it.
 */
const ONLINE_CACHE_MS = 5_000;
/** A socket's `seen` time is rewritten at most this often (it only has to beat DEAD_SOCKET_MS). */
const SEEN_EVERY_MS = 15_000;
/** A device may bank this many taps: a full batch plus some network jitter. */
const TAP_BUCKET = MAX_TAPS_PER_S * (BATCH_MS / 1000) * 1.5;
/** Most taps a single message may claim; anything above is ignored as malformed. */
const MAX_TAPS_PER_MESSAGE = 1_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** A second ping this soon after another is told "just saved" and keeps its daily ping. */
const JUST_SAVED_MS = 5_000;
/** "+N thrusters idling" is counted at most this often. */
const IDLING_MS = 60_000;
/** Today's pace is measured from samples of (distance, moving time) at most this far apart. */
const TRACK_EVERY_MS = 10 * MINUTE_MS;

interface Mission {
  id: number;
  destination: string;
  /** This leg of the Grand Tour (phase 8c): its destination and start (content/campaign.json ids). */
  stop: string;
  fromStop: string;
  /** The leg's length before setbacks and votes. Coasting and the crew's top speed scale with it. */
  legKm: number;
  /** The crew balance for this leg (CREW_HALF_KM_S, recalibrated at each launch). */
  crewHalf: number;
  /** When the probe reached `stop` (it waits in orbit for the branch vote), or null on the way. */
  arrivedAt: number | null;
  /** Grows with each safe-mode setback (decision: the probe drifted off course). */
  routeKm: number;
  startedAt: number;
  distanceKm: number;
  at: number;
  /** Connected auto-thrust as it moves the probe (self-balanced), since `at`. */
  autoKmS: number;
  /** Time the probe has spent moving this mission, up to `at` (paused time doesn't count). */
  movedMs: number;
  /** The last tap batch, or the last moment auto-thrust was connected. */
  lastActiveAt: number;
  /** When the probe paused for lack of players, or null while it's moving (decision 5). */
  pausedSince: number | null;
  signalDeadline: number;
  safeSince: number | null;
  /** The last outage that ended, so auto-thrust isn't paid for it. */
  lastSafeFrom: number | null;
  lastSafeTo: number | null;
}

/** A player's numbers for today (km, ping, vote), their tap allowance, and what their badges need. */
interface DeviceEntry extends Omit<DeviceToday, "vote" | "badges"> {
  /** The badges they have, and when each was earned. */
  badges: Map<BadgeId, number>;
  /** Rounds voted in, ever (Voter ×30). */
  votesTotal: number;
  /** The longest ping streak they've ever had (Signal Keeper). */
  bestStreak: number;
  /** They pushed in this mission before the probe passed halfway (Halfway Crew). */
  pushedBeforeHalfway: boolean;
  /** Their recruits (phase S2): new players who came through their crew link and played (Crew Recruiter). */
  recruits: number;
  day: string;
  /** This device's vote: the round it was read for, and its option (null = not voted). */
  voteRound: string | null;
  voteOption: number | null;
  /** The last UTC day this device pinged, for the streak. */
  lastPingDay: string | null;
  tokens: number;
  refilledAt: number; // real ms, so /admin clock jumps don't refill the bucket
}

/** A device's idle game. Credits are thousandths, as whole numbers, so they never drift. */
interface ProgressEntry {
  creditsMilli: number;
  levels: UpgradeLevels;
  patches: number;
  kmSinceShift: number;
  /** Auto-thrust has been paid up to this time. While away, it's when the device left. */
  settledAt: number;
  /** Where the probe was, and its coasting-only arrival, when the device left (for welcome back). */
  lastDistance: number | null;
  lastArrivalAt: number | null;
  lastMissionId: number | null;
}

interface Attachment {
  deviceId: string;
  /** The account this socket is signed in to (phase 8a), or null for a guest. */
  accountId?: string | null;
  /** This device's raw auto-thrust (km/s), so the crew total survives hibernation. */
  auto: number;
  /** Real ms: when the socket opened, and its last message (heartbeats are tracked by the runtime). */
  since: number;
  seen?: number;
  /** The player's time zone, from Cloudflare's location for the connection (Night Shift). */
  tz?: string | null;
}

/**
 * Who's playing: this device, and its account when signed in. Progress, today's numbers, pings
 * and votes are kept under `key`: the account (`a:<id>`) when signed in, else the device.
 */
interface Who {
  deviceId: string;
  accountId: string | null;
  key: string;
}

function who(deviceId: string, accountId: string | null): Who {
  return { deviceId, accountId, key: accountId ? `a:${accountId}` : deviceId };
}

function whoOf(a: Attachment): Who {
  return who(a.deviceId, a.accountId ?? null);
}

/** The open vote round. */
interface VoteRound {
  round: string;
  openedAt: number;
  closesAt: number;
  ids: string[];
  tallies: number[];
}

type VoteRow = { round: string; opened_at: number; closes_at: number; options: string; tallies: string };

const gb = new Intl.NumberFormat("en-GB");

/** Time away, as settled when a device comes back. */
interface Away {
  from: number;
  awayMs: number;
  countedMs: number;
  km: number;
}

type MissionRow = {
  id: number;
  destination: string;
  route_km: number;
  started_at: number;
  distance_km: number;
  at: number;
  signal_deadline: number | null;
  safe_since: number | null;
  auto_kms: number | null;
  last_safe_from: number | null;
  last_safe_to: number | null;
  moved_ms: number | null;
  last_active_at: number | null;
  paused_since: number | null;
  stop: string | null;
  from_stop: string | null;
  leg_km: number | null;
  crew_half: number | null;
  arrived_at: number | null;
};

/** One sample of the probe's track, for today's pace. */
interface TrackPoint {
  at: number;
  distanceKm: number;
  movedMs: number;
}

/** A row of d1_queue: km waiting for the next D1 flush (phase 9a). */
type QueueRow = {
  key: string;
  day: string;
  device_id: string;
  account_id: string | null;
  km: number;
  tap_km: number;
  tap_moved_km: number;
  taps: number;
};

type ProgressRow = {
  device_id: string;
  credits_milli: number;
  cold: number;
  ion: number;
  sail: number;
  hands: number;
  chant: number;
  patches: number;
  km_since_shift: number;
  settled_at: number;
  last_distance: number | null;
  last_arrival_at: number | null;
  last_mission_id: number | null;
};

const zeroLevels = (): UpgradeLevels => ({ cold: 0, ion: 0, sail: 0, hands: 0, chant: 0 });

export class Probe extends DurableObject<Env> {
  private sql: SqlStorage;
  private mission!: Mission;
  private clockOffsetMs = 0;
  /** Raw tap km per minute (key: minute number): the crew pace, and the crew push that's balanced. */
  private pace = new Map<number, number>();
  /** Raw offline catch-up km per minute: counted in the crew push only, so one return doesn't swing the pace shown. */
  private catchup = new Map<number, number>();
  private dirtyMinutes = new Set<number>();
  /** Today's numbers per player (key: Who.key). */
  private devices = new Map<string, DeviceEntry>();
  private loadingDevices = new Map<string, Promise<DeviceEntry>>();
  private progress = new Map<string, ProgressEntry>();
  /** Progress to write to this object's SQLite at the next save, and to D1 at the next flush. */
  private dirtyProgress = new Set<string>();
  private d1Progress = new Set<string>();
  /** Km to add to D1's daily_km at the next flush (key: day|deviceId), with the account they count for. Kept in the d1_queue table too (see saveProgress). */
  private d1Pending = new Map<
    string,
    { day: string; deviceId: string; accountId: string | null; km: number; tapKm: number; tapMovedKm: number; taps: number }
  >();
  /** Samples of the probe's track this mission, oldest first (today's pace). */
  private track: TrackPoint[] = [];
  /** Real time of the last accepted ping (see JUST_SAVED_MS). */
  private lastPingAt = 0;
  private idling = { n: 0, at: 0 };
  private vote!: VoteRound;
  /** Set while a round is being closed, so two callers can't close it twice. */
  private closingVote: Promise<void> | null = null;
  /** An arrival is being handled (crediting the crew awaits D1). */
  private arriving = false;
  /** The latest arrival this tour (kept in meta; the launch reset clears it). */
  private lastArrival: ArrivalInfo | null = null;
  /** The landing burn in progress (E4b part 2b), with where the probe was when it started; null otherwise. */
  private burn: (BurnState & { startKm: number }) | null = null;
  /** The crew's planet tech from every leg arrived at this tour (E4b part 2a; shared/tech.ts). */
  private tech: CrewTech = NO_TECH;
  private lastLogId = 0;
  /** Milestones the current mission has reached. */
  private reached: ReachedMilestone[] = [];
  /** The alarm time last set (real ms), so it's only rewritten when it changes. */
  private alarmAt = 0;
  /** Sockets found silent (see DEAD_SOCKET_MS), being closed. */
  private dead = new WeakSet<WebSocket>();
  /** onlineDevices() and its auto-thrust total, kept for ONLINE_CACHE_MS; null when a socket opened, closed or changed. */
  private online: { at: number; ids: Map<string, number>; auto: number } | null = null;

  /** d1Pending keys changed since they were last written to d1_queue. */
  private dirtyQueue = new Set<string>();
  /** The D1 flush in flight, so two never send the same km. */
  private flushing: Promise<void> | null = null;
  /** The clock offset last written to meta (it only changes from /admin). */
  private savedOffset: number | null = null;

  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private progressTimer: ReturnType<typeof setTimeout> | undefined;
  private d1Timer: ReturnType<typeof setTimeout> | undefined;
  private broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  private lastBroadcastAt = 0;
  private lastSavedAt = 0;
  private lastD1FlushAt = 0;
  /** Rows written since this object started (real ms): its own SQLite, and D1 by the 30 s flush. */
  private rows = { since: Date.now(), sqlite: 0, d1: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Every statement's rows written are counted (phase 9a): they're what storage is billed by, shown in /admin.
    const raw = ctx.storage.sql;
    this.sql = {
      exec: (query: string, ...bindings: SqlStorageValue[]) => {
        const cursor = raw.exec(query, ...bindings);
        this.rows.sqlite += cursor.rowsWritten;
        return cursor;
      },
      get databaseSize() {
        return raw.databaseSize;
      },
    } as SqlStorage;
    // Heartbeats are answered by the runtime, so they don't wake this object or count as requests.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG));
    ctx.blockConcurrencyWhile(() => this.load());
  }

  // ---------- Loading and saving ----------

  private async load() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mission (
      id INTEGER PRIMARY KEY, destination TEXT NOT NULL, route_km REAL NOT NULL,
      started_at INTEGER NOT NULL, distance_km REAL NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pace (minute INTEGER PRIMARY KEY, km REAL NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value REAL NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS track (
      mission_id INTEGER NOT NULL, at INTEGER NOT NULL, distance_km REAL NOT NULL, moved_ms REAL NOT NULL,
      PRIMARY KEY (mission_id, at))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS progress (
      device_id TEXT PRIMARY KEY, credits_milli INTEGER NOT NULL,
      cold INTEGER NOT NULL, ion INTEGER NOT NULL, sail INTEGER NOT NULL, hands INTEGER NOT NULL, chant INTEGER NOT NULL,
      patches INTEGER NOT NULL, km_since_shift REAL NOT NULL, settled_at INTEGER NOT NULL, auto_kms REAL NOT NULL,
      last_distance REAL, last_arrival_at INTEGER, last_mission_id INTEGER)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS progress_by_settled ON progress (settled_at)`);
    // Km, taps and moved km credited but not yet in D1 (phase 9a), so a restart doesn't lose 5 minutes of them.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS d1_queue (
      key TEXT PRIMARY KEY, day TEXT NOT NULL, device_id TEXT NOT NULL, account_id TEXT,
      km REAL NOT NULL, tap_km REAL NOT NULL, tap_moved_km REAL NOT NULL, taps INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS milestone_reached (
      mission_id INTEGER NOT NULL, n INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (mission_id, n))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS vote_round (
      round TEXT PRIMARY KEY, opened_at INTEGER NOT NULL, closes_at INTEGER NOT NULL,
      options TEXT NOT NULL, tallies TEXT NOT NULL, winner INTEGER, closed_at INTEGER)`);
    // Columns added after phase 4 (older tables don't have them).
    const cols = new Set(this.sql.exec<{ name: string }>(`PRAGMA table_info(mission)`).toArray().map((c) => c.name));
    for (const [col, type] of [
      ["signal_deadline", "INTEGER"],
      ["safe_since", "INTEGER"],
      ["auto_kms", "REAL"],
      ["last_safe_from", "INTEGER"],
      ["last_safe_to", "INTEGER"],
      ["moved_ms", "REAL"],
      ["last_active_at", "INTEGER"],
      ["paused_since", "INTEGER"],
      ["stop", "TEXT"],
      ["from_stop", "TEXT"],
      ["leg_km", "REAL"],
      ["crew_half", "REAL"],
      ["arrived_at", "INTEGER"],
      ["medal", "TEXT"],
      // The landing burn (E4b part 2b).
      ["burn_started_at", "INTEGER"],
      ["burn_land_at", "INTEGER"],
      ["burn_start_km", "REAL"],
      ["burn_target", "REAL"],
      ["burn_km", "REAL"],
      ["burn_at", "INTEGER"],
      ["burn_filled_at", "INTEGER"],
      ["burn_ok", "INTEGER"],
    ]) {
      if (!cols.has(col)) this.sql.exec(`ALTER TABLE mission ADD COLUMN ${col} ${type}`);
    }
    // Legs that arrived before E4b part 2a: their medal from the days they took (like migration 0014).
    for (const r of this.sql
      .exec<{ id: number; started_at: number; arrived_at: number }>(
        `SELECT id, started_at, arrived_at FROM mission WHERE arrived_at IS NOT NULL AND medal IS NULL`,
      )
      .toArray()) {
      this.sql.exec(`UPDATE mission SET medal = ? WHERE id = ?`, medalFor((r.arrived_at - r.started_at) / DAY_MS), r.id);
    }
    this.loadTech();

    const lastId = this.sql.exec<{ value: number }>(`SELECT value FROM meta WHERE key = 'last_arrival_mission'`).toArray()[0]?.value;
    if (lastId !== undefined) {
      const r = this.sql
        .exec<{ id: number; stop: string | null; from_stop: string | null; arrived_at: number | null }>(`SELECT id, stop, from_stop, arrived_at FROM mission WHERE id = ?`, lastId)
        .toArray()[0];
      if (r?.arrived_at) this.lastArrival = { missionId: r.id, stop: r.stop ?? FIRST_STOP, fromStop: r.from_stop ?? START_STOP, at: r.arrived_at, burn: this.burnResultOf(r.id) };
    }
    const offset = this.sql.exec<{ value: number }>(`SELECT value FROM meta WHERE key = 'clock_offset_ms'`).toArray()[0];
    this.clockOffsetMs = offset?.value ?? 0;
    this.savedOffset = offset ? offset.value : null;
    for (const q of this.sql.exec<QueueRow>(`SELECT * FROM d1_queue`)) {
      this.d1Pending.set(q.key, {
        day: q.day,
        deviceId: q.device_id,
        accountId: q.account_id,
        km: q.km,
        tapKm: q.tap_km,
        tapMovedKm: q.tap_moved_km,
        taps: q.taps,
      });
    }
    if (this.d1Pending.size > 0) this.scheduleD1Flush();

    const row = this.sql.exec<MissionRow>(`SELECT * FROM mission ORDER BY id DESC LIMIT 1`).toArray()[0];
    if (row) {
      this.mission = {
        id: row.id,
        destination: row.destination,
        routeKm: row.route_km,
        startedAt: row.started_at,
        distanceKm: row.distance_km,
        at: row.at,
        autoKmS: row.auto_kms ?? 0,
        signalDeadline: row.signal_deadline ?? this.now() + SIGNAL_WINDOW_MS,
        safeSince: row.safe_since,
        lastSafeFrom: row.last_safe_from,
        lastSafeTo: row.last_safe_to,
        // Missions from before the retune: count all their time as moving, and active now.
        movedMs: row.moved_ms ?? Math.max(0, row.at - row.started_at),
        lastActiveAt: row.last_active_at ?? this.now(),
        pausedSince: row.paused_since,
        // Missions from before 8c were all Earth → Mars.
        stop: row.stop ?? FIRST_STOP,
        fromStop: row.from_stop ?? START_STOP,
        legKm: row.leg_km ?? ROUTE_KM,
        crewHalf: row.crew_half ?? CREW_HALF_KM_S,
        arrivedAt: row.arrived_at,
      };
      if (row.signal_deadline === null || row.moved_ms === null) this.saveSignal();
    } else {
      await this.startMission(1);
    }
    // A landing burn in progress survives a restart (its auto-thrust is re-counted as players reconnect).
    const br = this.sql
      .exec<{
        burn_started_at: number | null;
        burn_land_at: number | null;
        burn_start_km: number | null;
        burn_target: number | null;
        burn_km: number | null;
        burn_at: number | null;
        burn_filled_at: number | null;
      }>(`SELECT burn_started_at, burn_land_at, burn_start_km, burn_target, burn_km, burn_at, burn_filled_at FROM mission WHERE id = ?`, this.mission.id)
      .toArray()[0];
    if (br?.burn_started_at != null && br.burn_land_at != null && this.mission.arrivedAt === null) {
      this.burn = {
        startedAt: br.burn_started_at,
        landAt: br.burn_land_at,
        startKm: br.burn_start_km ?? 0,
        target: br.burn_target ?? BURN_TARGET_KM,
        km: br.burn_km ?? 0,
        at: br.burn_at ?? br.burn_started_at,
        autoKmS: 0,
        filledAt: br.burn_filled_at,
      };
    }

    this.reached = this.sql
      .exec<{ n: number; at: number }>(`SELECT n, at FROM milestone_reached WHERE mission_id = ? ORDER BY n`, this.mission.id)
      .toArray()
      .map((r) => ({ n: r.n, at: r.at }));
    this.track = this.sql
      .exec<{ at: number; distance_km: number; moved_ms: number }>(
        `SELECT at, distance_km, moved_ms FROM track WHERE mission_id = ? ORDER BY moved_ms`,
        this.mission.id,
      )
      .toArray()
      .map((r) => ({ at: r.at, distanceKm: r.distance_km, movedMs: r.moved_ms }));
    if (this.track.length === 0) this.sample(true);

    const since = Math.floor(this.now() / MINUTE_MS) - 60;
    for (const p of this.sql.exec<{ minute: number; km: number }>(`SELECT minute, km FROM pace WHERE minute > ?`, since)) {
      this.pace.set(p.minute, p.km);
    }

    const v = this.sql
      .exec<VoteRow>(`SELECT * FROM vote_round WHERE closed_at IS NULL ORDER BY rowid DESC LIMIT 1`)
      .toArray()[0];
    if (v) {
      this.vote = {
        round: v.round,
        openedAt: v.opened_at,
        closesAt: v.closes_at,
        ids: JSON.parse(v.options),
        tallies: JSON.parse(v.tallies),
      };
    } else {
      await this.openVote(this.now());
    }
    try {
      const r = await this.env.DB.prepare(`SELECT MAX(id) AS id FROM log_entries`).first<{ id: number | null }>();
      this.lastLogId = r?.id ?? 0;
    } catch (err) {
      console.error("log id read failed", err);
    }
    await this.scheduleAlarm();
  }

  /** A new leg: Earth → Mars unless told otherwise (the launch reset, or a fresh object). */
  private async startMission(
    id: number,
    leg: { stop: string; fromStop: string; legKm: number; crewHalf: number } = {
      stop: FIRST_STOP,
      fromStop: START_STOP,
      legKm: ROUTE_KM,
      crewHalf: CREW_HALF_KM_S,
    },
  ) {
    const now = this.now();
    this.mission = {
      id,
      destination: stopName(leg.stop),
      ...leg,
      arrivedAt: null,
      routeKm: leg.legKm,
      startedAt: now,
      distanceKm: 0,
      at: now,
      autoKmS: 0,
      movedMs: 0,
      lastActiveAt: now,
      pausedSince: null,
      signalDeadline: now + SIGNAL_WINDOW_MS,
      safeSince: null,
      lastSafeFrom: null,
      lastSafeTo: null,
    };
    this.reached = [];
    this.burn = null;
    this.track = [];
    this.sql.exec(`DELETE FROM track`);
    this.sample(true);
    const m = this.mission;
    this.sql.exec(
      `INSERT OR REPLACE INTO mission (id, destination, route_km, started_at, distance_km, at, signal_deadline, safe_since, auto_kms,
         moved_ms, last_active_at, paused_since, stop, from_stop, leg_km, crew_half, arrived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, ?, ?, NULL)`,
      m.id,
      m.destination,
      m.routeKm,
      now,
      0,
      now,
      m.signalDeadline,
      null,
      0,
      now,
      m.stop,
      m.fromStop,
      m.legKm,
      m.crewHalf,
    );
    try {
      await this.env.DB.prepare(
        `INSERT INTO missions (id, destination, route_km, started_at, stop, from_stop, leg_km, crew_half)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET destination = excluded.destination, route_km = excluded.route_km,
           started_at = excluded.started_at, arrived_at = NULL, stop = excluded.stop, from_stop = excluded.from_stop,
           leg_km = excluded.leg_km, crew_half = excluded.crew_half, crew_count = NULL, taps = NULL, branch = NULL`,
      )
        .bind(id, m.destination, m.routeKm, now, m.stop, m.fromStop, m.legKm, m.crewHalf)
        .run();
    } catch (err) {
      console.error("missions insert failed", err);
    }
  }

  /** Writes the distance, pace and clock offset to this object's SQLite (players' progress: saveProgress). */
  private save() {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.dirty) return;
    const m = this.mission;
    this.sql.exec(
      `UPDATE mission SET distance_km = ?, at = ?, auto_kms = ?, moved_ms = ?, last_active_at = ? WHERE id = ?`,
      m.distanceKm,
      m.at,
      m.autoKmS,
      m.movedMs,
      m.lastActiveAt,
      m.id,
    );
    this.sample();
    for (const minute of this.dirtyMinutes) {
      this.sql.exec(
        `INSERT INTO pace (minute, km) VALUES (?, ?) ON CONFLICT (minute) DO UPDATE SET km = excluded.km`,
        minute,
        this.pace.get(minute) ?? 0,
      );
    }
    this.dirtyMinutes.clear();
    this.saveBurn();
    const old = Math.floor(this.now() / MINUTE_MS) - 60;
    this.sql.exec(`DELETE FROM pace WHERE minute <= ?`, old);
    for (const minute of this.pace.keys()) if (minute <= old) this.pace.delete(minute);
    for (const minute of this.catchup.keys()) if (minute <= old) this.catchup.delete(minute);
    this.saveOffset();
    this.dirty = false;
    this.lastSavedAt = Date.now();
  }

  /** The /admin clock offset, only when it changed. */
  private saveOffset() {
    if (this.savedOffset === this.clockOffsetMs) return;
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES ('clock_offset_ms', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      this.clockOffsetMs,
    );
    this.savedOffset = this.clockOffsetMs;
  }

  /** Writes changed players' progress and the D1 queue to this object's SQLite (every 60 s: PROGRESS_SAVE_MS). */
  private saveProgress() {
    if (this.progressTimer !== undefined) clearTimeout(this.progressTimer);
    this.progressTimer = undefined;
    for (const id of this.dirtyProgress) this.writeProgress(id);
    this.dirtyProgress.clear();
    for (const key of this.dirtyQueue) this.writeQueue(key);
    this.dirtyQueue.clear();
  }

  private scheduleProgressSave() {
    // Like the save timer, a pending timer keeps the object from hibernating before this is written.
    this.progressTimer ??= setTimeout(() => this.saveProgress(), PROGRESS_SAVE_MS);
  }

  /** One D1 queue entry, as it is in memory now (deleted once D1 has it all). */
  private writeQueue(key: string) {
    const p = this.d1Pending.get(key);
    if (!p) {
      this.sql.exec(`DELETE FROM d1_queue WHERE key = ?`, key);
      return;
    }
    this.sql.exec(
      `INSERT INTO d1_queue (key, day, device_id, account_id, km, tap_km, tap_moved_km, taps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET account_id = excluded.account_id, km = excluded.km, tap_km = excluded.tap_km,
         tap_moved_km = excluded.tap_moved_km, taps = excluded.taps`,
      key,
      p.day,
      p.deviceId,
      p.accountId,
      p.km,
      p.tapKm,
      p.tapMovedKm,
      p.taps,
    );
  }

  /** The signal, the route and the distance are saved straight away: they change rarely and matter. */
  private saveSignal() {
    const m = this.mission;
    this.sql.exec(
      `UPDATE mission SET route_km = ?, distance_km = ?, at = ?, auto_kms = ?, signal_deadline = ?, safe_since = ?,
         last_safe_from = ?, last_safe_to = ?, moved_ms = ?, last_active_at = ?, paused_since = ?, arrived_at = ? WHERE id = ?`,
      m.routeKm,
      m.distanceKm,
      m.at,
      m.autoKmS,
      m.signalDeadline,
      m.safeSince,
      m.lastSafeFrom,
      m.lastSafeTo,
      m.movedMs,
      m.lastActiveAt,
      m.pausedSince,
      m.arrivedAt,
      m.id,
    );
    this.saveOffset();
  }

  private scheduleSave() {
    this.dirty = true;
    // A pending timer also keeps the object from hibernating before its memory is saved.
    this.saveTimer ??= setTimeout(() => this.save(), SAVE_MS);
  }

  /** Adds the batched km to D1 (daily_km), copies changed progress there, and marks the devices as seen (at most hourly). */
  private async flushD1() {
    if (this.d1Timer !== undefined) clearTimeout(this.d1Timer);
    this.d1Timer = undefined;
    while (this.flushing) await this.flushing; // then send whatever came in meanwhile
    if (this.d1Pending.size === 0 && this.d1Progress.size === 0) return;
    const run = this.sendD1();
    this.flushing = run;
    try {
      await run;
    } finally {
      if (this.flushing === run) this.flushing = null;
    }
  }

  private async sendD1() {
    // Touching this object's storage first makes an out-of-date copy of the probe (one Cloudflare has already replaced)
    // throw here instead of sending km the new copy will also send from d1_queue.
    this.sql.exec(`SELECT 1 FROM meta LIMIT 1`).toArray();
    // What's sent is copied: km credited while D1 answers stay queued, and only what D1 took is taken off.
    const sent = [...this.d1Pending.entries()].map(([key, p]) => [key, { ...p }] as const);
    const progressIds = [...this.d1Progress];
    this.d1Progress.clear();
    const seen = Date.now();
    const db = this.env.DB;
    const statements = sent.flatMap(([, p]) => [
      db
        .prepare(
          `INSERT INTO daily_km (day, device_id, km, tap_km, tap_moved_km, taps, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (day, device_id) DO UPDATE SET km = km + excluded.km, tap_km = tap_km + excluded.tap_km,
             tap_moved_km = tap_moved_km + excluded.tap_moved_km, taps = taps + excluded.taps,
             account_id = COALESCE(excluded.account_id, daily_km.account_id)`,
        )
        .bind(p.day, p.deviceId, p.km, p.tapKm, p.tapMovedKm, p.taps, p.accountId),
      // An unchanged row isn't a row written, so this costs one write an hour per device.
      db.prepare(`UPDATE devices SET last_seen = ? WHERE id = ? AND last_seen < ?`).bind(seen, p.deviceId, seen - LAST_SEEN_EVERY_MS),
    ]);
    for (const id of progressIds) {
      const p = this.progress.get(id);
      if (!p) continue;
      statements.push(
        db
          .prepare(
            `INSERT INTO progress (device_id, credits_milli, cold, ion, sail, hands, chant, patches,
               km_since_shift, settled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (device_id) DO UPDATE SET credits_milli = excluded.credits_milli, cold = excluded.cold,
               ion = excluded.ion, sail = excluded.sail, hands = excluded.hands, chant = excluded.chant,
               patches = excluded.patches, km_since_shift = excluded.km_since_shift, settled_at = excluded.settled_at,
               updated_at = excluded.updated_at`,
          )
          .bind(
            id,
            p.creditsMilli,
            p.levels.cold,
            p.levels.ion,
            p.levels.sail,
            p.levels.hands,
            p.levels.chant,
            p.patches,
            p.kmSinceShift,
            p.settledAt,
            seen,
          ),
      );
    }
    if (statements.length === 0) return;
    try {
      const results = await db.batch(statements);
      for (const r of results) this.rows.d1 += r.meta?.rows_written ?? 0;
      this.lastD1FlushAt = seen;
    } catch (err) {
      console.error("D1 flush failed; will retry", err);
      for (const id of progressIds) this.d1Progress.add(id);
      this.scheduleD1Flush();
      return; // the km are all still queued
    }
    for (const [key, s] of sent) {
      const p = this.d1Pending.get(key);
      if (!p) continue;
      p.km -= s.km;
      p.tapKm -= s.tapKm;
      p.tapMovedKm -= s.tapMovedKm;
      p.taps -= s.taps;
      if (p.km === 0 && p.tapKm === 0 && p.tapMovedKm === 0 && p.taps === 0) this.d1Pending.delete(key);
      // Straight away, so a restart now can't send these km to D1 twice.
      this.writeQueue(key);
      this.dirtyQueue.delete(key);
    }
  }

  private scheduleD1Flush() {
    this.d1Timer ??= setTimeout(() => void this.flushD1(), D1_FLUSH_MS);
  }

  private addPending(day: string, w: Who, km: number, tapKm: number, tapMovedKm = 0, taps = 0) {
    const key = `${day}|${w.deviceId}`;
    const p = this.d1Pending.get(key) ?? { day, deviceId: w.deviceId, accountId: w.accountId, km: 0, tapKm: 0, tapMovedKm: 0, taps: 0 };
    p.accountId = w.accountId;
    p.km += km;
    p.tapKm += tapKm;
    p.tapMovedKm += tapMovedKm;
    p.taps += taps;
    this.d1Pending.set(key, p);
    this.dirtyQueue.add(key);
    this.scheduleProgressSave();
  }

  /** One line in the mission log (shown in phase 7). A failure is logged, never fatal. */
  private async log(kind: string, title: string, body: string, data: object) {
    try {
      const res = await this.env.DB.prepare(
        `INSERT INTO log_entries (mission_id, at, kind, title, body, data) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(this.mission.id, this.now(), kind, title, body, JSON.stringify(data))
        .run();
      this.lastLogId = Math.max(this.lastLogId, res.meta.last_row_id ?? 0);
      this.scheduleBroadcast(); // the log page reloads when logId changes
    } catch (err) {
      console.error("log entry failed", err);
    }
  }

  // ---------- The probe ----------

  private now() {
    return Date.now() + this.clockOffsetMs;
  }

  /** This leg's length as a share of Earth → Mars. Coasting and the crew's top speed scale with it, so a leg of
   * any length takes about as long for the same crowd; your km per tap and credits don't change (phase 8c, E0). */
  private legScale(): number {
    return this.mission.legKm / ROUTE_KM;
  }

  private coastKmS(): number {
    // The landing burn (E4b part 2b): the probe glides in at a steady speed and lands at the fixed time.
    const b = this.burn;
    if (b && this.mission.arrivedAt === null) {
      return Math.max(0, this.mission.routeKm - b.startKm) / Math.max(1, (b.landAt - b.startedAt) / 1000);
    }
    return COAST_KM_S * this.legScale();
  }

  /** The probe's motion: coasting plus connected auto-thrust, or nothing at all while it's paused (or in orbit). */
  private moving() {
    const m = this.mission;
    const paused = m.pausedSince !== null;
    return { ...m, coastKmS: paused ? 0 : this.coastKmS(), autoKmS: paused ? 0 : m.autoKmS };
  }

  private snapshot(now: number): ProbeSnapshot {
    const m = this.mission;
    const safe = m.safeSince !== null;
    const paused = m.pausedSince !== null;
    const factor = this.factor(now);
    const moving = this.moving();
    return {
      missionId: m.id,
      destination: m.destination,
      stop: m.stop,
      fromStop: m.fromStop,
      arrivedAt: m.arrivedAt,
      lastArrival: this.lastArrival,
      tech: this.tech,
      missionStartedAt: m.startedAt,
      routeKm: m.routeKm,
      distanceKm: distanceAt(moving, now),
      at: now,
      coastKmS: moving.coastKmS,
      autoKmS: moving.autoKmS,
      // In safe mode the thrusters sleep: the crew adds nothing (the design's "0 km/s from crew").
      crewKmS: safe || paused ? 0 : this.tapPaceKmS(now, PACE_WINDOW_MIN) * factor + m.autoKmS,
      crewFactor: factor,
      paceKmS: this.todayPace(now),
      pausedSince: m.pausedSince,
      online: this.onlineDevices().size,
      idling: this.idlingCount(now),
      signalDeadline: m.signalDeadline,
      safeSince: m.safeSince,
      vote: this.liveVote(),
      logId: this.lastLogId,
      milestones: this.reached,
      burn: this.burnView(now),
    };
  }

  private liveVote(): LiveVote {
    const v = this.vote;
    const branch = this.isBranch();
    return {
      round: v.round,
      question: branch ? "Where next? The route splits" : VOTE_QUESTION,
      options: v.ids.map((id, i) => {
        const to = branchStopId(id);
        return { id, label: to ? stopName(to) : (voteOption(id)?.label ?? id), votes: v.tallies[i] ?? 0 };
      }),
      closesAt: v.closesAt,
      kind: branch ? "branch" : "daily",
    };
  }

  /** The open round is a branch vote (on arrival at a stop with two ways on). */
  private isBranch(): boolean {
    return this.vote.ids.some((id) => branchStopId(id) !== null);
  }

  /** Moves the stored distance and moving time up to `t` (never backwards), so km can be added on top. */
  private rebase(t: number) {
    const m = this.mission;
    const at = Math.max(t, m.at);
    m.distanceKm = distanceAt(this.moving(), at);
    if (m.pausedSince === null) m.movedMs += at - m.at;
    m.at = at;
  }

  /** Time the probe has spent moving this mission, up to `now`. */
  private movedAt(now: number): number {
    const m = this.mission;
    return m.movedMs + (m.pausedSince === null ? Math.max(0, now - m.at) : 0);
  }

  /** Adds a sample of the track (the distance and moving time at `at`) when the last one is old enough. */
  private sample(force = false) {
    const m = this.mission;
    const last = this.track[this.track.length - 1];
    if (last && (m.at <= last.at || (!force && m.movedMs - last.movedMs < TRACK_EVERY_MS))) return;
    const point: TrackPoint = { at: m.at, distanceKm: m.distanceKm, movedMs: m.movedMs };
    this.track.push(point);
    this.sql.exec(
      `INSERT OR REPLACE INTO track (mission_id, at, distance_km, moved_ms) VALUES (?, ?, ?, ?)`,
      m.id,
      point.at,
      point.distanceKm,
      point.movedMs,
    );
    // Samples well before the window aren't needed any more.
    const old = m.movedMs - TODAY_PACE_MS - 3_600_000;
    while (this.track.length > 1 && this.track[0].movedMs < old) this.track.shift();
    this.sql.exec(`DELETE FROM track WHERE mission_id = ? AND moved_ms < ?`, m.id, Math.min(old, this.track[0].movedMs));
  }

  /**
   * Today's pace: the probe's average speed over its last 24 hours of moving (paused time left out),
   * coasting and the crew together. Early in a mission, coasting plus the crew's live push.
   */
  private todayPace(now: number): number {
    const moved = this.movedAt(now);
    const from = moved - TODAY_PACE_MS;
    const s = this.track.find((p) => p.movedMs >= from) ?? this.track[this.track.length - 1];
    if (s && moved - s.movedMs >= TODAY_PACE_MIN_MS) {
      return Math.max(1, (distanceAt(this.moving(), now) - s.distanceKm) / ((moved - s.movedMs) / 1000));
    }
    return this.coastKmS() + this.tapPaceKmS(now, PACE_WINDOW_MIN) * this.factor(now) + this.mission.autoKmS;
  }

  /** The arrival estimate at today's pace (null while paused). */
  private arrivalNow(now: number): number | null {
    const m = this.mission;
    return arrivalAt(
      { routeKm: m.routeKm, paceKmS: this.todayPace(now), pausedSince: m.pausedSince, safeSince: m.safeSince },
      distanceAt(this.moving(), now),
      now,
    );
  }

  /** Raw km in `map` over the last `minutes` minutes (this one included), per second. */
  private perSecond(map: Map<number, number>, now: number, minutes: number): number {
    const minute = Math.floor(now / MINUTE_MS);
    let km = 0;
    for (let i = 0; i < minutes; i++) km += map.get(minute - i) ?? 0;
    const seconds = (minutes - 1) * 60 + (now % MINUTE_MS) / 1000;
    return km / Math.max(1, seconds);
  }

  /** The crew's tap pace (raw km/s). */
  private tapPaceKmS(now: number, minutes: number): number {
    return this.perSecond(this.pace, now, minutes);
  }

  /** The crew push before auto-thrust: last hour's taps and catch-ups (raw km/s). */
  private hourKmS(now: number): number {
    return this.perSecond(this.pace, now, CREW_WINDOW_MIN) + this.perSecond(this.catchup, now, CREW_WINDOW_MIN);
  }

  /** How far each crew km moves the probe right now: last hour's taps and catch-ups plus everyone connected's auto-thrust, balanced. */
  private factor(now: number, except?: WebSocket): number {
    // shared/balance.ts's crewFactor, with this leg's top speed (scaled to its length) and its recalibrated balance.
    const raw = this.hourKmS(now) + this.autoRaw(except);
    return (CREW_TOP_KM_S * this.legScale()) / (Math.max(0, raw) + this.mission.crewHalf);
  }

  /** Open, live sockets' players and their raw auto-thrust (several tabs, or two devices on one account, count once). */
  private onlineDevices(except?: WebSocket): Map<string, number> {
    const real = Date.now();
    if (!except && this.online && real - this.online.at < ONLINE_CACHE_MS) return this.online.ids;
    const ids = new Map<string, number>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN || this.dead.has(ws)) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a) continue;
      const alive = this.lastAlive(ws, a);
      if (real - alive > DEAD_SOCKET_MS) {
        this.dropDead(ws, alive);
        continue;
      }
      ids.set(whoOf(a).key, a.auto ?? 0);
    }
    if (!except) {
      let auto = 0;
      for (const v of ids.values()) auto += v;
      this.online = { at: real, ids, auto };
    }
    return ids;
  }

  /** The players with a live socket (key → who), for settling them all at once. */
  private onlinePlayers(): Map<string, Who> {
    const out = new Map<string, Who>();
    const live = this.onlineDevices();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && live.has(whoOf(a).key)) out.set(whoOf(a).key, whoOf(a));
    }
    return out;
  }

  /** Real ms of the socket's last sign of life: its last heartbeat or message, or when it opened. */
  private lastAlive(ws: WebSocket, a: Attachment): number {
    const beat = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
    return Math.max(beat, a.since ?? 0, a.seen ?? 0);
  }

  /** A socket that went silent without closing: close it, and count its device away from its last heartbeat. */
  private dropDead(ws: WebSocket, aliveReal: number) {
    this.dead.add(ws);
    this.online = null;
    // Its auto-thrust was connected until its last heartbeat (for the idle pause).
    const a = ws.deserializeAttachment() as Attachment | null;
    if (a && a.auto > 0) this.mission.lastActiveAt = Math.max(this.mission.lastActiveAt, aliveReal + this.clockOffsetMs);
    try {
      ws.close(1001, "no heartbeat");
    } catch {
      // already closing
    }
    void this.left(ws, aliveReal + this.clockOffsetMs);
  }

  private autoRaw(except?: WebSocket): number {
    if (!except) {
      this.onlineDevices();
      if (this.online) return this.online.auto;
    }
    let sum = 0;
    for (const auto of this.onlineDevices(except).values()) sum += auto;
    return sum;
  }

  /** Re-works out how fast connected auto-thrust moves the probe (after anyone joins, leaves, buys or taps). */
  private retune(now: number, except?: WebSocket) {
    this.rebase(now);
    const m = this.mission;
    const raw = this.autoRaw(except);
    if (raw > 0 && m.pausedSince === null) m.lastActiveAt = Math.max(m.lastActiveAt, now);
    m.autoKmS = m.safeSince === null && m.pausedSince === null && !this.burn ? raw * this.factor(now, except) : 0;
    if (this.burn) this.burnAccrue(now, raw); // during the burn, connected auto-thrust fills the bar instead
    this.scheduleSave();
    this.scheduleBroadcast();
  }

  /** Crew km arriving in one go (a tap batch or an offline catch-up): counted in full, balanced for the probe. Returns the km it moved the probe. */
  private pushCrewKm(now: number, rawKm: number, kind: "taps" | "catchup"): number {
    if (rawKm <= 0 || this.mission.pausedSince !== null) return 0;
    if (this.burn) {
      // The landing time is fixed: taps fill the burn bar (counting double) instead of moving the probe.
      if (kind !== "taps") return 0;
      const minute = Math.floor(now / MINUTE_MS);
      this.pace.set(minute, (this.pace.get(minute) ?? 0) + rawKm);
      this.dirtyMinutes.add(minute);
      this.burnAccrue(now, this.autoRaw());
      this.burnAdd(now, rawKm * BURN_TAP_MULTIPLIER);
      this.scheduleSave();
      this.scheduleBroadcast();
      return 0;
    }
    this.rebase(now);
    const minute = Math.floor(now / MINUTE_MS);
    const map = kind === "taps" ? this.pace : this.catchup;
    map.set(minute, (map.get(minute) ?? 0) + rawKm);
    if (kind === "taps") this.dirtyMinutes.add(minute);
    const moved = rawKm * this.factor(now);
    this.mission.distanceKm = Math.min(this.mission.routeKm, this.mission.distanceKm + moved);
    this.retune(now);
    return moved;
  }

  /** Devices away within the last 8 hours with auto-thrust (cached; it's a count, not exact to the second). */
  private idlingCount(now: number): number {
    if (Date.now() - this.idling.at < IDLING_MS) return this.idling.n;
    const cutoff = now - offlineCapMs(OFFLINE_CAP_MS, this.tech);
    const row = this.sql
      .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM progress WHERE auto_kms > 0 AND settled_at > ?`, cutoff)
      .toArray()[0];
    let online = 0;
    for (const [id, auto] of this.onlineDevices()) {
      const p = this.progress.get(id);
      if (auto > 0 && p && p.settledAt > cutoff) online += 1;
    }
    this.idling = { n: Math.max(0, (row?.n ?? 0) - online), at: Date.now() };
    return this.idling.n;
  }

  // ---------- The signal ----------

  /**
   * One alarm for whichever comes first: the signal running out, the idle pause, the next milestone,
   * or the vote closing at midnight. While the probe is paused only the vote can fire: the signal
   * waits and the probe stands still. Alarms run on real time, so the clock offset is taken off.
   * Durable Object alarms survive restarts; it's only rewritten when the time changes.
   */
  private async scheduleAlarm() {
    const m = this.mission;
    let at = this.vote.closesAt;
    if (m.pausedSince === null) {
      if (m.safeSince === null && !this.burn) at = Math.min(at, m.signalDeadline);
      // When the arrival will be an hour away at today's pace: the landing burn starts (E4b part 2b).
      const burnAt = this.burnStartsAt(this.now());
      if (burnAt !== null) at = Math.min(at, Math.max(this.now() + 5_000, Math.ceil(burnAt / 1000) * 1000));
      const pauseAt = this.pausesAt();
      if (pauseAt !== null) at = Math.min(at, pauseAt);
      // When the probe reaches the next milestone without help (rounded up to the minute, so taps don't rewrite it).
      const next = milestonesFor(m.stop).find((ms) => !this.reached.some((r) => r.n === ms.n));
      if (next) {
        const now = this.now();
        const left = next.km - distanceAt(this.moving(), now);
        const reach = left <= 0 ? now : now + (left / (this.coastKmS() + m.autoKmS)) * 1000;
        at = Math.min(at, Math.ceil(reach / MINUTE_MS) * MINUTE_MS);
      }
      // When the probe arrives without help (phase 8c).
      if (m.arrivedAt === null) {
        const now = this.now();
        const left = m.routeKm - distanceAt(this.moving(), now);
        const reach = left <= 0 ? now : now + (left / (this.coastKmS() + m.autoKmS)) * 1000;
        at = Math.min(at, Math.ceil(reach / MINUTE_MS) * MINUTE_MS);
      }
    }
    const real = Math.max(Date.now(), at - this.clockOffsetMs);
    if (real === this.alarmAt) return;
    this.alarmAt = real;
    await this.ctx.storage.setAlarm(real);
  }

  async alarm() {
    this.alarmAt = 0; // it fired: the next one must be set again
    await this.checkSignal();
    await this.maybeStartBurn();
    await this.checkVote();
    await this.checkMilestones();
    await this.scheduleAlarm();
  }

  /**
   * Enters safe mode if the deadline has passed, and pauses the probe after 8 quiet hours, in the order
   * they happened (from the alarm, or any message if the alarm is late).
   */
  private async checkSignal() {
    const m = this.mission;
    const now = this.now();
    const pauseAt = this.pausesAt();
    // The signal's clock stops when the probe pauses, so it only runs out if that comes first.
    const until = m.pausedSince ?? Math.min(now, pauseAt ?? Infinity);
    if (m.safeSince === null && m.signalDeadline <= until && !this.burn) await this.enterSafe(until);
    if (pauseAt !== null && pauseAt <= now) await this.enterIdle(pauseAt);
    await this.scheduleAlarm();
  }

  /** The signal ran out at its deadline: safe mode (thrusters asleep, taps count for nothing). */
  private async enterSafe(upTo: number) {
    const m = this.mission;
    this.rebase(m.signalDeadline);
    m.safeSince = m.signalDeadline;
    m.autoKmS = 0;
    this.retune(upTo); // the thrusters sleep: auto-thrust stops moving the probe
    this.saveSignal();
    this.broadcast();
    await this.log("signal_lost", "Signal lost", "Nobody pinged in time. The probe went quiet and slipped into safe mode.", {
      distanceKm: Math.round(m.distanceKm),
    });
  }

  /** When the probe pauses if nothing happens: 8 hours after the last activity; never while auto-thrust is connected (or once paused). */
  private pausesAt(): number | null {
    const m = this.mission;
    if (m.pausedSince !== null || this.autoRaw() > 0 || this.burn) return null;
    return m.lastActiveAt + IDLE_PAUSE_MS;
  }

  /** Nobody's pushed for 8 hours: the probe stops where it is, and the signal timer and any setback wait with it (decision 5). */
  private async enterIdle(at: number) {
    const m = this.mission;
    this.rebase(at);
    m.pausedSince = m.at;
    m.autoKmS = 0;
    this.saveSignal();
    this.broadcast();
    await this.log(
      "probe_idle",
      "Probe idle",
      "Nobody has pushed for 8 hours, so the probe has stopped to wait, and the signal timer with it. One tap wakes it.",
      { distanceKm: Math.round(m.distanceKm) },
    );
  }

  /** Activity (a tap batch, connected auto-thrust, a ping): keeps the probe awake, and wakes it if it's paused, logging who did. */
  private async wake(deviceId: string, now: number) {
    const m = this.mission;
    m.lastActiveAt = Math.max(m.lastActiveAt, now);
    if (m.pausedSince === null || m.arrivedAt !== null) return; // in orbit the probe waits for the branch vote
    const pausedMs = Math.max(0, now - m.pausedSince);
    // The signal and any setback waited with the probe.
    if (m.safeSince !== null) m.safeSince += pausedMs;
    else m.signalDeadline += pausedMs;
    m.pausedSince = null;
    m.at = Math.max(m.at, now); // it stood still: no distance or moving time to add
    this.retune(now);
    this.saveSignal();
    await this.scheduleAlarm();
    this.broadcast();
    const name = await this.deviceName(deviceId);
    await this.log("probe_woken", `Probe woken by ${name}`, `The probe was idle for ${span(pausedMs)}. It's moving again.`, {
      by: name,
      pausedMs: Math.round(pausedMs),
    });
  }

  /** A device's name for the log: its account's when signed in. */
  private async deviceName(deviceId: string): Promise<string> {
    try {
      const row = await this.env.DB.prepare(
        `SELECT COALESCE(a.name, d.name) AS name FROM devices d LEFT JOIN accounts a ON a.id = d.account_id WHERE d.id = ?`,
      )
        .bind(deviceId)
        .first<{ name: string }>();
      return row?.name ?? "a crew member";
    } catch {
      return "a crew member";
    }
  }

  /** A ping: once per UTC day per device, or per account when signed in; first one wins in a close race. */
  async ping(deviceId: string, accountId: string | null, name: string): Promise<PingResult> {
    await this.checkSignal();
    const now = this.now();
    const m = this.mission;
    const w = who(deviceId, accountId);
    const dev = await this.device(w, now);
    if (dev.pingedToday) return { ok: false, reason: "already-pinged" };
    if (Date.now() - this.lastPingAt < JUST_SAVED_MS) return { ok: false, reason: "just-saved" };

    const woke = m.safeSince !== null;
    const secondsLeft = woke ? 0 : Math.max(0, (m.signalDeadline - probeClock(m, now)) / 1000);
    const tier = tierFor(secondsLeft);
    const day = utcDay(now);

    // Claim the moment before awaiting D1, so a second ping in the same instant is "just saved".
    const prevLastPingAt = this.lastPingAt;
    this.lastPingAt = Date.now();
    let inserted = false;
    try {
      // Signed in, one ping per account: not if another of its devices pinged today.
      const res = await this.env.DB.prepare(
        `INSERT INTO pings (day, device_id, account_id, mission_id, at, seconds_left, tier)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE ? IS NULL OR NOT EXISTS (SELECT 1 FROM pings WHERE day = ? AND account_id = ?)
         ON CONFLICT (day, device_id) DO NOTHING`,
      )
        .bind(day, deviceId, accountId, m.id, now, secondsLeft, tier, accountId, day, accountId)
        .run();
      inserted = res.meta.changes > 0;
    } catch (err) {
      console.error("ping insert failed", err);
      this.lastPingAt = prevLastPingAt;
      return { ok: false, reason: "unavailable" };
    }
    if (!inserted) {
      this.lastPingAt = prevLastPingAt;
      dev.pingedToday = true;
      return { ok: false, reason: "already-pinged" };
    }

    // The signal is back: full window again. Waking from safe mode makes the setback permanent.
    const at = this.now();
    await this.wake(deviceId, at); // a ping is activity too: it wakes a paused probe
    let setback = 0;
    this.rebase(at);
    if (m.safeSince !== null) {
      setback = setbackMs(m.safeSince, at);
      m.routeKm += (setback / 1000) * this.todayPace(at); // drifted off course: that many hours more, at today's pace
      m.lastSafeFrom = m.safeSince; // nobody's auto-thrust is paid for the outage
      m.lastSafeTo = at;
      m.safeSince = null;
    }
    m.signalDeadline = at + SIGNAL_WINDOW_MS;
    this.retune(at);
    this.saveSignal();
    await this.scheduleAlarm();

    const yesterday = utcDay(at - DAY_MS);
    dev.pingStreakDays = dev.lastPingDay === yesterday ? dev.pingStreakDays + 1 : 1;
    dev.bestStreak = Math.max(dev.bestStreak, dev.pingStreakDays);
    dev.lastPingDay = day;
    dev.pingedToday = true;
    this.broadcast();
    await this.checkBadges(w, dev, null, at); // First Ping, Signal Keeper
    await this.convertRecruit(w, at); // a Ping makes a newcomer a recruit

    if (woke) {
      const later = setback > 0 ? `Arrival moved about ${span(setback)} later.` : "The arrival date held.";
      void this.log("signal_restored", `Signal restored by ${name}`, `The probe woke up. ${later}`, {
        by: name,
        setbackMs: Math.round(setback),
      });
    } else if (secondsLeft <= SIGNAL_URGENT_S) {
      const s = Math.max(1, Math.round(secondsLeft));
      void this.log("close_save", `Saved with ${s} second${s === 1 ? "" : "s"} left`, `Pinged by ${name}.`, {
        by: name,
        secondsLeft,
      });
    }

    return { ok: true, tier, secondsLeft, woke, setbackMs: Math.round(setback), pingStreakDays: dev.pingStreakDays };
  }

  // ---------- Milestones ----------

  /** Records any milestone the probe has passed: everyone connected gets the moment, and it goes in the log. */
  private async checkMilestones() {
    await this.maybeStartBurn();
    await this.checkReached();
    await this.checkArrival();
  }

  /** Milestones on this leg the probe has passed (each leg's own from E3: content/milestones/<stop>.json). */
  private async checkReached() {
    const now = this.now();
    const d = distanceAt(this.moving(), now);
    const fresh = milestonesFor(this.mission.stop).filter((ms) => ms.km <= d && !this.reached.some((r) => r.n === ms.n));
    if (fresh.length === 0) return;
    const m = this.mission;
    for (const ms of fresh) {
      this.reached.push({ n: ms.n, at: now });
      this.sql.exec(`INSERT OR IGNORE INTO milestone_reached (mission_id, n, at) VALUES (?, ?, ?)`, m.id, ms.n, now);
    }
    this.reached.sort((a, b) => a.n - b.n);
    this.broadcast();
    await this.scheduleAlarm();
    for (const ms of fresh) {
      try {
        await this.env.DB.prepare(`INSERT OR IGNORE INTO milestones (mission_id, n, km, reached_at) VALUES (?, ?, ?, ?)`)
          .bind(m.id, ms.n, ms.km, now)
          .run();
      } catch (err) {
        console.error("milestone insert failed", err);
      }
      await this.log("milestone", `Milestone ${ms.n}: ${ms.name}`, `${gb.format(ms.km)} km from Earth. ${ms.fact}`, {
        n: ms.n,
        slug: ms.slug,
        postcard: ms.n,
      });
    }
    if (fresh.some((ms) => ms.halfway)) await this.awardHalfway(now);
  }

  // ---------- Badges (phase 8b) ----------

  /** When the probe passed halfway in this mission, or null if it hasn't yet. */
  private halfwayAt(): number | null {
    const half = milestonesFor(this.mission.stop).find((ms) => ms.halfway);
    return this.reached.find((r) => r.n === half?.n)?.at ?? null;
  }

  /** Halfway Crew: everyone who pushed in this mission up to the day it passed halfway. */
  private async awardHalfway(at: number) {
    await this.flushD1(); // km pushed in the last few seconds count too
    const db = this.env.DB;
    let keys: string[] = [];
    try {
      await db
        .prepare(
          `INSERT OR IGNORE INTO badges (player_key, badge, earned_at)
           SELECT DISTINCT CASE WHEN account_id IS NOT NULL THEN 'a:' || account_id ELSE device_id END, 'halfway', ?
           FROM daily_km WHERE km > 0 AND day >= ? AND day <= ?`,
        )
        .bind(at, utcDay(this.mission.startedAt), utcDay(at))
        .run();
      const rows = await db.prepare(`SELECT player_key FROM badges WHERE badge = 'halfway' AND earned_at = ?`).bind(at).all<{ player_key: string }>();
      keys = rows.results.map((r) => r.player_key);
    } catch (err) {
      console.error("halfway badges failed", err);
      return;
    }
    for (const key of keys) {
      const dev = this.devices.get(key);
      if (!dev || dev.badges.has("halfway")) continue;
      dev.badges.set("halfway", at);
      dev.pushedBeforeHalfway = true;
      this.sendBadges(key, dev, ["halfway"]);
    }
  }

  /** Awards every badge this player now qualifies for (plus any in `extra`), saves them and tells their tabs. */
  private async checkBadges(w: Who, dev: DeviceEntry, p: ProgressEntry | null, now: number, extra: BadgeId[] = []) {
    const want: BadgeId[] = [...extra];
    if (dev.lastPingDay !== null) want.push("first-ping");
    const streak = Math.max(dev.bestStreak, dev.pingStreakDays);
    KEEPER_DAYS.forEach((d, i) => streak >= d && want.push(KEEPER_IDS[i]));
    if (dev.votesTotal >= VOTER_ROUNDS) want.push("voter-30");
    if (dev.pushedBeforeHalfway) want.push("halfway");
    if (p && p.patches > 0) want.push("patch");
    CLICK_BADGES.forEach((b, i) => dev.tapsAll >= b.clicks && want.push(CLICK_BADGE_IDS[i]));
    want.push(...RECRUITER_IDS.slice(0, recruiterLevel(dev.recruits)));
    // Early Beta (prompts 82-83): any account signed in before launch. Real time, not the probe's clock.
    if (w.key.startsWith("a:") && betaOpen(Date.now())) want.push("early-beta");
    const earned = [...new Set(want)].filter((id) => !dev.badges.has(id));
    if (earned.length === 0) return;
    for (const id of earned) dev.badges.set(id, now);
    try {
      await this.env.DB.batch(
        earned.map((id) =>
          this.env.DB.prepare(`INSERT OR IGNORE INTO badges (player_key, badge, earned_at) VALUES (?, ?, ?)`).bind(w.key, id, now),
        ),
      );
    } catch (err) {
      console.error("badge insert failed", err);
      for (const id of earned) dev.badges.delete(id); // try again next time
      return;
    }
    this.sendBadges(w.key, dev, earned);
  }

  /**
   * Phase S2: this device just reached 50 credited taps or pinged. If it arrived through someone's crew
   * link as a new player (worker/share.ts noteArrival), decide it now, once: a recruit for the link's
   * owner (at most 10 a day count), or not, if it's signed in to their account or to an account older
   * than its arrival. The recruiter's Crew Recruiter badges follow, on any tab they have open.
   */
  private async convertRecruit(w: Who, now: number) {
    const db = this.env.DB;
    try {
      const row = await db
        .prepare(`SELECT recruiter_key, arrived_at FROM recruits WHERE device_id = ? AND status = 'arrived'`)
        .bind(w.deviceId)
        .first<{ recruiter_key: string; arrived_at: number }>();
      if (!row) return;
      const recruiter = row.recruiter_key;
      let status = "recruit";
      if (recruiter === w.key || recruiter === w.deviceId) status = "own";
      else if (w.accountId) {
        const acct = await db.prepare(`SELECT created_at FROM accounts WHERE id = ?`).bind(w.accountId).first<{ created_at: number }>();
        if (!acct || acct.created_at < row.arrived_at) status = "existing";
      }
      // Real time, not the probe's clock: the cycle time in /admin is arrival to conversion.
      const real = Date.now();
      if (status === "recruit") {
        const since = Date.parse(`${utcDay(real)}T00:00:00Z`);
        const today = await db
          .prepare(`SELECT COUNT(*) AS n FROM recruits WHERE recruiter_key = ? AND status = 'recruit' AND converted_at >= ?`)
          .bind(recruiter, since)
          .first<{ n: number }>();
        if ((today?.n ?? 0) >= RECRUITS_PER_DAY) status = "over-cap";
      }
      const res = await db
        .prepare(`UPDATE recruits SET status = ?, converted_at = ? WHERE device_id = ? AND status = 'arrived'`)
        .bind(status, real, w.deviceId)
        .run();
      if (status !== "recruit" || !res.meta.changes) return;
      const n = await db
        .prepare(`SELECT COUNT(*) AS n FROM recruits WHERE recruiter_key = ? AND status = 'recruit'`)
        .bind(recruiter)
        .first<{ n: number }>();
      const total = n?.n ?? 0;
      const rDev = this.devices.get(recruiter);
      if (rDev) {
        rDev.recruits = total;
        const rw: Who = { deviceId: recruiter.startsWith("a:") ? "" : recruiter, accountId: null, key: recruiter };
        await this.checkBadges(rw, rDev, null, now);
      } else {
        // Not here now: save the badges, so their profile has them (their next visit would award them too).
        const ids = RECRUITER_IDS.slice(0, recruiterLevel(total));
        if (ids.length)
          await db.batch(
            ids.map((id) =>
              db.prepare(`INSERT OR IGNORE INTO badges (player_key, badge, earned_at) VALUES (?, ?, ?)`).bind(recruiter, id, now),
            ),
          );
      }
    } catch (err) {
      console.error("recruit check failed", err);
    }
  }

  /** Tells all of a player's tabs and devices about new badges. */
  private sendBadges(key: string, dev: DeviceEntry, earned: BadgeId[]) {
    const msg: ServerMessage = { t: "badges", now: this.now(), earned, badges: badgeList(dev) };
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && whoOf(a).key === key) this.send(ws, msg);
    }
  }


  // ---------- The landing burn (E4b part 2b) ----------

  /** When the arrival will be an hour away at today's pace (the burn starts then), or null if it can't start. */
  private burnStartsAt(now: number): number | null {
    const m = this.mission;
    if (this.burn || m.arrivedAt !== null || m.pausedSince !== null || m.safeSince !== null) return null;
    const left = m.routeKm - distanceAt(this.moving(), now);
    const speed = this.coastKmS() + m.autoKmS;
    if (left <= 0 || speed <= 0) return null;
    const window = this.todayPace(now) * (BURN_MS / 1000);
    return now + Math.max(0, ((left - window) / speed) * 1000);
  }

  /** Starts the landing burn once the arrival is an hour away at today's pace. */
  private async maybeStartBurn() {
    const m = this.mission;
    if (this.burn || m.arrivedAt !== null || m.pausedSince !== null || m.safeSince !== null) return;
    const now = this.now();
    const left = m.routeKm - distanceAt(this.moving(), now);
    if (left <= 0 || left > this.todayPace(now) * (BURN_MS / 1000) + 1) return;
    await this.startBurn(now, BURN_MS, BURN_TARGET_KM);
  }

  /** The final hour: the landing time is fixed, and the crew's pushed km fill the bar from now on. */
  private async startBurn(now: number, ms: number, target: number) {
    const m = this.mission;
    this.rebase(now);
    this.burn = { startedAt: now, landAt: now + ms, target, km: 0, at: now, autoKmS: this.autoRaw(), filledAt: null, startKm: m.distanceKm };
    // The signal can't run out during the burn, or as the probe lands.
    m.signalDeadline = Math.max(m.signalDeadline, this.burn.landAt + MINUTE_MS);
    this.retune(now); // auto-thrust stops moving the probe: it fills the bar instead
    this.saveSignal();
    this.saveBurn();
    await this.scheduleAlarm();
    this.broadcast();
    const probeName = probeFor(m.stop, m.fromStop)?.name ?? "The probe";
    const time = new Date(this.burn.landAt).toISOString().slice(11, 16);
    await this.log(
      "burn_start",
      "Final hour: the landing burn",
      `${probeName} lands on ${stopName(m.stop)} at ${time} UTC. ${gb.format(target)} km of crew thrust sticks the landing, and every tap counts double.`,
      { stop: m.stop, landAt: this.burn.landAt, target },
    );
    this.onBurnStart();
  }

  /**
   * Phase 8d's hook: when crew emails exist (after the payday setup), the "final burn, join the push" email to
   * opted-in accounts goes out from here (docs/plan.md, "8d: Crew emails").
   */
  private onBurnStart() {
    // Nothing yet: email sending waits for the domain, Email Service and Workers Paid.
  }

  /** Adds the connected auto-thrust up to `now` to the bar, then counts `raw` (everyone connected's) from here. */
  private burnAccrue(now: number, raw: number) {
    const b = this.burn;
    if (!b) return;
    const t = Math.max(b.at, Math.min(now, b.landAt));
    const before = b.km;
    b.km = burnKmAt(b, t);
    if (b.filledAt === null && b.km >= b.target) {
      b.filledAt = b.autoKmS > 0 ? Math.min(t, b.at + ((b.target - before) / b.autoKmS) * 1000) : t;
    }
    b.at = t;
    b.autoKmS = raw;
  }

  /** Burn km from a tap batch (already doubled). */
  private burnAdd(now: number, km: number) {
    const b = this.burn;
    if (!b || km <= 0 || now > b.landAt) return;
    b.km += km;
    if (b.filledAt === null && b.km >= b.target) b.filledAt = now;
  }

  /** The burn as the browser sees it, with the connected auto-thrust added up to now. */
  private burnView(now: number): BurnState | null {
    const b = this.burn;
    if (!b || this.mission.arrivedAt !== null) return null;
    const km = burnKmAt(b, now);
    return { startedAt: b.startedAt, landAt: b.landAt, target: b.target, km, at: now, autoKmS: b.autoKmS, filledAt: b.filledAt };
  }

  private saveBurn() {
    const b = this.burn;
    if (!b) return;
    this.sql.exec(
      `UPDATE mission SET burn_started_at = ?, burn_land_at = ?, burn_start_km = ?, burn_target = ?, burn_km = ?, burn_at = ?,
         burn_filled_at = ? WHERE id = ?`,
      b.startedAt,
      b.landAt,
      b.startKm,
      b.target,
      b.km,
      b.at,
      b.filledAt,
      this.mission.id,
    );
  }

  /** The probe landed: the burn's result, saved with the leg. */
  private finishBurn(at: number): BurnResult | null {
    const b = this.burn;
    if (!b) return null;
    this.burnAccrue(at, b.autoKmS);
    const ok = b.km >= b.target;
    const result: BurnResult = {
      km: b.km,
      target: b.target,
      ok,
      spareMs: ok && b.filledAt !== null ? Math.max(0, at - b.filledAt) : null,
    };
    this.saveBurn();
    this.sql.exec(`UPDATE mission SET burn_ok = ? WHERE id = ?`, ok ? 1 : 0, this.mission.id);
    this.burn = null;
    return result;
  }

  /** A leg's saved burn result (for the latest arrival after a restart), or null if it had none. */
  private burnResultOf(id: number): BurnResult | null {
    const r = this.sql
      .exec<{ burn_km: number | null; burn_target: number | null; burn_ok: number | null; burn_filled_at: number | null; arrived_at: number | null }>(
        `SELECT burn_km, burn_target, burn_ok, burn_filled_at, arrived_at FROM mission WHERE id = ?`,
        id,
      )
      .toArray()[0];
    if (!r || r.burn_km === null || r.burn_ok === null) return null;
    return {
      km: r.burn_km,
      target: r.burn_target ?? BURN_TARGET_KM,
      ok: r.burn_ok === 1,
      spareMs: r.burn_ok === 1 && r.burn_filled_at !== null && r.arrived_at !== null ? Math.max(0, r.arrived_at - r.burn_filled_at) : null,
    };
  }

  // ---------- Arrival and the next leg (phase 8c) ----------

  /** When the probe reached the end of the route: now, or earlier if the alarm was late. */
  private reachedAt(now: number): number {
    const m = this.mission;
    // The landing burn fixed the landing time, whatever moved the probe's stored distance since.
    if (this.burn) return Math.min(now, this.burn.landAt);
    const speed = m.pausedSince === null ? this.coastKmS() + m.autoKmS : 0;
    if (speed <= 0) return now;
    return Math.min(now, Math.max(m.at, m.at + ((m.routeKm - m.distanceKm) / speed) * 1000));
  }

  /** The probe reached this leg's stop: it goes into orbit, the crew is credited, and the branch vote opens. */
  private async checkArrival() {
    const m = this.mission;
    if (m.arrivedAt !== null || this.arriving) return;
    const now = this.now();
    if (distanceAt(this.moving(), now) < m.routeKm) return;
    this.arriving = true;
    try {
      await this.arrive(this.reachedAt(now));
    } finally {
      this.arriving = false;
    }
  }

  private async arrive(at: number) {
    const m = this.mission;
    this.rebase(at);
    m.distanceKm = m.routeKm;
    m.arrivedAt = at;
    // In orbit: the probe, the signal timer and any setback wait (like the idle pause), and taps don't wake it.
    m.pausedSince = at;
    m.autoKmS = 0;
    this.saveSignal();
    const burn = this.finishBurn(at);
    this.lastArrival = { missionId: m.id, stop: m.stop, fromStop: m.fromStop, at, burn };
    this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_arrival_mission', ?)`, m.id);
    this.broadcast();
    // The crew's medal for the leg (E4b part 2a), saved with it so a later rule change never alters it, and the
    // stop's planet tech from now on, for everyone.
    const medal = medalFor((at - m.startedAt) / DAY_MS);
    this.sql.exec(`UPDATE mission SET medal = ? WHERE id = ?`, medal, m.id);
    this.loadTech();
    this.broadcast();
    const crew = await this.creditCrew(at, medal, burn);
    const day = Math.max(1, Math.ceil((at - m.startedAt) / DAY_MS));
    const landing = !burn
      ? ""
      : burn.ok
        ? ` Landing stuck: ${gb.format(Math.round(burn.target))} km burned${burn.spareMs !== null ? ` with ${spareText(burn.spareMs)} to spare` : ""}.`
        : ` Rough landing, but we made it: ${gb.format(Math.round(burn.km))} of ${gb.format(Math.round(burn.target))} km burned.`;
    await this.log(
      "arrival",
      `Arrived at ${stopName(m.stop)}`,
      `Day ${day}. ${gb.format(crew.count)} crew pushed us here with ${gb.format(crew.taps)} taps.${landing}`,
      { stop: m.stop, from: m.fromStop, days: (at - m.startedAt) / DAY_MS, crew: crew.count, taps: crew.taps, medal, burn },
    );
    const here = campaignStop(m.stop);
    const now = this.now();
    if (here?.branchVote?.length === 2) {
      await this.abandonVote(now); // today's daily vote gives way to the branch vote
      await this.openBranchVote(now, here.branchVote);
    } else {
      await this.launchNext(nextStop(m.stop)?.id ?? null, now);
    }
    await this.scheduleAlarm();
    this.broadcast();
  }

  /**
   * The crew's planet tech (E4b part 2a): every leg arrived at since the tour began (the latest Earth → Mars
   * start, which the launch reset makes), each at its medal.
   */
  private loadTech() {
    const rows = this.sql
      .exec<{ stop: string | null; medal: string }>(
        `SELECT stop, medal FROM mission WHERE arrived_at IS NOT NULL AND medal IS NOT NULL
           AND id >= (SELECT MAX(id) FROM mission WHERE stop IS NULL OR stop = ?)`,
        FIRST_STOP,
      )
      .toArray();
    this.tech = crewTech(rows.map((r) => ({ stop: r.stop ?? FIRST_STOP, medal: r.medal as Medal })));
  }

  /** Snapshots who helped on this leg (at least one credited tap) into D1's mission_crew: the credits, and E4b's stamps. */
  private async creditCrew(at: number, medal: Medal, burn: BurnResult | null = null): Promise<{ count: number; taps: number }> {
    await this.flushD1();
    const m = this.mission;
    const db = this.env.DB;
    try {
      await db.prepare(`DELETE FROM mission_crew WHERE mission_id = ?`).bind(m.id).run(); // a re-run leg starts clean
      await db
        .prepare(
          `INSERT OR REPLACE INTO mission_crew (mission_id, player_key, account_id, name, country, km, taps)
           SELECT ?, CASE WHEN d.account_id IS NOT NULL THEN 'a:' || d.account_id ELSE d.device_id END AS k,
             MAX(d.account_id), MAX(a.name), COALESCE(MAX(a.country), MAX(v.country)), SUM(d.km), SUM(d.taps)
           FROM daily_km d LEFT JOIN accounts a ON a.id = d.account_id LEFT JOIN devices v ON v.id = d.device_id
           WHERE d.day >= ? AND d.day <= ? GROUP BY k HAVING SUM(d.taps) > 0`,
        )
        .bind(m.id, utcDay(m.startedAt), utcDay(at))
        .run();
      const row = await db
        .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(taps), 0) AS taps FROM mission_crew WHERE mission_id = ?`)
        .bind(m.id)
        .first<{ n: number; taps: number }>();
      const count = row?.n ?? 0;
      const taps = row?.taps ?? 0;
      await db
        .prepare(
          `UPDATE missions SET arrived_at = ?, crew_count = ?, taps = ?, medal = ?, burn_km = ?, burn_target = ?, burn_ok = ?,
             burn_spare_ms = ? WHERE id = ?`,
        )
        .bind(at, count, taps, medal, burn?.km ?? null, burn?.target ?? null, burn ? (burn.ok ? 1 : 0) : null, burn?.spareMs ?? null, m.id)
        .run();
      return { count, taps };
    } catch (err) {
      console.error("crediting the crew failed", err);
      return { count: 0, taps: 0 };
    }
  }

  /**
   * The next leg's crew balance (E0, section 3; prompt 46): the crew's push over the last 3 full days of this
   * leg, against the Mars leg's average. A steady crew keeps legs near 30 days as upgrades carry over.
   */
  private async nextCrewHalf(at: number): Promise<number> {
    const m = this.mission;
    try {
      const rows = (
        await this.env.DB.prepare(`SELECT day, SUM(km) AS km FROM daily_km WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day`)
          .bind(utcDay(m.startedAt), utcDay(at))
          .all<{ day: string; km: number }>()
      ).results;
      const total = rows.reduce((sum, r) => sum + r.km, 0);
      const whole = total / Math.max(1, (at - m.startedAt) / 1000);
      const full = rows.filter((r) => r.day < utcDay(at)).slice(-3);
      const recent = full.length > 0 ? full.reduce((sum, r) => sum + r.km, 0) / (full.length * 86_400) : whole;
      let base = this.sql.exec<{ value: number }>(`SELECT value FROM meta WHERE key = 'crew_base_kms'`).toArray()[0]?.value;
      if (m.stop === FIRST_STOP || !base) {
        base = whole; // the Mars leg sets the yardstick
        this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('crew_base_kms', ?)`, base);
      }
      if (!(base > 0) || !(recent > 0)) return CREW_HALF_KM_S;
      return Math.min(CREW_HALF_KM_S * 50, Math.max(CREW_HALF_KM_S / 4, (CREW_HALF_KM_S * recent) / base));
    } catch (err) {
      console.error("recalibration failed", err);
      return m.crewHalf;
    }
  }

  /** Sets off on the next leg, towards `to` from the stop we're at. With no known next leg, the probe stays in orbit. */
  private async launchNext(to: string | null, now: number) {
    const m = this.mission;
    const km = to ? legKm(m.stop, to) : null;
    if (!to || km === null) return;
    const crewHalf = await this.nextCrewHalf(m.arrivedAt ?? now);
    const from = m.stop;
    await this.startMission(m.id + 1, { stop: to, fromStop: from, legKm: km, crewHalf });
    const probe = probeFor(to, from);
    const length = km >= 1e6 ? `${gb.format(Math.round(km / 1e6))} million km` : `${gb.format(Math.round(km))} km`;
    await this.log("leg_start", `On to ${stopName(to)}`, `${probe?.name ?? "The probe"} sets off on a ${length} leg.`, {
      stop: to,
      from,
      legKm: km,
      probe: probe?.id ?? null,
    });
    this.retune(this.now());
    this.saveSignal();
  }

  /** On arrival: the crew votes on the next stop. Closes at the next midnight UTC, or the one after if that's under 12 hours away. */
  private async openBranchVote(now: number, options: string[]) {
    const ids = options.map((id) => BRANCH_PREFIX + id);
    let closesAt = Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
    if (closesAt - now < 12 * 3_600_000) closesAt += DAY_MS;
    await this.startRound(now, `branch-${this.mission.id}`, ids, closesAt);
    await this.log("branch_open", `Where next? ${stopName(options[0])} or ${stopName(options[1])}`, "The crew votes on the next stop.", {
      options,
      closesAt,
    });
  }

  /** The branch vote's winner is the next stop. A tie (or no votes) is settled by a random draw, and the log says so. */
  private async closeBranchVote(now: number) {
    const v = this.vote;
    const total = v.tallies.reduce((a, b) => a + b, 0);
    const top = Math.max(...v.tallies);
    const leaders = v.ids.map((_, i) => i).filter((i) => v.tallies[i] === top);
    const w = leaders[Math.floor(Math.random() * leaders.length)];
    const to = branchStopId(v.ids[w])!;
    this.sql.exec(`UPDATE vote_round SET closed_at = ?, winner = ?, tallies = ? WHERE round = ?`, now, w, JSON.stringify(v.tallies), v.round);
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(`UPDATE vote_days SET tallies = ?, winner = ?, effect_hours = 0, closed_at = ? WHERE round = ?`).bind(
          JSON.stringify(v.tallies),
          w,
          now,
          v.round,
        ),
        this.env.DB.prepare(`UPDATE missions SET branch = ? WHERE id = ?`).bind(to, this.mission.id),
      ]);
    } catch (err) {
      console.error("branch vote close failed", err);
    }
    const pct = total > 0 ? Math.round((v.tallies[w] / total) * 100) : 0;
    const body =
      total === 0
        ? "Nobody voted, so a random draw picked it."
        : `${pct}% of ${gb.format(total)} vote${total === 1 ? "" : "s"}.${leaders.length > 1 ? " It was a tie, settled by a random draw." : ""}`;
    await this.log("branch_result", `The crew chose ${stopName(to)}`, body, {
      round: v.round,
      stop: to,
      votes: v.tallies[w],
      total,
      tie: leaders.length > 1,
    });
    await this.launchNext(to, now);
  }

  // ---------- The daily crew vote ----------

  /** Opens a new round: today's UTC day (with ".2", ".3" if /admin already closed one today). */
  private async openVote(now: number) {
    const day = utcDay(now);
    let round = day;
    for (let n = 2; this.sql.exec(`SELECT 1 FROM vote_round WHERE round = ?`, round).toArray().length > 0; n++) {
      round = `${day}.${n}`;
    }
    const recent = this.sql
      .exec<{ options: string }>(`SELECT options FROM vote_round ORDER BY rowid DESC LIMIT ?`, VOTE_RECENT_ROUNDS)
      .toArray()
      .flatMap((r) => JSON.parse(r.options) as string[]);
    const ids = pickOptions(round, recent, this.mission.stop);
    const closesAt = Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
    await this.startRound(now, round, ids, closesAt);
  }

  /** Opens a round with these options (a daily vote, or a branch vote on arrival). */
  private async startRound(now: number, round: string, ids: string[], closesAt: number) {
    this.vote = { round, openedAt: now, closesAt, ids, tallies: ids.map(() => 0) };
    this.sql.exec(
      `INSERT OR REPLACE INTO vote_round (round, opened_at, closes_at, options, tallies) VALUES (?, ?, ?, ?, ?)`,
      round,
      now,
      closesAt,
      JSON.stringify(ids),
      JSON.stringify(this.vote.tallies),
    );
    for (const dev of this.devices.values()) {
      dev.voteRound = round;
      dev.voteOption = null;
    }
    try {
      await this.env.DB.prepare(
        `INSERT OR IGNORE INTO vote_days (round, mission_id, opened_at, closes_at, options, tallies) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(round, this.mission.id, now, closesAt, JSON.stringify(ids), JSON.stringify(this.vote.tallies))
        .run();
    } catch (err) {
      console.error("vote_days insert failed", err);
    }
  }

  /** Closes the round if midnight has passed (from the alarm, or any message if the alarm is late). */
  private async checkVote() {
    if (this.now() < this.vote.closesAt) return;
    await this.rollVote();
  }

  /** Closes the open round and opens the next; only one caller at a time. */
  private async rollVote() {
    if (this.closingVote) return this.closingVote;
    this.closingVote = (async () => {
      const now = this.now();
      await this.closeVote(now);
      await this.openVote(now);
      await this.scheduleAlarm();
      this.broadcast();
    })();
    try {
      await this.closingVote;
    } finally {
      this.closingVote = null;
    }
  }

  /** The winner takes effect on the route (and so the arrival date), and the result goes in the log. */
  private async closeVote(now: number) {
    if (this.isBranch()) return this.closeBranchVote(now);
    const v = this.vote;
    const m = this.mission;
    const total = v.tallies.reduce((a, b) => a + b, 0);
    const w = total > 0 ? winnerIndex(v.ids, v.tallies) : -1;
    this.sql.exec(`UPDATE vote_round SET closed_at = ?, winner = ?, tallies = ? WHERE round = ?`, now, w, JSON.stringify(v.tallies), v.round);

    const def = w >= 0 ? voteOption(v.ids[w]) : undefined;
    // During the landing burn the landing time is fixed: the winning option changes nothing (E4b part 2b).
    const held = this.burn !== null && (def?.hours ?? 0) !== 0;
    const hours = held ? 0 : (def?.hours ?? 0);
    if (hours !== 0) {
      this.rebase(now);
      // Hours at today's pace, so "about 4 hours sooner" is what the arrival date does.
      m.routeKm = Math.max(m.distanceKm + 1, m.routeKm + hours * 3600 * this.todayPace(now));
      this.saveSignal();
    }
    try {
      await this.env.DB.prepare(
        `UPDATE vote_days SET tallies = ?, winner = ?, effect_hours = ?, closed_at = ? WHERE round = ?`,
      )
        .bind(JSON.stringify(v.tallies), w, hours, now, v.round)
        .run();
    } catch (err) {
      console.error("vote_days close failed", err);
    }
    if (!def) {
      await this.log("vote_result", "No votes today", "Nobody voted, so the probe held its course.", { round: v.round, total: 0 });
      return;
    }
    const pct = Math.round((v.tallies[w] / total) * 100);
    await this.log("vote_result", `Crew chose: ${shortLabel(def.label)}`, `${pct}% of ${gb.format(total)} vote${total === 1 ? "" : "s"}. ${held ? "The landing burn is on, so the landing time stays put." : def.result}`, {
      round: v.round,
      option: def.id,
      votes: v.tallies[w],
      total,
      hours,
      fact: def.fact,
      source: def.source,
    });
  }

  /** A vote: once per round per device, or per account when signed in, while the round is open. */
  async castVote(deviceId: string, accountId: string | null, round: string, option: number): Promise<VoteResult> {
    await this.checkVote();
    const v = this.vote;
    if (round !== v.round || !Number.isInteger(option) || option < 0 || option >= v.ids.length) {
      return { ok: false, reason: "closed" };
    }
    const now = this.now();
    const w = who(deviceId, accountId);
    const dev = await this.device(w, now);
    if (dev.voteRound === round && dev.voteOption !== null) return { ok: false, reason: "already-voted", option: dev.voteOption };

    let inserted = false;
    try {
      const res = await this.env.DB.prepare(
        `INSERT INTO votes (round, device_id, account_id, option, at)
         SELECT ?, ?, ?, ?, ? WHERE ? IS NULL OR NOT EXISTS (SELECT 1 FROM votes WHERE round = ? AND account_id = ?)
         ON CONFLICT (round, device_id) DO NOTHING`,
      )
        .bind(round, deviceId, accountId, option, now, accountId, round, accountId)
        .run();
      inserted = res.meta.changes > 0;
      if (!inserted) {
        const row = await this.env.DB.prepare(
          `SELECT option FROM votes WHERE round = ? AND (device_id = ? OR (? IS NOT NULL AND account_id = ?)) LIMIT 1`,
        )
          .bind(round, deviceId, accountId, accountId)
          .first<{ option: number }>();
        dev.voteRound = round;
        dev.voteOption = row?.option ?? null;
        return { ok: false, reason: "already-voted", option: row?.option };
      }
    } catch (err) {
      console.error("vote insert failed", err);
      return { ok: false, reason: "unavailable" };
    }
    if (this.vote.round !== round) return { ok: false, reason: "closed" }; // closed while we waited
    this.vote.tallies[option] += 1;
    dev.voteRound = round;
    dev.voteOption = option;
    dev.votesTotal += 1;
    this.sql.exec(`UPDATE vote_round SET tallies = ? WHERE round = ?`, JSON.stringify(this.vote.tallies), round);
    this.scheduleBroadcast();
    await this.checkBadges(w, dev, null, now); // Voter ×30
    return { ok: true, option, tallies: [...this.vote.tallies] };
  }

  // ---------- Devices: today's numbers ----------

  /** A player's km, ping and vote for today, loaded from D1 once a day (summed over an account's devices). */
  private async device(w: Who, now: number): Promise<DeviceEntry> {
    const day = utcDay(now);
    const have = this.devices.get(w.key);
    if (have && have.day === day) return have;
    const loading = this.loadingDevices.get(w.key);
    if (loading) return loading;
    const promise = (async () => {
      // D1 plus the queue: mid-flush the same km would be in both, so wait for it.
      while (this.flushing) await this.flushing;
      let kmToday = 0;
      let tapKmToday = 0;
      let tapMovedToday = 0;
      let tapsToday = 0;
      let tapsAll = 0;
      const badges = new Map<BadgeId, number>();
      let votesTotal = 0;
      let pushedBeforeHalfway = false;
      let recruits = 0;
      let pingDays: string[] = [];
      const round = this.vote.round;
      let voteOpt: number | null = null;
      const db = this.env.DB;
      try {
        // Halfway Crew: km pushed from the mission's first day to the day it passed halfway (none if it hasn't).
        const halfAt = this.halfwayAt();
        const halfFrom = utcDay(this.mission.startedAt);
        const halfTo = halfAt === null ? "" : utcDay(halfAt);
        const [km, pings, votes, clicks, badgeRows, voteCount, half, recruitCount] = await db.batch<{
          km?: number | null;
          tap_km?: number | null;
          tap_moved_km?: number | null;
          day?: string;
          option?: number;
          taps_today?: number | null;
          taps_all?: number | null;
          badge?: string;
          earned_at?: number;
          n?: number;
        }>(
          w.accountId
            ? [
                db
                  .prepare(
                    `SELECT SUM(km) AS km, SUM(tap_km) AS tap_km, SUM(tap_moved_km) AS tap_moved_km FROM daily_km
                     WHERE day = ? AND account_id = ?`,
                  )
                  .bind(day, w.accountId),
                db
                  .prepare(`SELECT DISTINCT day FROM pings WHERE account_id = ? AND day <= ? ORDER BY day DESC LIMIT 400`)
                  .bind(w.accountId, day),
                db.prepare(`SELECT option FROM votes WHERE round = ? AND account_id = ? LIMIT 1`).bind(round, w.accountId),
                db
                  .prepare(
                    `SELECT SUM(CASE WHEN day = ? THEN taps ELSE 0 END) AS taps_today, SUM(taps) AS taps_all FROM daily_km
                     WHERE account_id = ?`,
                  )
                  .bind(day, w.accountId),
                db.prepare(`SELECT badge, earned_at FROM badges WHERE player_key = ?`).bind(w.key),
                db.prepare(`SELECT COUNT(*) AS n FROM votes WHERE account_id = ?`).bind(w.accountId),
                db
                  .prepare(`SELECT COUNT(*) AS n FROM daily_km WHERE account_id = ? AND km > 0 AND day >= ? AND day <= ?`)
                  .bind(w.accountId, halfFrom, halfTo),
                db.prepare(`SELECT COUNT(*) AS n FROM recruits WHERE recruiter_key = ? AND status = 'recruit'`).bind(w.key),
              ]
            : [
                db.prepare(`SELECT km, tap_km, tap_moved_km FROM daily_km WHERE day = ? AND device_id = ?`).bind(day, w.deviceId),
                db
                  .prepare(`SELECT day FROM pings WHERE device_id = ? AND day <= ? ORDER BY day DESC LIMIT 400`)
                  .bind(w.deviceId, day),
                db.prepare(`SELECT option FROM votes WHERE round = ? AND device_id = ?`).bind(round, w.deviceId),
                db
                  .prepare(
                    `SELECT SUM(CASE WHEN day = ? THEN taps ELSE 0 END) AS taps_today, SUM(taps) AS taps_all FROM daily_km
                     WHERE device_id = ?`,
                  )
                  .bind(day, w.deviceId),
                db.prepare(`SELECT badge, earned_at FROM badges WHERE player_key = ?`).bind(w.key),
                db.prepare(`SELECT COUNT(*) AS n FROM votes WHERE device_id = ?`).bind(w.deviceId),
                db
                  .prepare(`SELECT COUNT(*) AS n FROM daily_km WHERE device_id = ? AND km > 0 AND day >= ? AND day <= ?`)
                  .bind(w.deviceId, halfFrom, halfTo),
                db.prepare(`SELECT COUNT(*) AS n FROM recruits WHERE recruiter_key = ? AND status = 'recruit'`).bind(w.key),
              ],
        );
        voteOpt = votes.results[0]?.option ?? null;
        kmToday = km.results[0]?.km ?? 0;
        tapKmToday = km.results[0]?.tap_km ?? 0;
        tapMovedToday = km.results[0]?.tap_moved_km ?? 0;
        tapsToday = clicks.results[0]?.taps_today ?? 0;
        tapsAll = clicks.results[0]?.taps_all ?? 0;
        for (const r of badgeRows.results) badges.set(r.badge as BadgeId, r.earned_at!);
        votesTotal = voteCount.results[0]?.n ?? 0;
        pushedBeforeHalfway = (half.results[0]?.n ?? 0) > 0;
        recruits = recruitCount.results[0]?.n ?? 0;
        pingDays = pings.results.map((r) => r.day!);
      } catch (err) {
        console.error("device read failed", err);
      }
      // Km credited but not yet flushed to D1 are only in memory.
      for (const p of this.d1Pending.values()) {
        if (p.day !== day || (w.accountId ? p.accountId !== w.accountId : p.deviceId !== w.deviceId)) continue;
        kmToday += p.km;
        tapKmToday += p.tapKm;
        tapMovedToday += p.tapMovedKm;
        tapsToday += p.taps;
      }
      // Taps credited but not yet flushed, from any day, count towards all time.
      for (const p of this.d1Pending.values()) {
        if (w.accountId ? p.accountId === w.accountId : p.deviceId === w.deviceId) tapsAll += p.taps;
      }
      const entry: DeviceEntry = {
        day,
        kmToday,
        tapKmToday,
        tapMovedToday,
        tapsToday,
        tapsAll,
        badges,
        votesTotal,
        bestStreak: longestStreak(pingDays),
        pushedBeforeHalfway,
        recruits,
        pingedToday: pingDays[0] === day,
        pingStreakDays: streak(pingDays, now),
        lastPingDay: pingDays[0] ?? null,
        voteRound: round,
        voteOption: voteOpt,
        tokens: have?.tokens ?? TAP_BUCKET,
        refilledAt: have?.refilledAt ?? Date.now(),
      };
      this.devices.set(w.key, entry);
      return entry;
    })();
    this.loadingDevices.set(w.key, promise);
    try {
      return await promise;
    } finally {
      this.loadingDevices.delete(w.key);
    }
  }

  private today(dev: DeviceEntry): DeviceToday {
    const yesterday = utcDay(this.now() - DAY_MS);
    const alive = dev.lastPingDay === dev.day || dev.lastPingDay === yesterday;
    return {
      kmToday: dev.kmToday,
      tapKmToday: dev.tapKmToday,
      tapMovedToday: dev.tapMovedToday,
      tapsToday: dev.tapsToday,
      tapsAll: dev.tapsAll,
      badges: badgeList(dev),
      pingedToday: dev.pingedToday,
      pingStreakDays: alive ? dev.pingStreakDays : 0,
      vote: dev.voteRound === this.vote.round && dev.voteOption !== null ? { round: dev.voteRound, option: dev.voteOption } : null,
    };
  }

  // ---------- Devices: the idle game ----------

  /** A player's progress (key: Who.key), from memory or this object's SQLite; a new player starts at zero, now. */
  private prog(key: string, now: number): ProgressEntry {
    const have = this.progress.get(key);
    if (have) return have;
    const row = this.sql.exec<ProgressRow>(`SELECT * FROM progress WHERE device_id = ?`, key).toArray()[0];
    const entry: ProgressEntry = row
      ? {
          creditsMilli: row.credits_milli,
          levels: { cold: row.cold, ion: row.ion, sail: row.sail, hands: row.hands, chant: row.chant },
          patches: row.patches,
          kmSinceShift: row.km_since_shift,
          settledAt: row.settled_at,
          lastDistance: row.last_distance,
          lastArrivalAt: row.last_arrival_at,
          lastMissionId: row.last_mission_id,
        }
      : {
          creditsMilli: 0,
          levels: zeroLevels(),
          patches: 0,
          kmSinceShift: 0,
          settledAt: now,
          lastDistance: null,
          lastArrivalAt: null,
          lastMissionId: null,
        };
    this.progress.set(key, entry);
    return entry;
  }

  /** The `progress` tables' device_id column holds the player key (a device id, or a:<account id>). */
  private writeProgress(key: string) {
    const p = this.progress.get(key);
    if (!p) return;
    this.sql.exec(
      `INSERT INTO progress (device_id, credits_milli, cold, ion, sail, hands, chant, patches, km_since_shift,
         settled_at, auto_kms, last_distance, last_arrival_at, last_mission_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (device_id) DO UPDATE SET credits_milli = excluded.credits_milli, cold = excluded.cold, ion = excluded.ion,
         sail = excluded.sail, hands = excluded.hands, chant = excluded.chant, patches = excluded.patches,
         km_since_shift = excluded.km_since_shift, settled_at = excluded.settled_at, auto_kms = excluded.auto_kms,
         last_distance = excluded.last_distance, last_arrival_at = excluded.last_arrival_at,
         last_mission_id = excluded.last_mission_id`,
      key,
      p.creditsMilli,
      p.levels.cold,
      p.levels.ion,
      p.levels.sail,
      p.levels.hands,
      p.levels.chant,
      p.patches,
      p.kmSinceShift,
      p.settledAt,
      autoKmS(p.levels, p.patches),
      p.lastDistance,
      p.lastArrivalAt,
      p.lastMissionId,
    );
  }

  /** Marks progress for the next save (or writes it now: purchases and leaving matter). */
  private touch(key: string, now = false) {
    this.d1Progress.add(key);
    this.scheduleD1Flush();
    if (now) {
      this.writeProgress(key);
      this.dirtyProgress.delete(key);
    } else {
      this.dirtyProgress.add(key);
      this.scheduleProgressSave();
    }
  }

  /** Km this player pushed: 1 credit per km plus the crew's planet tech, prestige progress and today's km. Km in full (no balancing). */
  private earn(w: Who, p: ProgressEntry, dev: DeviceEntry, km: number, fromTaps: boolean) {
    if (km <= 0) return;
    p.creditsMilli += Math.round(creditsFor(km, fromTaps, this.tech) * 1000);
    p.kmSinceShift += km;
    dev.kmToday += km;
    if (fromTaps) dev.tapKmToday += km;
    this.addPending(dev.day, w, km, fromTaps ? km : 0);
    this.scheduleD1Flush();
  }

  /** Of the time from `from` to `to`, how much the thrusters were awake (outages don't pay). */
  private awakeMs(from: number, to: number): number {
    if (to <= from) return 0;
    const m = this.mission;
    let ms = to - from;
    if (m.lastSafeFrom !== null && m.lastSafeTo !== null) ms -= overlap(from, to, m.lastSafeFrom, m.lastSafeTo);
    if (m.safeSince !== null) ms -= overlap(from, to, m.safeSince, Infinity);
    return Math.max(0, ms);
  }

  /** Pays auto-thrust for connected time since the last settle (in full; it already moved the probe). */
  private settleConnected(w: Who, p: ProgressEntry, dev: DeviceEntry, now: number) {
    if (now <= p.settledAt) return;
    const auto = autoKmS(p.levels, p.patches);
    if (auto > 0) this.earn(w, p, dev, (auto * this.awakeMs(p.settledAt, now)) / 1000, false);
    p.settledAt = now;
    this.touch(w.key);
  }

  /**
   * A device comes back: pays up to 8 hours of auto-thrust and adds it to the probe. Returns what welcome back needs.
   * Planet tech's extra offline minutes (E4b, Ceres) pay credits only: they never move the probe, so never trip speed.
   */
  private settleAway(w: Who, p: ProgressEntry, dev: DeviceEntry, now: number): Away | null {
    const from = p.settledAt;
    const awayMs = Math.max(0, now - from);
    const auto = autoKmS(p.levels, p.patches);
    const awake = this.awakeMs(from, now);
    const baseMs = Math.min(OFFLINE_CAP_MS, awake);
    const countedMs = Math.min(offlineCapMs(OFFLINE_CAP_MS, this.tech), awake);
    const baseKm = (auto * baseMs) / 1000;
    const extraKm = (auto * (countedMs - baseMs)) / 1000;
    const km = baseKm + extraKm;
    if (baseKm > 0) {
      this.earn(w, p, dev, baseKm, false);
      // The probe gets it too (decision 9), unless its thrusters are asleep right now.
      if (this.mission.safeSince === null) this.pushCrewKm(now, baseKm, "catchup");
    }
    if (extraKm > 0) p.creditsMilli += Math.round(creditsFor(extraKm, false, this.tech) * 1000);
    p.settledAt = now;
    this.touch(w.key);
    if (awayMs < WELCOME_MIN_AWAY_MS || km <= 0) return null;
    return { from, awayMs, countedMs, km };
  }

  /**
   * The welcome back summary. Called once the device is connected again, so the arrival estimate
   * includes its thrusters, as it did when it left.
   */
  private async welcomeFor(p: ProgressEntry, away: Away, now: number): Promise<WelcomeBack> {
    const { from, awayMs, countedMs, km } = away;
    const sameMission = p.lastMissionId === this.mission.id;
    const snap = this.snapshot(now);
    const arrival = this.arrivalNow(now);
    let keptAliveBy: WelcomeBack["keptAliveBy"] = null;
    try {
      const row = await this.env.DB.prepare(
        `SELECT COALESCE(a.name, d.name) AS name, p.at AS at FROM pings p JOIN devices d ON d.id = p.device_id
         LEFT JOIN accounts a ON a.id = p.account_id
         WHERE p.day >= ? AND p.at > ? AND p.at <= ? ORDER BY p.at DESC LIMIT 1`,
      )
        .bind(utcDay(from), from, now)
        .first<{ name: string; at: number }>();
      if (row) keptAliveBy = { name: row.name, at: row.at };
    } catch (err) {
      console.error("welcome ping read failed", err);
    }
    return {
      awayMs,
      countedMs,
      km,
      crewKm: sameMission && p.lastDistance !== null ? Math.max(0, snap.distanceKm - p.lastDistance) : null,
      // How the arrival date moved while you were away (at today's pace, as the home screen shows it).
      arrivalSoonerMs: sameMission && p.lastArrivalAt !== null && arrival !== null ? p.lastArrivalAt - arrival : null,
      keptAliveBy,
    };
  }

  private me(p: ProgressEntry): Progress {
    return {
      credits: p.creditsMilli / 1000,
      levels: { ...p.levels },
      patches: p.patches,
      kmSinceShift: p.kmSinceShift,
      autoKmS: autoKmS(p.levels, p.patches),
      tapKm: tapKm(p.levels, p.patches),
    };
  }

  /** After a purchase or a handover: every tab of this player carries its new auto-thrust. */
  private retag(key: string, auto: number) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && whoOf(a).key === key) ws.serializeAttachment({ ...a, auto } satisfies Attachment);
    }
    this.online = null;
  }

  /** Sends this player's progress to all its tabs and devices (after a buy elsewhere, or /admin). */
  private sendMe(key: string, p: ProgressEntry, except?: WebSocket) {
    const msg: ServerMessage = { t: "me", seq: 0, ok: true, now: this.now(), me: this.me(p) };
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && whoOf(a).key === key) this.send(ws, msg);
    }
  }

  private buy(w: Who, p: ProgressEntry, key: UpgradeKey, now: number): boolean {
    const level = p.levels[key];
    const costMilli = upgradeCost(key, level, this.tech.priceCut) * 1000;
    if (level >= MAX_LEVEL || p.creditsMilli < costMilli) return false;
    p.creditsMilli -= costMilli;
    p.levels[key] = level + 1;
    this.changed(w, p, now);
    return true;
  }

  /** "Hand over the shift": upgrades and credits back to zero for 3 Mission Patches. */
  private prestige(w: Who, p: ProgressEntry, now: number): boolean {
    if (p.kmSinceShift < PRESTIGE_AT_KM) return false;
    p.creditsMilli = 0;
    p.levels = zeroLevels();
    p.kmSinceShift = 0;
    p.patches += PATCHES_PER_SHIFT;
    this.changed(w, p, now);
    return true;
  }

  private changed(w: Who, p: ProgressEntry, now: number) {
    this.touch(w.key, true);
    this.retag(w.key, autoKmS(p.levels, p.patches));
    this.retune(now);
  }

  // ---------- Messages to browsers ----------

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // The socket closed under us; webSocketClose tidies up.
    }
  }

  private broadcast() {
    if (this.broadcastTimer !== undefined) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = undefined;
    this.lastBroadcastAt = Date.now();
    const now = this.now();
    const msg = JSON.stringify({ t: "state", now, probe: this.snapshot(now) } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      try {
        ws.send(msg);
      } catch {
        // ignore; see send()
      }
    }
  }

  /** At most one update a second, and only when something changed. */
  private scheduleBroadcast() {
    if (this.broadcastTimer) return;
    const wait = Math.max(0, BROADCAST_MS - (Date.now() - this.lastBroadcastAt));
    this.broadcastTimer = setTimeout(() => this.broadcast(), wait);
  }

  // ---------- WebSocket (hibernation API) ----------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const deviceId = request.headers.get("X-Device-Id");
    if (!deviceId) return new Response("No device", { status: 400 });
    const w = who(deviceId, request.headers.get("X-Account-Id"));
    await this.checkSignal();
    await this.checkVote();
    await this.checkMilestones();

    const now = this.now();
    const dev = await this.device(w, now);
    const p = this.prog(w.key, now);
    // Connected auto-thrust is activity: it wakes a paused probe (before any catch-up is added to it).
    if (autoKmS(p.levels, p.patches) > 0) await this.wake(deviceId, now);
    // Another tab (or device, on an account) is already here: it never left. Otherwise it's back from time away.
    const alreadyHere = this.onlineDevices().has(w.key);
    let away: Away | null = null;
    if (alreadyHere) this.settleConnected(w, p, dev, now);
    else away = this.settleAway(w, p, dev, now);

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.online = null;
    server.serializeAttachment({
      deviceId,
      accountId: w.accountId,
      auto: autoKmS(p.levels, p.patches),
      since: Date.now(),
      tz: request.headers.get("X-Timezone"),
    } satisfies Attachment);
    this.retune(now); // people here and auto-thrust changed
    const welcome = away ? await this.welcomeFor(p, away, now) : null;

    this.send(server, { t: "hello", now, probe: this.snapshot(now), me: this.me(p), welcome, ...this.today(dev) });
    await this.checkBadges(w, dev, p, now); // anything earned before badges existed, or while away
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 200) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || !Number.isInteger(msg.seq)) return;

    await this.checkSignal();
    await this.checkVote();
    const att = ws.deserializeAttachment() as Attachment;
    const { deviceId } = att;
    const w = whoOf(att);
    if (Date.now() - (att.seen ?? 0) >= SEEN_EVERY_MS) ws.serializeAttachment({ ...att, seen: Date.now() } satisfies Attachment);
    const dev = await this.device(w, this.now());
    const now = this.now();
    const p = this.prog(w.key, now);
    this.settleConnected(w, p, dev, now);

    if (msg.t === "buy" || msg.t === "prestige") {
      let ok = false;
      if (msg.t === "prestige") ok = this.prestige(w, p, now);
      else if (UPGRADE_KEYS.includes(msg.key)) ok = this.buy(w, p, msg.key, now);
      this.send(ws, { t: "me", seq: msg.seq, ok, now, me: this.me(p) });
      if (ok) this.sendMe(w.key, p, ws); // the player's other tabs and devices
      if (ok && msg.t === "prestige") await this.checkBadges(w, dev, p, now); // Mission Patch
      if (ok && autoKmS(p.levels, p.patches) > 0) await this.wake(deviceId, now); // connected auto-thrust
      return;
    }

    if (msg.t !== "taps" || !Number.isInteger(msg.n) || msg.n < 0 || msg.n > MAX_TAPS_PER_MESSAGE) return;
    // Any tap batch is activity: it keeps the probe awake, or wakes it (decision 5).
    if (msg.n > 0) await this.wake(deviceId, now);
    if (msg.n > 0) await this.maybeStartBurn(); // an hour out: these taps already count for the burn

    // Refill the device's bucket for the real time that passed, then take what it can afford.
    const real = Date.now();
    dev.tokens = Math.min(TAP_BUCKET, dev.tokens + ((real - dev.refilledAt) / 1000) * MAX_TAPS_PER_S);
    dev.refilledAt = real;
    // In safe mode the thrusters sleep: taps count for nothing until someone pings.
    const taps = this.mission.safeSince === null ? Math.min(msg.n, Math.floor(dev.tokens)) : 0;
    dev.tokens -= taps;

    // "You've clicked": only the taps credited here count (not those over the cap, or in safe mode).
    if (taps > 0) {
      const before = dev.tapsAll;
      dev.tapsToday += taps;
      dev.tapsAll += taps;
      // 50 credited taps make a newcomer who came through a crew link a recruit (checked once).
      if (before < RECRUIT_TAPS && dev.tapsAll >= RECRUIT_TAPS) await this.convertRecruit(w, now);
      this.addPending(dev.day, w, 0, 0, 0, taps);
      this.scheduleD1Flush();
      // The click badges, and Night Shift for taps between 02:00 and 04:59 the player's local time.
      const hour = localHour(att.tz, now);
      const night = hour !== null && hour >= NIGHT_SHIFT_FROM_HOUR && hour < NIGHT_SHIFT_TO_HOUR;
      await this.checkBadges(w, dev, p, now, night ? ["night-shift"] : []);
    }
    const km = taps * tapKm(p.levels, p.patches);
    if (km > 0) {
      this.earn(w, p, dev, km, true);
      this.touch(w.key);
      // What these taps moved the shared probe: "your taps today got us there X sooner".
      const moved = this.pushCrewKm(now, km, "taps");
      dev.tapMovedToday += moved;
      this.addPending(dev.day, w, 0, 0, moved);
    }

    this.send(ws, {
      t: "credited",
      seq: msg.seq,
      taps,
      km,
      now,
      probe: this.snapshot(now),
      me: this.me(p),
      ...this.today(dev),
    });
    if (km > 0) await this.checkMilestones(); // taps may have carried the probe past one
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.online = null;
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
    if (!this.dead.has(ws)) await this.left(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.online = null;
    if (!this.dead.has(ws)) await this.left(ws);
  }

  /**
   * A tab closed (or went silent, `at` being its last heartbeat). If it was the device's last,
   * the device is away from then: pay it up to then and note where the probe was.
   */
  private async left(ws: WebSocket, at?: number) {
    const a = ws.deserializeAttachment() as Attachment | null;
    const now = this.now();
    // Its auto-thrust was connected until now (or its last heartbeat): activity, for the idle pause.
    if (a && a.auto > 0) this.mission.lastActiveAt = Math.max(this.mission.lastActiveAt, Math.min(now, at ?? now));
    if (a && !this.onlineDevices(ws).has(whoOf(a).key)) {
      const w = whoOf(a);
      const dev = await this.device(w, now);
      const p = this.prog(w.key, now);
      this.settleConnected(w, p, dev, Math.min(now, at ?? now));
      p.lastDistance = distanceAt(this.moving(), now);
      p.lastArrivalAt = this.arrivalNow(now);
      p.lastMissionId = this.mission.id;
      this.touch(w.key, true);
    }
    this.retune(now, ws); // people here and auto-thrust changed
  }

  // ---------- Accounts (phase 8a, called over RPC by worker/auth.ts) ----------

  /**
   * A device signed in: its progress moves into the account's (decision 18: the higher level of each
   * upgrade, the higher patch count, credits and km added together), its history is attached to the
   * account, and its sockets reconnect as the account.
   */
  async signIn(deviceId: string, accountId: string): Promise<void> {
    await this.checkSignal();
    const now = this.now();
    const guest = who(deviceId, null);
    const acct = who(deviceId, accountId);
    const online = this.onlineDevices();

    // Pay both up to now first, so nothing is lost or counted twice.
    const hadGuest =
      this.progress.has(guest.key) ||
      this.sql.exec(`SELECT 1 FROM progress WHERE device_id = ?`, guest.key).toArray().length > 0;
    const gp = hadGuest ? this.prog(guest.key, now) : null;
    if (gp) {
      const gDev = await this.device(guest, now);
      if (online.has(guest.key)) this.settleConnected(guest, gp, gDev, now);
      else this.settleAway(guest, gp, gDev, now);
    }
    const ap = this.prog(acct.key, now);
    const aDev = await this.device(acct, now);
    if (online.has(acct.key)) this.settleConnected(acct, ap, aDev, now);
    else this.settleAway(acct, ap, aDev, now);

    if (gp) {
      for (const k of UPGRADE_KEYS) ap.levels[k] = Math.max(ap.levels[k], gp.levels[k]);
      ap.patches = Math.max(ap.patches, gp.patches);
      ap.creditsMilli += gp.creditsMilli;
      ap.kmSinceShift += gp.kmSinceShift;
      this.progress.delete(guest.key);
      this.dirtyProgress.delete(guest.key);
      this.d1Progress.delete(guest.key);
      this.sql.exec(`DELETE FROM progress WHERE device_id = ?`, guest.key);
    }
    this.touch(acct.key, true);

    // The device's km, pings and votes now count for the account (km not yet flushed included).
    for (const [key, p] of this.d1Pending) {
      if (p.deviceId !== deviceId) continue;
      p.accountId = accountId;
      this.dirtyQueue.add(key);
    }
    this.scheduleProgressSave();
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(`DELETE FROM progress WHERE device_id = ?`).bind(guest.key),
        this.env.DB.prepare(`UPDATE daily_km SET account_id = ? WHERE device_id = ? AND account_id IS NULL`).bind(accountId, deviceId),
        this.env.DB.prepare(`UPDATE pings SET account_id = ? WHERE device_id = ? AND account_id IS NULL`).bind(accountId, deviceId),
        this.env.DB.prepare(`UPDATE votes SET account_id = ? WHERE device_id = ? AND account_id IS NULL`).bind(accountId, deviceId),
        // Badges: the account keeps every badge either had (the earlier date where both have one).
        this.env.DB.prepare(
          `INSERT INTO badges (player_key, badge, earned_at) SELECT ?, badge, earned_at FROM badges WHERE player_key = ?
           ON CONFLICT (player_key, badge) DO UPDATE SET earned_at = MIN(earned_at, excluded.earned_at)`,
        ).bind(acct.key, guest.key),
        this.env.DB.prepare(`DELETE FROM badges WHERE player_key = ?`).bind(guest.key),
        // Passport stamps (E4b part 2a): the legs this device helped on as a guest are the account's now,
        // named in their credits like any signed-in crew member.
        this.env.DB.prepare(
          `INSERT INTO mission_crew (mission_id, player_key, account_id, name, country, km, taps)
           SELECT c.mission_id, ?, a.id, a.name, COALESCE(a.country, c.country), c.km, c.taps
           FROM mission_crew c JOIN accounts a ON a.id = ? WHERE c.player_key = ?
           ON CONFLICT (mission_id, player_key) DO UPDATE SET km = km + excluded.km, taps = taps + excluded.taps`,
        ).bind(acct.key, accountId, guest.key),
        this.env.DB.prepare(`DELETE FROM mission_crew WHERE player_key = ?`).bind(guest.key),
        // Recruits brought in as a guest now count for the account (phase S2).
        this.env.DB.prepare(`UPDATE recruits SET recruiter_key = ? WHERE recruiter_key = ?`).bind(acct.key, guest.key),
      ]);
    } catch (err) {
      console.error("attaching history failed", err);
    }
    this.devices.delete(guest.key);
    this.devices.delete(acct.key); // re-read with the attached history

    // This device's tabs reconnect as the account (they're closed quietly: already settled above).
    this.dropDevice((a) => a.deviceId === deviceId, "signed in");
    this.retune(now);
  }

  /** A device signed out: its tabs reconnect (the browser gets a fresh guest device). The account keeps its progress. */
  async signOut(deviceId: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.deviceId !== deviceId) continue;
      try {
        ws.close(4001, "signed out"); // webSocketClose settles the account as it leaves
        this.online = null;
      } catch {
        // already closing
      }
    }
  }

  /** An account was deleted: its progress goes, and its tabs everywhere reconnect as guests. */
  async deleteAccount(accountId: string): Promise<void> {
    const key = who("", accountId).key;
    this.dropDevice((a) => a.accountId === accountId, "account deleted");
    this.progress.delete(key);
    this.dirtyProgress.delete(key);
    this.d1Progress.delete(key);
    this.devices.delete(key);
    this.sql.exec(`DELETE FROM progress WHERE device_id = ?`, key);
    for (const [key, p] of this.d1Pending) {
      if (p.accountId !== accountId) continue;
      p.accountId = null;
      this.dirtyQueue.add(key);
    }
    this.scheduleProgressSave();
    this.retune(this.now());
  }

  /** Closes matching sockets without settling them as they go (the caller has dealt with their progress). */
  private dropDevice(match: (a: Attachment) => boolean, reason: string) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a || !match(a)) continue;
      this.dead.add(ws);
      try {
        ws.close(4001, reason);
        this.online = null;
      } catch {
        // already closing
      }
    }
  }

  // ---------- /admin (called over RPC by the Worker, after it checks the key) ----------

  /** Today's UTC day by the probe's clock (the leaderboards and profile use it, so /admin clock moves agree). */
  async boardDay(): Promise<string> {
    return utcDay(this.now());
  }

  async adminState(): Promise<AdminState> {
    await this.checkSignal();
    const now = this.now();
    const players = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM progress`).toArray()[0]?.n ?? 0;
    return {
      probe: this.snapshot(now),
      setbackMs: setbackMs(this.mission.safeSince, probeClock(this.mission, now)),
      serverNow: now,
      clockOffsetMs: this.clockOffsetMs,
      sockets: this.ctx.getWebSockets().length,
      lastSavedAt: this.lastSavedAt,
      lastD1FlushAt: this.lastD1FlushAt,
      rowsWritten: { ...this.rows },
      crewRawKmS: this.hourKmS(now),
      autoRawKmS: this.autoRaw(),
      lastActiveAt: this.mission.lastActiveAt,
      pausesAt: this.pausesAt(),
      players,
    };
  }

  async adminSetDistance(km: number): Promise<AdminState> {
    const now = this.now();
    this.rebase(now);
    this.mission.distanceKm = Math.max(0, Math.min(this.mission.routeKm, km));
    // A jump isn't speed: today's pace starts again from here.
    this.track = [];
    this.sql.exec(`DELETE FROM track`);
    this.sample(true);
    return this.adminCommit();
  }

  /**
   * E4b part 2b test control: moves the probe to `minutes` from arrival at today's pace and starts the landing burn
   * (landing in `minutes`, with this bar `target`). Wakes it or ends safe mode first, like a ping would.
   */
  async adminStartBurn(minutes: number, target: number): Promise<AdminState> {
    const m = this.mission;
    if (m.arrivedAt !== null || this.burn) return this.adminState();
    const now = this.now();
    this.rebase(now);
    if (m.pausedSince !== null) {
      m.pausedSince = null;
      m.at = now;
    }
    if (m.safeSince !== null) {
      m.lastSafeFrom = m.safeSince;
      m.lastSafeTo = now;
      m.safeSince = null;
    }
    m.lastActiveAt = now;
    const ms = Math.round(minutes * MINUTE_MS);
    const left = m.routeKm - m.distanceKm;
    m.distanceKm = m.routeKm - Math.min(left, Math.max(1, this.todayPace(now)) * (ms / 1000));
    this.track = [];
    this.sql.exec(`DELETE FROM track`);
    this.sample(true);
    await this.startBurn(now, ms, target);
    return this.adminCommit();
  }

  /** E4b test control: the current leg launched `days` ago (so an arrival now earns that day's medal). */
  async adminSetLegStart(days: number): Promise<AdminState> {
    const now = this.now();
    const m = this.mission;
    m.startedAt = now - Math.round(days * DAY_MS);
    this.sql.exec(`UPDATE mission SET started_at = ? WHERE id = ?`, m.startedAt, m.id);
    try {
      await this.env.DB.prepare(`UPDATE missions SET started_at = ? WHERE id = ?`).bind(m.startedAt, m.id).run();
    } catch (err) {
      console.error("leg start in D1 failed", err);
    }
    return this.adminCommit();
  }

  /**
   * Moves the mission clock forward: the probe coasts through those hours, and the signal may run out.
   * With no tap and no connected auto-thrust for 8 hours, the probe pauses part-way.
   */
  async adminMoveClock(hours: number): Promise<AdminState> {
    this.rebase(this.now());
    this.clockOffsetMs += Math.round(hours * 3_600_000);
    return this.adminCommit();
  }

  /**
   * Sets the signal to run out in `seconds`. 0 drops the probe into safe mode now.
   * A positive value also ends safe mode, without a setback (a test override, not a ping).
   */
  async adminSetSignal(seconds: number): Promise<AdminState> {
    const now = this.now();
    this.rebase(now);
    this.mission.signalDeadline = probeClock(this.mission, now) + seconds * 1000;
    if (seconds > 0 && this.mission.safeSince !== null) {
      this.mission.lastSafeFrom = this.mission.safeSince;
      this.mission.lastSafeTo = now;
      this.mission.safeSince = null;
    }
    this.lastPingAt = 0;
    return this.adminCommit();
  }

  /** Lets this device ping again today (testing only): removes today's ping row. */
  async adminClearPing(deviceId: string, accountId: string | null): Promise<AdminState> {
    const day = utcDay(this.now());
    await this.env.DB.prepare(`DELETE FROM pings WHERE day = ? AND (device_id = ? OR (? IS NOT NULL AND account_id = ?))`)
      .bind(day, deviceId, accountId, accountId)
      .run();
    this.devices.delete(who(deviceId, accountId).key);
    this.lastPingAt = 0;
    return this.adminState();
  }

  /** Closes today's vote now (its effect applies) and opens the next round. */
  async adminCloseVote(): Promise<AdminState> {
    await this.rollVote();
    return this.adminState();
  }

  /** Lets this device vote again in the current round (testing only). */
  async adminClearVote(deviceId: string, accountId: string | null): Promise<AdminState> {
    const round = this.vote.round;
    const mine = `round = ? AND (device_id = ? OR (? IS NOT NULL AND account_id = ?))`;
    const row = await this.env.DB.prepare(`SELECT option FROM votes WHERE ${mine} LIMIT 1`)
      .bind(round, deviceId, accountId, accountId)
      .first<{ option: number }>();
    if (row) {
      await this.env.DB.prepare(`DELETE FROM votes WHERE ${mine}`).bind(round, deviceId, accountId, accountId).run();
      if (this.vote.round === round && (this.vote.tallies[row.option] ?? 0) > 0) {
        this.vote.tallies[row.option] -= 1;
        this.sql.exec(`UPDATE vote_round SET tallies = ? WHERE round = ?`, JSON.stringify(this.vote.tallies), round);
      }
    }
    const dev = this.devices.get(who(deviceId, accountId).key);
    if (dev) {
      dev.voteRound = round;
      dev.voteOption = null;
    }
    this.broadcast();
    return this.adminState();
  }

  /** Gives this player km for testing: credits and prestige progress (not the probe). */
  async adminGive(deviceId: string, accountId: string | null, km: number): Promise<AdminState> {
    const now = this.now();
    const key = who(deviceId, accountId).key;
    const p = this.prog(key, now);
    p.creditsMilli += Math.round(km * 1000);
    p.kmSinceShift += km;
    this.touch(key, true);
    this.sendMe(key, p);
    return this.adminState();
  }

  /**
   * "Reset mission (keep players)", decision 6 (the launch reset): a new mission at 0 km, starting now on
   * real time, with a full signal, no milestones reached, a fresh vote round and an empty mission log
   * (the log shows the current mission only). Devices, pings, streaks, progress, credits, upgrades and
   * patches are all kept.
   */
  async adminResetMission(): Promise<AdminState> {
    // Pay connected devices up to now, then restart their clocks at real time.
    const before = this.now();
    for (const w of this.onlinePlayers().values()) {
      const p = this.progress.get(w.key);
      if (p) this.settleConnected(w, p, await this.device(w, before), before);
    }
    this.clockOffsetMs = 0;
    const now = this.now();
    for (const [id, p] of this.progress) {
      if (p.settledAt > now) {
        p.settledAt = now;
        this.touch(id);
      }
    }
    this.sql.exec(`UPDATE progress SET settled_at = ? WHERE settled_at > ?`, now, now);
    this.pace.clear();
    this.catchup.clear();
    this.dirtyMinutes.clear();
    this.devices.clear(); // pings and km per day are re-read from D1
    this.lastPingAt = 0;
    this.sql.exec(`DELETE FROM pace`);
    this.sql.exec(`DELETE FROM meta WHERE key IN ('crew_base_kms', 'last_arrival_mission')`); // the tour starts again from Earth
    this.lastArrival = null;
    await this.startMission(this.mission.id + 1);
    this.loadTech(); // a new tour: no planet tech yet
    await this.abandonVote(now);
    await this.openVote(now);
    return this.adminCommit();
  }

  /**
   * The launch wipe (phase B2, prompts 83-85): the game starts fresh. Everyone's progress, km, pings and streaks,
   * votes, the log, milestones, missions, stamps and medals, the planet tech, every badge but Early Beta, recruits
   * and share counts go; accounts, their sessions, devices (names and countries), crew links and Early Beta badges
   * stay. The probe sets off from Earth for Mars on real time, with the next mission number (so every browser
   * still sees the next arrival). Open games are closed without saving and reconnect to the fresh game.
   * Back up D1 first (docs/todo.md): this can't be undone.
   */
  async adminLaunchWipe(): Promise<AdminState> {
    const nextId = this.mission.id + 1;
    // 1. Close every open game without settling it (its progress is about to go); browsers reconnect.
    for (const ws of this.ctx.getWebSockets()) {
      this.dead.add(ws);
      try {
        ws.close(4002, "launch");
      } catch {
        // already closing
      }
    }
    this.online = null;
    // 2. Nothing waiting to be saved may come back afterwards.
    for (const t of [this.saveTimer, this.progressTimer, this.d1Timer, this.broadcastTimer]) if (t !== undefined) clearTimeout(t);
    this.saveTimer = this.progressTimer = this.d1Timer = this.broadcastTimer = undefined;
    this.d1Pending.clear();
    this.dirtyQueue.clear();
    this.dirtyProgress.clear();
    this.d1Progress.clear();
    this.progress.clear();
    this.devices.clear();
    this.loadingDevices.clear();
    this.pace.clear();
    this.catchup.clear();
    this.dirtyMinutes.clear();
    this.track = [];
    this.reached = [];
    this.burn = null;
    this.lastArrival = null;
    this.lastPingAt = 0;
    this.idling = { n: 0, at: 0 };
    this.clockOffsetMs = 0;
    this.dirty = false;
    // 3. This object's own storage.
    for (const table of ["progress", "d1_queue", "pace", "track", "milestone_reached", "vote_round", "mission"]) this.sql.exec(`DELETE FROM ${table}`);
    this.sql.exec(`DELETE FROM meta WHERE key IN ('crew_base_kms', 'last_arrival_mission', 'clock_offset_ms')`);
    this.savedOffset = null;
    // 4. D1: everything but accounts, sessions, sign-in tokens, devices, crew links and Early Beta badges.
    const db = this.env.DB;
    await db.batch([
      db.prepare(`DELETE FROM daily_km`),
      db.prepare(`DELETE FROM pings`),
      db.prepare(`DELETE FROM votes`),
      db.prepare(`DELETE FROM vote_days`),
      db.prepare(`DELETE FROM log_entries`),
      db.prepare(`DELETE FROM milestones`),
      db.prepare(`DELETE FROM mission_crew`),
      db.prepare(`DELETE FROM missions`),
      db.prepare(`DELETE FROM progress`),
      db.prepare(`DELETE FROM badges WHERE badge <> 'early-beta'`),
      db.prepare(`DELETE FROM recruits`),
      db.prepare(`DELETE FROM share_counts`),
      db.prepare(`DELETE FROM network_caps`),
    ]);
    this.lastLogId = 0;
    // 5. A fresh tour from Earth, a fresh vote, and the first log entry.
    await this.startMission(nextId);
    this.loadTech();
    await this.openVote(this.now());
    await this.log(
      "launch",
      "Launch day",
      "Everyone starts fresh: OSC-1 sets off from Earth for Mars. Thank you to every Early Beta crew member who flew with us before launch.",
      {},
    );
    return this.adminCommit();
  }

  /** Ends the open round with no result and no effect (its mission is gone). */
  private async abandonVote(now: number) {
    const v = this.vote;
    this.sql.exec(`UPDATE vote_round SET closed_at = ?, winner = -1 WHERE round = ?`, now, v.round);
    try {
      await this.env.DB.prepare(`UPDATE vote_days SET closed_at = ?, winner = -1, effect_hours = 0 WHERE round = ?`)
        .bind(now, v.round)
        .run();
    } catch (err) {
      console.error("vote_days abandon failed", err);
    }
  }

  private async adminCommit(): Promise<AdminState> {
    // First, so a clock jump pauses the probe (or loses the signal) part-way rather than coasting through.
    await this.checkSignal(); // also re-arms the alarm
    const now = this.now();
    this.retune(now);
    this.dirty = true;
    this.save();
    this.saveProgress();
    this.saveSignal();
    await this.checkVote(); // the clock may have passed midnight
    await this.checkMilestones(); // the distance may have passed a milestone
    this.broadcast();
    return this.adminState();
  }
}

/** "40 minutes", "5 hours", "3 days", for the log. */
function span(ms: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (ms < 90 * MINUTE_MS) return plural(Math.max(1, Math.round(ms / MINUTE_MS)), "minute");
  if (ms < 2 * DAY_MS) return plural(Math.round(ms / 3_600_000), "hour");
  return plural(Math.round(ms / DAY_MS), "day");
}

/** How much of [a, b] falls inside [c, d]. */
function overlap(a: number, b: number, c: number, d: number): number {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

/** Consecutive ping days ending today or yesterday. `days` is newest first (YYYY-MM-DD). */
/** A player's badges as the app gets them. */
function badgeList(dev: DeviceEntry): EarnedBadge[] {
  return [...dev.badges].map(([id, at]) => ({ id, at }));
}

const hourFormats = new Map<string, Intl.DateTimeFormat>();
/** The hour (0–23) at `ms` in time zone `tz`, or null if the zone is unknown. */
function localHour(tz: string | null | undefined, ms: number): number | null {
  if (!tz) return null;
  try {
    let f = hourFormats.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz });
      hourFormats.set(tz, f);
    }
    return Number(f.format(ms));
  } catch {
    return null;
  }
}

function streak(days: string[], now: number): number {
  if (days.length === 0) return 0;
  const today = utcDay(now);
  const yesterday = utcDay(now - DAY_MS);
  if (days[0] !== today && days[0] !== yesterday) return 0;
  let n = 1;
  for (let i = 1; i < days.length; i++) {
    const expected = utcDay(Date.parse(`${days[i - 1]}T00:00:00Z`) - DAY_MS);
    if (days[i] !== expected) break;
    n += 1;
  }
  return n;
}
