import { DurableObject } from "cloudflare:workers";
import {
  BATCH_MS,
  COAST_KM_S,
  CREW_WINDOW_MIN,
  DEAD_SOCKET_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  IDLE_PAUSE_MS,
  MAX_TAPS_PER_S,
  PACE_WINDOW_MIN,
  ROUTE_KM,
  SIGNAL_URGENT_S,
  SIGNAL_WINDOW_MS,
  arrivalAt,
  crewFactor,
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
} from "../shared/mission";
import { TODAY_PACE_MIN_MS, TODAY_PACE_MS } from "../shared/balance";
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
import { MILESTONES, type ReachedMilestone } from "../shared/milestones";
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
//   - saves to its own SQLite at most every 5 s (the signal and purchases straight away),
//     and daily km and progress to D1 every 30 s.
// All times are the server's clock plus the /admin clock offset.

const SAVE_MS = 5_000;
const D1_FLUSH_MS = 30_000;
const BROADCAST_MS = 1_000;
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

/** A player's numbers for today (km, ping, vote) and their tap allowance. */
interface DeviceEntry extends Omit<DeviceToday, "vote"> {
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
};

/** One sample of the probe's track, for today's pace. */
interface TrackPoint {
  at: number;
  distanceKm: number;
  movedMs: number;
}

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
  /** Km to add to D1's daily_km at the next flush (key: day|deviceId), with the account they count for. */
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
  private lastLogId = 0;
  /** Milestones the current mission has reached. */
  private reached: ReachedMilestone[] = [];
  /** The alarm time last set (real ms), so it's only rewritten when it changes. */
  private alarmAt = 0;
  /** Sockets found silent (see DEAD_SOCKET_MS), being closed. */
  private dead = new WeakSet<WebSocket>();

  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private d1Timer: ReturnType<typeof setTimeout> | undefined;
  private broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  private lastBroadcastAt = 0;
  private lastSavedAt = 0;
  private lastD1FlushAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
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
    ]) {
      if (!cols.has(col)) this.sql.exec(`ALTER TABLE mission ADD COLUMN ${col} ${type}`);
    }

    const offset = this.sql.exec<{ value: number }>(`SELECT value FROM meta WHERE key = 'clock_offset_ms'`).toArray()[0];
    this.clockOffsetMs = offset?.value ?? 0;

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
      };
      if (row.signal_deadline === null || row.moved_ms === null) this.saveSignal();
    } else {
      await this.startMission(1);
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

  private async startMission(id: number) {
    const now = this.now();
    this.mission = {
      id,
      destination: "Mars",
      routeKm: ROUTE_KM,
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
    this.track = [];
    this.sql.exec(`DELETE FROM track`);
    this.sample(true);
    const m = this.mission;
    this.sql.exec(
      `INSERT OR REPLACE INTO mission (id, destination, route_km, started_at, distance_km, at, signal_deadline, safe_since, auto_kms,
         moved_ms, last_active_at, paused_since)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
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
    );
    try {
      await this.env.DB.prepare(
        `INSERT OR IGNORE INTO missions (id, destination, route_km, started_at) VALUES (?, ?, ?, ?)`,
      )
        .bind(id, m.destination, m.routeKm, now)
        .run();
    } catch (err) {
      console.error("missions insert failed", err);
    }
  }

  /** Writes the distance, pace, progress and clock offset to this object's SQLite. */
  private save() {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.dirty && this.dirtyProgress.size === 0) return;
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
      this.sql.exec(`INSERT OR REPLACE INTO pace (minute, km) VALUES (?, ?)`, minute, this.pace.get(minute) ?? 0);
    }
    this.dirtyMinutes.clear();
    const old = Math.floor(this.now() / MINUTE_MS) - 60;
    this.sql.exec(`DELETE FROM pace WHERE minute <= ?`, old);
    for (const minute of this.pace.keys()) if (minute <= old) this.pace.delete(minute);
    for (const minute of this.catchup.keys()) if (minute <= old) this.catchup.delete(minute);
    this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('clock_offset_ms', ?)`, this.clockOffsetMs);
    for (const id of this.dirtyProgress) this.writeProgress(id);
    this.dirtyProgress.clear();
    this.dirty = false;
    this.lastSavedAt = Date.now();
  }

  /** The signal, the route and the distance are saved straight away: they change rarely and matter. */
  private saveSignal() {
    const m = this.mission;
    this.sql.exec(
      `UPDATE mission SET route_km = ?, distance_km = ?, at = ?, auto_kms = ?, signal_deadline = ?, safe_since = ?,
         last_safe_from = ?, last_safe_to = ?, moved_ms = ?, last_active_at = ?, paused_since = ? WHERE id = ?`,
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
      m.id,
    );
    this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('clock_offset_ms', ?)`, this.clockOffsetMs);
  }

  private scheduleSave() {
    this.dirty = true;
    // A pending timer also keeps the object from hibernating before its memory is saved.
    this.saveTimer ??= setTimeout(() => this.save(), SAVE_MS);
  }

  /** Adds the batched km to D1 (daily_km), copies changed progress there, and marks the devices as seen. */
  private async flushD1() {
    if (this.d1Timer !== undefined) clearTimeout(this.d1Timer);
    this.d1Timer = undefined;
    if (this.d1Pending.size === 0 && this.d1Progress.size === 0) return;
    const batch = [...this.d1Pending.values()];
    const progressIds = [...this.d1Progress];
    this.d1Pending.clear();
    this.d1Progress.clear();
    const seen = Date.now();
    const db = this.env.DB;
    const statements = batch.flatMap((p) => [
      db
        .prepare(
          `INSERT INTO daily_km (day, device_id, km, tap_km, tap_moved_km, taps, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (day, device_id) DO UPDATE SET km = km + excluded.km, tap_km = tap_km + excluded.tap_km,
             tap_moved_km = tap_moved_km + excluded.tap_moved_km, taps = taps + excluded.taps,
             account_id = COALESCE(excluded.account_id, daily_km.account_id)`,
        )
        .bind(p.day, p.deviceId, p.km, p.tapKm, p.tapMovedKm, p.taps, p.accountId),
      db.prepare(`UPDATE devices SET last_seen = ? WHERE id = ?`).bind(seen, p.deviceId),
    ]);
    for (const id of progressIds) {
      const p = this.progress.get(id);
      if (!p) continue;
      statements.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO progress (device_id, credits_milli, cold, ion, sail, hands, chant, patches,
               km_since_shift, settled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    try {
      await db.batch(statements);
      this.lastD1FlushAt = seen;
    } catch (err) {
      console.error("D1 flush failed; will retry", err);
      for (const p of batch) this.addPending(p.day, who(p.deviceId, p.accountId), p.km, p.tapKm, p.tapMovedKm, p.taps);
      for (const id of progressIds) this.d1Progress.add(id);
      this.scheduleD1Flush();
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

  /** The probe's motion: coasting plus connected auto-thrust, or nothing at all while it's paused. */
  private moving() {
    const m = this.mission;
    const paused = m.pausedSince !== null;
    return { ...m, coastKmS: paused ? 0 : COAST_KM_S, autoKmS: paused ? 0 : m.autoKmS };
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
    };
  }

  private liveVote(): LiveVote {
    const v = this.vote;
    return {
      round: v.round,
      question: VOTE_QUESTION,
      options: v.ids.map((id, i) => ({ id, label: voteOption(id)?.label ?? id, votes: v.tallies[i] ?? 0 })),
      closesAt: v.closesAt,
    };
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
    return COAST_KM_S + this.tapPaceKmS(now, PACE_WINDOW_MIN) * this.factor(now) + this.mission.autoKmS;
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
    return crewFactor(this.hourKmS(now) + this.autoRaw(except));
  }

  /** Open, live sockets' players and their raw auto-thrust (several tabs, or two devices on one account, count once). */
  private onlineDevices(except?: WebSocket): Map<string, number> {
    const ids = new Map<string, number>();
    const real = Date.now();
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
    m.autoKmS = m.safeSince === null && m.pausedSince === null ? raw * this.factor(now, except) : 0;
    this.scheduleSave();
    this.scheduleBroadcast();
  }

  /** Crew km arriving in one go (a tap batch or an offline catch-up): counted in full, balanced for the probe. Returns the km it moved the probe. */
  private pushCrewKm(now: number, rawKm: number, kind: "taps" | "catchup"): number {
    if (rawKm <= 0 || this.mission.pausedSince !== null) return 0;
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
    const cutoff = now - OFFLINE_CAP_MS;
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
      if (m.safeSince === null) at = Math.min(at, m.signalDeadline);
      const pauseAt = this.pausesAt();
      if (pauseAt !== null) at = Math.min(at, pauseAt);
      // When the probe reaches the next milestone without help (rounded up to the minute, so taps don't rewrite it).
      const next = MILESTONES.find((ms) => !this.reached.some((r) => r.n === ms.n));
      if (next) {
        const now = this.now();
        const left = next.km - distanceAt(this.moving(), now);
        const reach = left <= 0 ? now : now + (left / (COAST_KM_S + m.autoKmS)) * 1000;
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
    if (m.safeSince === null && m.signalDeadline <= until) await this.enterSafe(until);
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
    if (m.pausedSince !== null || this.autoRaw() > 0) return null;
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
    if (m.pausedSince === null) return;
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
    dev.lastPingDay = day;
    dev.pingedToday = true;
    this.broadcast();

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
    const now = this.now();
    const d = distanceAt(this.moving(), now);
    const fresh = MILESTONES.filter((ms) => ms.km <= d && !this.reached.some((r) => r.n === ms.n));
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
    const ids = pickOptions(round, recent);
    const closesAt = Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
    this.vote = { round, openedAt: now, closesAt, ids, tallies: ids.map(() => 0) };
    this.sql.exec(
      `INSERT INTO vote_round (round, opened_at, closes_at, options, tallies) VALUES (?, ?, ?, ?, ?)`,
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
    const v = this.vote;
    const m = this.mission;
    const total = v.tallies.reduce((a, b) => a + b, 0);
    const w = total > 0 ? winnerIndex(v.ids, v.tallies) : -1;
    this.sql.exec(`UPDATE vote_round SET closed_at = ?, winner = ?, tallies = ? WHERE round = ?`, now, w, JSON.stringify(v.tallies), v.round);

    const def = w >= 0 ? voteOption(v.ids[w]) : undefined;
    const hours = def?.hours ?? 0;
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
    await this.log("vote_result", `Crew chose: ${shortLabel(def.label)}`, `${pct}% of ${gb.format(total)} vote${total === 1 ? "" : "s"}. ${def.result}`, {
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
    this.sql.exec(`UPDATE vote_round SET tallies = ? WHERE round = ?`, JSON.stringify(this.vote.tallies), round);
    this.scheduleBroadcast();
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
      let kmToday = 0;
      let tapKmToday = 0;
      let tapMovedToday = 0;
      let tapsToday = 0;
      let tapsAll = 0;
      let pingDays: string[] = [];
      const round = this.vote.round;
      let voteOpt: number | null = null;
      const db = this.env.DB;
      try {
        const [km, pings, votes, clicks] = await db.batch<{
          km?: number | null;
          tap_km?: number | null;
          tap_moved_km?: number | null;
          day?: string;
          option?: number;
          taps_today?: number | null;
          taps_all?: number | null;
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
              ],
        );
        voteOpt = votes.results[0]?.option ?? null;
        kmToday = km.results[0]?.km ?? 0;
        tapKmToday = km.results[0]?.tap_km ?? 0;
        tapMovedToday = km.results[0]?.tap_moved_km ?? 0;
        tapsToday = clicks.results[0]?.taps_today ?? 0;
        tapsAll = clicks.results[0]?.taps_all ?? 0;
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
      `INSERT OR REPLACE INTO progress (device_id, credits_milli, cold, ion, sail, hands, chant, patches, km_since_shift,
         settled_at, auto_kms, last_distance, last_arrival_at, last_mission_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      this.scheduleSave();
    }
  }

  /** Km this player pushed: 1 credit per km, prestige progress and today's km. All in full (no balancing). */
  private earn(w: Who, p: ProgressEntry, dev: DeviceEntry, km: number, fromTaps: boolean) {
    if (km <= 0) return;
    p.creditsMilli += Math.round(km * 1000);
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

  /** A device comes back: pays up to 8 hours of auto-thrust and adds it to the probe. Returns what welcome back needs. */
  private settleAway(w: Who, p: ProgressEntry, dev: DeviceEntry, now: number): Away | null {
    const from = p.settledAt;
    const awayMs = Math.max(0, now - from);
    const auto = autoKmS(p.levels, p.patches);
    const countedMs = Math.min(OFFLINE_CAP_MS, this.awakeMs(from, now));
    const km = (auto * countedMs) / 1000;
    if (km > 0) {
      this.earn(w, p, dev, km, false);
      // The probe gets it too (decision 9), unless its thrusters are asleep right now.
      if (this.mission.safeSince === null) this.pushCrewKm(now, km, "catchup");
    }
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
    const costMilli = upgradeCost(key, level) * 1000;
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
    server.serializeAttachment({
      deviceId,
      accountId: w.accountId,
      auto: autoKmS(p.levels, p.patches),
      since: Date.now(),
    } satisfies Attachment);
    this.retune(now); // people here and auto-thrust changed
    const welcome = away ? await this.welcomeFor(p, away, now) : null;

    this.send(server, { t: "hello", now, probe: this.snapshot(now), me: this.me(p), welcome, ...this.today(dev) });
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
    ws.serializeAttachment({ ...att, seen: Date.now() } satisfies Attachment);
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
      if (ok && autoKmS(p.levels, p.patches) > 0) await this.wake(deviceId, now); // connected auto-thrust
      return;
    }

    if (msg.t !== "taps" || !Number.isInteger(msg.n) || msg.n < 0 || msg.n > MAX_TAPS_PER_MESSAGE) return;
    // Any tap batch is activity: it keeps the probe awake, or wakes it (decision 5).
    if (msg.n > 0) await this.wake(deviceId, now);

    // Refill the device's bucket for the real time that passed, then take what it can afford.
    const real = Date.now();
    dev.tokens = Math.min(TAP_BUCKET, dev.tokens + ((real - dev.refilledAt) / 1000) * MAX_TAPS_PER_S);
    dev.refilledAt = real;
    // In safe mode the thrusters sleep: taps count for nothing until someone pings.
    const taps = this.mission.safeSince === null ? Math.min(msg.n, Math.floor(dev.tokens)) : 0;
    dev.tokens -= taps;

    // "You've clicked": only the taps credited here count (not those over the cap, or in safe mode).
    if (taps > 0) {
      dev.tapsToday += taps;
      dev.tapsAll += taps;
      this.addPending(dev.day, w, 0, 0, 0, taps);
      this.scheduleD1Flush();
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
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
    if (!this.dead.has(ws)) await this.left(ws);
  }

  async webSocketError(ws: WebSocket) {
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
    for (const p of this.d1Pending.values()) if (p.deviceId === deviceId) p.accountId = accountId;
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(`DELETE FROM progress WHERE device_id = ?`).bind(guest.key),
        this.env.DB.prepare(`UPDATE daily_km SET account_id = ? WHERE device_id = ? AND account_id IS NULL`).bind(accountId, deviceId),
        this.env.DB.prepare(`UPDATE pings SET account_id = ? WHERE device_id = ? AND account_id IS NULL`).bind(accountId, deviceId),
        this.env.DB.prepare(`UPDATE votes SET account_id = ? WHERE device_id = ? AND account_id IS NULL`).bind(accountId, deviceId),
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
    for (const p of this.d1Pending.values()) if (p.accountId === accountId) p.accountId = null;
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
      } catch {
        // already closing
      }
    }
  }

  // ---------- /admin (called over RPC by the Worker, after it checks the key) ----------

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
    await this.startMission(this.mission.id + 1);
    await this.abandonVote(now);
    await this.openVote(now);
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
