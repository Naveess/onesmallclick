import { BATCH_MS, type ClientMessage, type ServerMessage } from "../../shared/mission";

// The browser's line to the shared probe: makes sure we have a device cookie (/api/session),
// keeps one WebSocket open to /api/probe, reconnects with growing waits, and sends the
// tap count every BATCH_MS. The store (store.ts) decides what to show.

export type Connection = "connecting" | "live" | "offline";

interface Handlers {
  onMessage: (msg: ServerMessage) => void;
  onConnection: (c: Connection) => void;
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

export function startProbe(h: Handlers) {
  if (started) return;
  started = true;
  handlers = h;
  void connect();
  window.setInterval(flush, BATCH_MS);
  // Send what's left when the tab is hidden or closed.
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
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

async function connect() {
  handlers.onConnection(attempt === 0 ? "connecting" : "offline");
  try {
    const res = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new Error(`session ${res.status}`);
  } catch {
    retry();
    return;
  }

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
    }
    handlers.onMessage(msg);
    if (msg.t === "hello") flush();
  };
  socket.onclose = () => {
    if (ws === socket) ws = null;
    handlers.onDropped();
    retry();
  };
}

function retry() {
  handlers.onConnection("offline");
  // 1 s, 2 s, 4 s … up to 30 s, with some jitter so a server restart doesn't get everyone at once.
  const wait = Math.min(30_000, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
  attempt += 1;
  window.setTimeout(() => void connect(), wait);
}
