import { DurableObject } from "cloudflare:workers";
import {
  BASE_TAP_KM,
  BATCH_MS,
  COAST_KM_S,
  MAX_TAPS_PER_S,
  PACE_WINDOW_MIN,
  ROUTE_KM,
  distanceAt,
  utcDay,
  type AdminState,
  type ClientMessage,
  type DeviceToday,
  type ProbeSnapshot,
  type ServerMessage,
} from "../shared/mission";

// The one shared probe. Every browser holds a WebSocket to this object (hibernation API, so an
// idle crew costs almost nothing). It:
//   - credits batched taps, capped per device (a token bucket: MAX_TAPS_PER_S, a few seconds deep);
//   - keeps the distance as "km at time `at`" and lets coasting run on the clock;
//   - sends an update to everyone when something changes, at most once a second (no ticking timer);
//   - saves to its own SQLite at most every 5 s and to D1 (daily_km, devices.last_seen) every 30 s.
// All times are the server's clock plus the /admin clock offset.

const SAVE_MS = 5_000;
const D1_FLUSH_MS = 30_000;
const BROADCAST_MS = 1_000;
/** A device may bank this many taps: a full batch plus some network jitter. */
const TAP_BUCKET = MAX_TAPS_PER_S * (BATCH_MS / 1000) * 1.5;
/** Most taps a single message may claim; anything above is ignored as malformed. */
const MAX_TAPS_PER_MESSAGE = 1_000;
const MINUTE_MS = 60_000;

interface Mission {
  id: number;
  destination: string;
  routeKm: number;
  startedAt: number;
  distanceKm: number;
  at: number;
}

interface DeviceEntry extends DeviceToday {
  day: string;
  tokens: number;
  refilledAt: number; // real ms, so /admin clock jumps don't refill the bucket
}

interface Attachment {
  deviceId: string;
}

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

    const offset = this.sql.exec<{ value: number }>(`SELECT value FROM meta WHERE key = 'clock_offset_ms'`).toArray()[0];
    this.clockOffsetMs = offset?.value ?? 0;

    const row = this.sql
      .exec<{ id: number; destination: string; route_km: number; started_at: number; distance_km: number; at: number }>(
        `SELECT * FROM mission ORDER BY id DESC LIMIT 1`,
      )
      .toArray()[0];
    if (row) {
      this.mission = {
        id: row.id,
        destination: row.destination,
        routeKm: row.route_km,
        startedAt: row.started_at,
        distanceKm: row.distance_km,
        at: row.at,
      };
    } else {
      await this.startMission(1);
    }

    const since = Math.floor(this.now() / MINUTE_MS) - 60;
    for (const p of this.sql.exec<{ minute: number; km: number }>(`SELECT minute, km FROM pace WHERE minute > ?`, since)) {
      this.pace.set(p.minute, p.km);
    }
  }

  private async startMission(id: number) {
    const now = this.now();
    this.mission = { id, destination: "Mars", routeKm: ROUTE_KM, startedAt: now, distanceKm: 0, at: now };
    this.sql.exec(
      `INSERT OR REPLACE INTO mission (id, destination, route_km, started_at, distance_km, at) VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      this.mission.destination,
      this.mission.routeKm,
      now,
      0,
      now,
    );
    try {
      await this.env.DB.prepare(
        `INSERT OR IGNORE INTO missions (id, destination, route_km, started_at) VALUES (?, ?, ?, ?)`,
      )
        .bind(id, this.mission.destination, this.mission.routeKm, now)
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

  // ---------- The probe ----------

  private now() {
    return Date.now() + this.clockOffsetMs;
  }

  private snapshot(now: number): ProbeSnapshot {
    const m = this.mission;
    return {
      missionId: m.id,
      destination: m.destination,
      missionStartedAt: m.startedAt,
      routeKm: m.routeKm,
      distanceKm: distanceAt({ ...m, coastKmS: COAST_KM_S }, now),
      at: now,
      coastKmS: COAST_KM_S,
      crewKmS: this.crewKmS(now),
      online: this.online(),
      tapKm: BASE_TAP_KM,
    };
  }

  /** Moves the stored distance up to `now` (coasting), so km can be added on top. */
  private rebase(now: number) {
    const m = this.mission;
    m.distanceKm = distanceAt({ ...m, coastKmS: COAST_KM_S }, now);
    m.at = now;
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

  /** This device's km today, loaded from D1 once a day per device. */
  private async device(deviceId: string, now: number): Promise<DeviceEntry> {
    const day = utcDay(now);
    const have = this.devices.get(deviceId);
    if (have && have.day === day) return have;
    const loading = this.loadingDevices.get(deviceId);
    if (loading) return loading;
    const promise = (async () => {
      let kmToday = 0;
      let tapKmToday = 0;
      try {
        const row = await this.env.DB.prepare(`SELECT km, tap_km FROM daily_km WHERE day = ? AND device_id = ?`)
          .bind(day, deviceId)
          .first<{ km: number; tap_km: number }>();
        kmToday = row?.km ?? 0;
        tapKmToday = row?.tap_km ?? 0;
      } catch (err) {
        console.error("daily_km read failed", err);
      }
      // Km credited but not yet flushed to D1 are only in memory.
      const pending = this.d1Pending.get(`${day}|${deviceId}`);
      const entry: DeviceEntry = {
        day,
        kmToday: kmToday + (pending?.km ?? 0),
        tapKmToday: tapKmToday + (pending?.tapKm ?? 0),
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

  // ---------- WebSocket (hibernation API) ----------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const deviceId = request.headers.get("X-Device-Id");
    if (!deviceId) return new Response("No device", { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ deviceId } satisfies Attachment);

    const now = this.now();
    const today = await this.device(deviceId, now);
    this.send(server, {
      t: "hello",
      now,
      probe: this.snapshot(now),
      kmToday: today.kmToday,
      tapKmToday: today.tapKmToday,
    });
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

    const { deviceId } = ws.deserializeAttachment() as Attachment;
    const dev = await this.device(deviceId, this.now());

    // Refill the device's bucket for the real time that passed, then take what it can afford.
    const real = Date.now();
    dev.tokens = Math.min(TAP_BUCKET, dev.tokens + ((real - dev.refilledAt) / 1000) * MAX_TAPS_PER_S);
    dev.refilledAt = real;
    const taps = Math.min(msg.n, Math.floor(dev.tokens));
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

    this.send(ws, {
      t: "credited",
      seq: msg.seq,
      taps,
      km,
      now,
      probe: this.snapshot(now),
      kmToday: dev.kmToday,
      tapKmToday: dev.tapKmToday,
    });
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
    const now = this.now();
    return {
      probe: this.snapshot(now),
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

  /** Moves the mission clock forward: the probe coasts through those hours. */
  async adminMoveClock(hours: number): Promise<AdminState> {
    this.clockOffsetMs += Math.round(hours * 3_600_000);
    return this.adminCommit();
  }

  /** A fresh mission at 0 km, with the clock back to real time. */
  async adminResetMission(): Promise<AdminState> {
    this.clockOffsetMs = 0;
    this.pace.clear();
    this.dirtyMinutes.clear();
    this.sql.exec(`DELETE FROM pace`);
    await this.startMission(this.mission.id + 1);
    return this.adminCommit();
  }

  private async adminCommit(): Promise<AdminState> {
    this.dirty = true;
    this.save();
    this.broadcast();
    return this.adminState();
  }
}
