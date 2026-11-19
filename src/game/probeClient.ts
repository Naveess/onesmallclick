import { BATCH_MS, HEARTBEAT_MS, HEARTBEAT_PING, type ClientMessage, type ServerMessage } from "../../shared/mission";
import type { SessionInfo } from "../../shared/account";
import { HIDDEN_CLOSE_MS } from "../../shared/upgrades";

// The browser's line to the shared probe: makes sure we have a device cookie (/api/session),
// keeps one WebSocket open to /api/probe, reconnects with growing waits, and sends the
// tap count every BATCH_MS. A tab hidden for HIDDEN_CLOSE_MS closes its line, so it counts as
// away (the 8-hour offline cap applies) until it's visible again. The store (store.ts) decides what to show.

export type Connection = "connecting" | "live" | "offline";

interface Handlers {
  onMessage: (msg: ServerMessage) => void;
  onConnection: (c: Connection) => void;
  /** Who this browser is (name, crew number, account), from /api/session. */
  onSession: (info: SessionInfo) => void;
  /** Called when a socket drops: batches sent on it may or may not have been credited. */
  onDropped: () => void;
  /** How many taps are waiting to be sent; the client sends them and calls `sent`. */
  takeTaps: () => number;
  sent: (seq: number, n: number) => void;
}

let ws: WebSocket | null = null;
let started = false;
let attempt = 0;
let seq = 0;
let handlers: Handlers;
/** True while the tab has been hidden long enough to let the line go. */
let paused = false;
let hiddenTimer: number | undefined;
let retryTimer: number | undefined;

export function startProbe(h: Handlers) {
  if (started) return;
  started = true;
  handlers = h;
  void connect();
  window.setInterval(flush, BATCH_MS);
  // A heartbeat, so the server can tell a live tab from a phone that lost signal.
  window.setInterval(beat, HEARTBEAT_MS);
  // Leaving the page: send what's left and say goodbye properly (the page may be kept in the back/forward cache).
  window.addEventListener("pagehide", () => {
    flush();
    paused = true;
    window.clearTimeout(retryTimer);
    ws?.close(1000, "pagehide");
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && paused) resume();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
      window.clearTimeout(hiddenTimer);
      hiddenTimer = window.setTimeout(pause, HIDDEN_CLOSE_MS);
    } else {
      window.clearTimeout(hiddenTimer);
      if (paused) resume();
    }
  });
}

/** Sends the waiting taps now (used on the first message, so taps made while connecting count). */
export function flush() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const n = handlers.takeTaps();
  if (n <= 0) return;
  seq += 1;
  ws.send(JSON.stringify({ t: "taps", n, seq } satisfies ClientMessage));
  handlers.sent(seq, n);
}

function beat() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(HEARTBEAT_PING);
}

/** Sends a request (a buy or a handover). Returns its number, or null when the line is down. */
export function request(make: (seq: number) => ClientMessage): number | null {
  if (!ws || ws.readyState !== WebSocket.OPEN) return null;
  flush(); // taps first, so their credits count towards the purchase
  seq += 1;
  ws.send(JSON.stringify(make(seq)));
  return seq;
}

function pause() {
  if (document.visibilityState !== "hidden") return;
  paused = true;
  window.clearTimeout(retryTimer);
  flush();
  ws?.close(1000, "hidden");
}

function resume() {
  paused = false;
  attempt = 0;
  window.clearTimeout(retryTimer);
  if (!ws) void connect();
}

async function connect() {
  if (paused) return;
  handlers.onConnection(attempt === 0 ? "connecting" : "offline");
  try {
    const res = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new Error(`session ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as Partial<SessionInfo>;
    if (body.name) handlers.onSession({ name: body.name, crew: body.crew ?? 0, account: body.account ?? null });
  } catch {
    retry();
    return;
  }
  if (paused || ws) return;

  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/probe`);
  ws = socket;
  socket.onmessage = (e) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(e.data as string);
    } catch {
      return;
    }
    if (msg.t === "hello") {
      attempt = 0;
      handlers.onConnection("live");
      beat();
    }
    handlers.onMessage(msg);
    if (msg.t === "hello") flush();
  };
  socket.onclose = (e) => {
    if (ws === socket) ws = null;
    handlers.onDropped();
    if (paused) handlers.onConnection("offline");
    else if (e.code === 4001) {
      // Signed in or out (in this tab or another): come straight back as who we are now.
      attempt = 0;
      void connect();
    } else retry();
  };
}

function retry() {
  handlers.onConnection("offline");
  if (paused) return;
  // 1 s, 2 s, 4 s … up to 30 s, with some jitter so a server restart doesn't get everyone at once.
  const wait = Math.min(30_000, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
  attempt += 1;
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void connect(), wait);
}
