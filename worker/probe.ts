import { DurableObject } from "cloudflare:workers";
import {
  BASE_TAP_KM,
  BATCH_MS,
  COAST_KM_S,
  MAX_TAPS_PER_S,
  PACE_WINDOW_MIN,
  ROUTE_KM,
  SIGNAL_URGENT_S,
  SIGNAL_WINDOW_MS,
  distanceAt,
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

// The one shared probe. Every browser holds a WebSocket to this object (hibernation API, so an
// idle crew costs almost nothing). It:
//   - credits batched taps, capped per device (a token bucket: MAX_TAPS_PER_S, a few seconds deep);
//   - keeps the distance as "km at time `at`" and lets coasting run on the clock;
//   - keeps the signal: a deadline, an alarm when it runs out, safe mode until someone pings;
//   - sends an update to everyone when something changes, at most once a second (no ticking timer);
//   - saves the distance to its own SQLite at most every 5 s (the signal straight away),
//     and daily km to D1 every 30 s.
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

interface Mission {
  id: number;
  destination: string;
  /** Grows with each safe-mode setback (decision: the probe drifted off course). */
  routeKm: number;
  startedAt: number;
  distanceKm: number;
  at: number;
  signalDeadline: number;
  safeSince: number | null;
}

interface DeviceEntry extends DeviceToday {
  day: string;
  /** The last UTC day this device pinged, for the streak. */
  lastPingDay: string | null;
  tokens: number;
  refilledAt: number; // real ms, so /admin clock jumps don't refill the bucket
}

interface Attachment {
  deviceId: string;
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
};

export class Probe extends DurableObject<Env> {
  private sql: SqlStorage;
  private mission!: Mission;
  private clockOffsetMs = 0;
  /** Tap km per minute (key: minute number), for the crew's pace. */
  private pace = new Map<number, number>();
  private dirtyMinutes = new Set<number>();
  private devices = new Map<string, DeviceEntry>();
  private loadingDevices = new Map<string, Promise<DeviceEntry>>();
  /** Km to add to D1's daily_km at the next flush (key: day|deviceId). */
  private d1Pending = new Map<string, { day: string; deviceId: string; km: number; tapKm: number }>();
  /** Real time of the last accepted ping (see JUST_SAVED_MS). */
  private lastPingAt = 0;

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
    ctx.blockConcurrencyWhile(() => this.load());
  }

  // ---------- Loading and saving ----------

  private async load() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mission (
      id INTEGER PRIMARY KEY, destination TEXT NOT NULL, route_km REAL NOT NULL,
      started_at INTEGER NOT NULL, distance_km REAL NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pace (minute INTEGER PRIMARY KEY, km REAL NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value REAL NOT NULL)`);
    // Phase 5 columns (the phase 4 table didn't have them).
    const cols = new Set(this.sql.exec<{ name: string }>(`PRAGMA table_info(mission)`).toArray().map((c) => c.name));
    if (!cols.has("signal_deadline")) this.sql.exec(`ALTER TABLE mission ADD COLUMN signal_deadline INTEGER`);
    if (!cols.has("safe_since")) this.sql.exec(`ALTER TABLE mission ADD COLUMN safe_since INTEGER`);

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
        signalDeadline: row.signal_deadline ?? this.now() + SIGNAL_WINDOW_MS,
        safeSince: row.safe_since,
      };
      if (row.signal_deadline === null) this.saveSignal();
    } else {
      await this.startMission(1);
    }

    const since = Math.floor(this.now() / MINUTE_MS) - 60;
    for (const p of this.sql.exec<{ minute: number; km: number }>(`SELECT minute, km FROM pace WHERE minute > ?`, since)) {
      this.pace.set(p.minute, p.km);
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
      signalDeadline: now + SIGNAL_WINDOW_MS,
      safeSince: null,
    };
    const m = this.mission;
    this.sql.exec(
      `INSERT OR REPLACE INTO mission (id, destination, route_km, started_at, distance_km, at, signal_deadline, safe_since)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id,
      m.destination,
      m.routeKm,
      now,
      0,
      now,
      m.signalDeadline,
      null,
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

  /** Writes the distance, pace and clock offset to this object's SQLite. */
  private save() {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.dirty) return;
    const m = this.mission;
    this.sql.exec(`UPDATE mission SET distance_km = ?, at = ? WHERE id = ?`, m.distanceKm, m.at, m.id);
    for (const minute of this.dirtyMinutes) {
      this.sql.exec(`INSERT OR REPLACE INTO pace (minute, km) VALUES (?, ?)`, minute, this.pace.get(minute) ?? 0);
    }
    this.dirtyMinutes.clear();
    const old = Math.floor(this.now() / MINUTE_MS) - 60;
    this.sql.exec(`DELETE FROM pace WHERE minute <= ?`, old);
    for (const minute of this.pace.keys()) if (minute <= old) this.pace.delete(minute);
    this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('clock_offset_ms', ?)`, this.clockOffsetMs);
    this.dirty = false;
    this.lastSavedAt = Date.now();
  }

  /** The signal, the route and the distance are saved straight away: they change rarely and matter. */
  private saveSignal() {
    const m = this.mission;
    this.sql.exec(
      `UPDATE mission SET route_km = ?, distance_km = ?, at = ?, signal_deadline = ?, safe_since = ? WHERE id = ?`,
      m.routeKm,
      m.distanceKm,
      m.at,
      m.signalDeadline,
      m.safeSince,
      m.id,
    );
    this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('clock_offset_ms', ?)`, this.clockOffsetMs);
  }

  private scheduleSave() {
    this.dirty = true;
    // A pending timer also keeps the object from hibernating before its memory is saved.
    this.saveTimer ??= setTimeout(() => this.save(), SAVE_MS);
  }

  /** Adds the batched km to D1 (daily_km) and marks the devices as seen. */
  private async flushD1() {
    if (this.d1Timer !== undefined) clearTimeout(this.d1Timer);
    this.d1Timer = undefined;
    if (this.d1Pending.size === 0) return;
    const batch = [...this.d1Pending.values()];
    this.d1Pending.clear();
    const seen = Date.now();
    const db = this.env.DB;
    const statements = batch.flatMap((p) => [
      db
        .prepare(
          `INSERT INTO daily_km (day, device_id, km, tap_km) VALUES (?, ?, ?, ?)
           ON CONFLICT (day, device_id) DO UPDATE SET km = km + excluded.km, tap_km = tap_km + excluded.tap_km`,
        )
        .bind(p.day, p.deviceId, p.km, p.tapKm),
      db.prepare(`UPDATE devices SET last_seen = ? WHERE id = ?`).bind(seen, p.deviceId),
    ]);
    try {
      await db.batch(statements);
      this.lastD1FlushAt = seen;
    } catch (err) {
      console.error("D1 flush failed; will retry", err);
      for (const p of batch) this.addPending(p.day, p.deviceId, p.km, p.tapKm);
      this.scheduleD1Flush();
    }
  }

  private scheduleD1Flush() {
    this.d1Timer ??= setTimeout(() => void this.flushD1(), D1_FLUSH_MS);
  }

  private addPending(day: string, deviceId: string, km: number, tapKm: number) {
    const key = `${day}|${deviceId}`;
    const p = this.d1Pending.get(key) ?? { day, deviceId, km: 0, tapKm: 0 };
    p.km += km;
    p.tapKm += tapKm;
    this.d1Pending.set(key, p);
  }

  /** One line in the mission log (shown in phase 7). A failure is logged, never fatal. */
  private async log(kind: string, title: string, body: string, data: object) {
    try {
      await this.env.DB.prepare(
        `INSERT INTO log_entries (mission_id, at, kind, title, body, data) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(this.mission.id, this.now(), kind, title, body, JSON.stringify(data))
        .run();
    } catch (err) {
      console.error("log entry failed", err);
    }
  }

  // ---------- The probe ----------

  private now() {
    return Date.now() + this.clockOffsetMs;
  }

  private coasting() {
    return { ...this.mission, coastKmS: COAST_KM_S };
  }

  private snapshot(now: number): ProbeSnapshot {
    const m = this.mission;
    return {
      missionId: m.id,
      destination: m.destination,
      missionStartedAt: m.startedAt,
      routeKm: m.routeKm,
      distanceKm: distanceAt(this.coasting(), now),
      at: now,
      coastKmS: COAST_KM_S,
      // In safe mode the thrusters sleep: the crew adds nothing (the design's "0 km/s from crew").
      crewKmS: m.safeSince === null ? this.crewKmS(now) : 0,
      online: this.online(),
      tapKm: BASE_TAP_KM,
      signalDeadline: m.signalDeadline,
      safeSince: m.safeSince,
    };
  }

  /** Moves the stored distance up to `now` (coasting), so km can be added on top. */
  private rebase(now: number) {
    this.mission.distanceKm = distanceAt(this.coasting(), now);
    this.mission.at = now;
  }

  /** Tap km over the last PACE_WINDOW_MIN minutes (this minute included), per second. */
  private crewKmS(now: number): number {
    const minute = Math.floor(now / MINUTE_MS);
    let km = 0;
    for (let i = 0; i < PACE_WINDOW_MIN; i++) km += this.pace.get(minute - i) ?? 0;
    const seconds = (PACE_WINDOW_MIN - 1) * 60 + (now % MINUTE_MS) / 1000;
    return km / Math.max(1, seconds);
  }

  /** Devices with an open socket (several tabs on one device count once). */
  private online(): number {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a) ids.add(a.deviceId);
    }
    return ids.size;
  }

  // ---------- The signal ----------

  /** The alarm fires when the signal runs out. Alarms run on real time, so take off the clock offset. */
  private async scheduleAlarm() {
    const m = this.mission;
    if (m.safeSince !== null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now(), m.signalDeadline - this.clockOffsetMs));
  }

  async alarm() {
    await this.checkSignal();
  }

  /** Enters safe mode if the deadline has passed (from the alarm, or if it's late). */
  private async checkSignal() {
    const m = this.mission;
    const now = this.now();
    if (m.safeSince !== null || now < m.signalDeadline) {
      if (m.safeSince === null) await this.scheduleAlarm();
      return;
    }
    this.rebase(now);
    m.safeSince = m.signalDeadline;
    this.saveSignal();
    await this.ctx.storage.deleteAlarm();
    this.broadcast();
    await this.log("signal_lost", "Signal lost", "Nobody pinged in time. The probe went quiet and slipped into safe mode.", {
      distanceKm: Math.round(m.distanceKm),
    });
  }

  /** A ping from a device: once per UTC day, first one wins in a close race. */
  async ping(deviceId: string, name: string): Promise<PingResult> {
    await this.checkSignal();
    const now = this.now();
    const m = this.mission;
    const dev = await this.device(deviceId, now);
    if (dev.pingedToday) return { ok: false, reason: "already-pinged" };
    if (Date.now() - this.lastPingAt < JUST_SAVED_MS) return { ok: false, reason: "just-saved" };

    const woke = m.safeSince !== null;
    const secondsLeft = woke ? 0 : Math.max(0, (m.signalDeadline - now) / 1000);
    const tier = tierFor(secondsLeft);
    const day = utcDay(now);

    // Claim the moment before awaiting D1, so a second ping in the same instant is "just saved".
    const prevLastPingAt = this.lastPingAt;
    this.lastPingAt = Date.now();
    let inserted = false;
    try {
      const res = await this.env.DB.prepare(
        `INSERT INTO pings (day, device_id, mission_id, at, seconds_left, tier) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (day, device_id) DO NOTHING`,
      )
        .bind(day, deviceId, m.id, now, secondsLeft, tier)
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
    let setback = 0;
    this.rebase(at);
    if (m.safeSince !== null) {
      setback = setbackMs(m.safeSince, at);
      m.routeKm += (setback / 1000) * COAST_KM_S; // drifted off course: more km to fly
      m.safeSince = null;
    }
    m.signalDeadline = at + SIGNAL_WINDOW_MS;
    this.saveSignal();
    await this.scheduleAlarm();

    const yesterday = utcDay(at - DAY_MS);
    dev.pingStreakDays = dev.lastPingDay === yesterday ? dev.pingStreakDays + 1 : 1;
    dev.lastPingDay = day;
    dev.pingedToday = true;
    this.broadcast();

    if (woke) {
      const days = setback / DAY_MS;
      void this.log("signal_restored", `Signal restored by ${name}`, `The probe woke up. Arrival moved ${days.toFixed(1)} days later.`, {
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

  // ---------- Devices ----------

  /** This device's km and ping for today, loaded from D1 once a day per device. */
  private async device(deviceId: string, now: number): Promise<DeviceEntry> {
    const day = utcDay(now);
    const have = this.devices.get(deviceId);
    if (have && have.day === day) return have;
    const loading = this.loadingDevices.get(deviceId);
    if (loading) return loading;
    const promise = (async () => {
      let kmToday = 0;
      let tapKmToday = 0;
      let pingDays: string[] = [];
      try {
        const [km, pings] = await this.env.DB.batch<{ km?: number; tap_km?: number; day?: string }>([
          this.env.DB.prepare(`SELECT km, tap_km FROM daily_km WHERE day = ? AND device_id = ?`).bind(day, deviceId),
          this.env.DB.prepare(`SELECT day FROM pings WHERE device_id = ? AND day <= ? ORDER BY day DESC LIMIT 400`).bind(
            deviceId,
            day,
          ),
        ]);
        kmToday = km.results[0]?.km ?? 0;
        tapKmToday = km.results[0]?.tap_km ?? 0;
        pingDays = pings.results.map((r) => r.day!);
      } catch (err) {
        console.error("device read failed", err);
      }
      // Km credited but not yet flushed to D1 are only in memory.
      const pending = this.d1Pending.get(`${day}|${deviceId}`);
      const entry: DeviceEntry = {
        day,
        kmToday: kmToday + (pending?.km ?? 0),
        tapKmToday: tapKmToday + (pending?.tapKm ?? 0),
        pingedToday: pingDays[0] === day,
        pingStreakDays: streak(pingDays, now),
        lastPingDay: pingDays[0] ?? null,
        tokens: have?.tokens ?? TAP_BUCKET,
        refilledAt: have?.refilledAt ?? Date.now(),
      };
      this.devices.set(deviceId, entry);
      return entry;
    })();
    this.loadingDevices.set(deviceId, promise);
    try {
      return await promise;
    } finally {
      this.loadingDevices.delete(deviceId);
    }
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

  private today(dev: DeviceEntry): DeviceToday {
    const yesterday = utcDay(this.now() - DAY_MS);
    const alive = dev.lastPingDay === dev.day || dev.lastPingDay === yesterday;
    return {
      kmToday: dev.kmToday,
      tapKmToday: dev.tapKmToday,
      pingedToday: dev.pingedToday,
      pingStreakDays: alive ? dev.pingStreakDays : 0,
    };
  }

  // ---------- WebSocket (hibernation API) ----------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const deviceId = request.headers.get("X-Device-Id");
    if (!deviceId) return new Response("No device", { status: 400 });
    await this.checkSignal();

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ deviceId } satisfies Attachment);

    const now = this.now();
    const dev = await this.device(deviceId, now);
    this.send(server, { t: "hello", now, probe: this.snapshot(now), ...this.today(dev) });
    this.scheduleBroadcast(); // people here changed
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
    if (msg?.t !== "taps" || !Number.isInteger(msg.n) || !Number.isInteger(msg.seq)) return;
    if (msg.n < 0 || msg.n > MAX_TAPS_PER_MESSAGE) return;

    await this.checkSignal();
    const { deviceId } = ws.deserializeAttachment() as Attachment;
    const dev = await this.device(deviceId, this.now());

    // Refill the device's bucket for the real time that passed, then take what it can afford.
    const real = Date.now();
    dev.tokens = Math.min(TAP_BUCKET, dev.tokens + ((real - dev.refilledAt) / 1000) * MAX_TAPS_PER_S);
    dev.refilledAt = real;
    // In safe mode the thrusters sleep: taps count for nothing until someone pings.
    const taps = this.mission.safeSince === null ? Math.min(msg.n, Math.floor(dev.tokens)) : 0;
    dev.tokens -= taps;

    const now = this.now();
    const km = taps * BASE_TAP_KM;
    if (km > 0) {
      this.rebase(now);
      this.mission.distanceKm = Math.min(this.mission.routeKm, this.mission.distanceKm + km);
      const minute = Math.floor(now / MINUTE_MS);
      this.pace.set(minute, (this.pace.get(minute) ?? 0) + km);
      this.dirtyMinutes.add(minute);
      dev.kmToday += km;
      dev.tapKmToday += km;
      this.addPending(dev.day, deviceId, km, km);
      this.scheduleSave();
      this.scheduleD1Flush();
      this.scheduleBroadcast();
    }

    this.send(ws, { t: "credited", seq: msg.seq, taps, km, now, probe: this.snapshot(now), ...this.today(dev) });
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
    this.scheduleBroadcast(); // people here changed
  }

  async webSocketError() {
    this.scheduleBroadcast();
  }

  // ---------- /admin (called over RPC by the Worker, after it checks the key) ----------

  async adminState(): Promise<AdminState> {
    await this.checkSignal();
    const now = this.now();
    return {
      probe: this.snapshot(now),
      setbackMs: setbackMs(this.mission.safeSince, now),
      serverNow: now,
      clockOffsetMs: this.clockOffsetMs,
      sockets: this.ctx.getWebSockets().length,
      lastSavedAt: this.lastSavedAt,
      lastD1FlushAt: this.lastD1FlushAt,
    };
  }

  async adminSetDistance(km: number): Promise<AdminState> {
    const now = this.now();
    this.mission.distanceKm = Math.max(0, Math.min(this.mission.routeKm, km));
    this.mission.at = now;
    return this.adminCommit();
  }

  /** Moves the mission clock forward: the probe coasts through those hours, and the signal may run out. */
  async adminMoveClock(hours: number): Promise<AdminState> {
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
    this.mission.signalDeadline = now + seconds * 1000;
    if (seconds > 0) this.mission.safeSince = null;
    this.lastPingAt = 0;
    return this.adminCommit();
  }

  /** Lets this device ping again today (testing only): removes today's ping row. */
  async adminClearPing(deviceId: string): Promise<AdminState> {
    const day = utcDay(this.now());
    await this.env.DB.prepare(`DELETE FROM pings WHERE day = ? AND device_id = ?`).bind(day, deviceId).run();
    this.devices.delete(deviceId);
    this.lastPingAt = 0;
    return this.adminState();
  }

  /** A fresh mission at 0 km, with the clock back to real time and a full signal. */
  async adminResetMission(): Promise<AdminState> {
    this.clockOffsetMs = 0;
    this.pace.clear();
    this.dirtyMinutes.clear();
    this.devices.clear(); // pings and km per day are re-read from D1
    this.lastPingAt = 0;
    this.sql.exec(`DELETE FROM pace`);
    await this.startMission(this.mission.id + 1);
    return this.adminCommit();
  }

  private async adminCommit(): Promise<AdminState> {
    this.dirty = true;
    this.save();
    this.saveSignal();
    await this.checkSignal(); // may enter safe mode (clock moved, timer set to 0); also re-arms the alarm
    this.broadcast();
    return this.adminState();
  }
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
