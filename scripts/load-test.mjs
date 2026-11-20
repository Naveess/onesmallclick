// The phase 9a load test: simulated players all tapping the one shared probe at once.
//   node scripts/load-test.mjs                         (local: npm run dev must be running)
//   node scripts/load-test.mjs --players=100,500,1000 --seconds=45
//   node scripts/load-test.mjs https://… --live        (the live site: only with Nav's OK; see docs/load-test.md)
// Needs Node 22+ (built-in WebSocket). No dependencies.
//
// Each player gets its own device (GET /api/session), opens the probe's WebSocket, and sends a batch of taps
// every 2 s (BATCH_MS) like the real app, 4–15 taps a second. Stages add players on top of the ones already
// connected. For each stage it reports:
//   - how long the probe takes to answer a tap batch ("credited");
//   - how many "state" updates each player gets a second (the probe sends at most one a second);
//   - how late each update reaches players compared with the fastest one (the fan-out spread);
//   - connection failures and drops (each stage counts its own).
// It stops after a stage where most players are gone or answers take over 10 s.
// Every simulated player is a real device in that database and adds real km to that probe.

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:5173").replace(/\/$/, "");
const opt = (name, dflt) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? dflt;
const STAGES = opt("players", "100,500,1000").split(",").map(Number);
const SECONDS = Number(opt("seconds", "45"));
const BATCH_MS = 2_000;
const CONNECT_TIMEOUT_MS = 10_000;
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
if (!local && !args.includes("--live")) {
  console.error(`${base} isn't local. The live site needs --live (and Nav's OK: the players and km are real there).`);
  process.exit(1);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-GB") : "–");

/** One simulated player. Counters are reset at the start of each stage. */
class Player {
  constructor() {
    this.seq = 0;
    this.sentAt = new Map();
    this.reset();
    this.open = false;
    this.dropped = false;
  }
  reset() {
    this.acks = [];
    this.states = 0;
    this.offsets = []; // arrival time minus the server's `now`, per state message (same machine locally)
    this.batches = 0;
  }
  async start() {
    const res = await fetch(`${base}/api/session`, { headers: { Origin: base }, signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (!res.ok || !cookie) throw new Error(`session ${res.status}`);
    this.ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/probe`, { headers: { Cookie: cookie, Origin: base } });
    this.ws.onmessage = (e) => {
      if (e.data === "pong") return;
      const m = JSON.parse(e.data);
      const t = Date.now();
      if (m.t === "state") {
        this.states++;
        this.offsets.push(t - m.now);
      } else if (m.t === "credited") {
        const at = this.sentAt.get(m.seq);
        if (at) this.acks.push(t - at);
        this.sentAt.delete(m.seq);
      }
    };
    this.ws.onclose = () => {
      if (this.open) this.dropped = true;
      this.open = false;
    };
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("WebSocket timed out"));
        try {
          this.ws.close();
        } catch {
          // never opened
        }
      }, CONNECT_TIMEOUT_MS);
      this.ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket failed"));
      };
    });
    this.open = true;
    // Like the app: a batch every 2 s, starting at a random moment so players don't all send together.
    this.timer = setTimeout(() => {
      this.tick();
      this.timer = setInterval(() => this.tick(), BATCH_MS);
    }, Math.random() * BATCH_MS);
  }
  tick() {
    if (!this.open) return;
    const n = 8 + Math.floor(Math.random() * 23); // 8–30 taps in 2 s: 4–15 a second
    const seq = ++this.seq;
    this.sentAt.set(seq, Date.now());
    this.batches++;
    this.ws.send(JSON.stringify({ t: "taps", n, seq }));
  }
  stop() {
    clearTimeout(this.timer);
    clearInterval(this.timer);
    this.open = false;
    try {
      this.ws?.close();
    } catch {
      // already closed
    }
  }
}

const players = [];
const rows = [];
console.log(`Load test against ${base}: stages ${STAGES.join(", ")} players, ${SECONDS} s each.
`);

for (const target of STAGES) {
  // Top up to `target` live players, 25 at a time. Each stage counts only its own failures and drops.
  const t0 = Date.now();
  let failed = 0;
  const droppedBefore = players.filter((p) => p.dropped).length;
  const need = target - players.filter((p) => p.open).length;
  while (players.filter((p) => p.open).length < target && failed <= Math.max(5, need / 10)) {
    const batch = Math.min(25, target - players.filter((p) => p.open).length);
    const started = await Promise.allSettled(
      Array.from({ length: batch }, async () => {
        const p = new Player();
        await p.start();
        return p;
      }),
    );
    for (const s of started) s.status === "fulfilled" ? players.push(s.value) : failed++;
  }
  const connectS = (Date.now() - t0) / 1000;
  await wait(4_000); // settle
  for (const p of players) p.reset();
  const mem0 = process.memoryUsage().rss;
  await wait(SECONDS * 1000);

  const live = players.filter((p) => p.open);
  const acks = live.flatMap((p) => p.acks);
  // Fan-out spread: per player, how much later than the fastest player's offset its updates arrive (median).
  const offs = live.flatMap((p) => p.offsets);
  const best = offs.length ? Math.min(...offs) : 0;
  const spread = live.map((p) => pct(p.offsets.map((o) => o - best), 50)).filter(Number.isFinite);
  const batches = live.reduce((s, p) => s + p.batches, 0);
  const row = {
    players: target,
    connected: live.length,
    failed,
    dropped: players.filter((p) => p.dropped).length - droppedBefore,
    connectS: connectS.toFixed(1),
    batchesPerS: (batches / SECONDS).toFixed(0),
    ackP50: pct(acks, 50),
    ackP95: pct(acks, 95),
    ackMax: pct(acks, 100),
    unanswered: live.reduce((s, p) => s + p.sentAt.size, 0),
    statesPerS: (live.reduce((s, p) => s + p.states, 0) / Math.max(1, live.length) / SECONDS).toFixed(2),
    spreadP50: pct(spread, 50),
    spreadP95: pct(spread, 95),
    clientMb: Math.round(Math.max(mem0, process.memoryUsage().rss) / 1e6),
  };
  rows.push(row);
  console.log(
    `${target} players: ${row.connected} connected (${failed} failed, ${row.dropped} dropped) in ${row.connectS} s · ${row.batchesPerS} tap batches/s · ` +
      `answer p50 ${fmt(row.ackP50)} ms, p95 ${fmt(row.ackP95)} ms, max ${fmt(row.ackMax)} ms · ${row.statesPerS} updates/s each · ` +
      `fan-out spread p50 ${fmt(row.spreadP50)} ms, p95 ${fmt(row.spreadP95)} ms`,
  );
  // A stage that fell over (most players gone, or answers over 10 s) makes the next ones meaningless.
  if (row.connected < target / 2 || !(row.ackP95 < 10_000)) {
    console.log(`Stopping: the probe didn't hold ${target} players.`);
    break;
  }
}

console.log("\n| Players | Connected | Failed | Dropped | Tap batches/s | Answer p50 | p95 | max | Unanswered | Updates/s each | Spread p50 | p95 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(
    `| ${r.players} | ${r.connected} | ${r.failed} | ${r.dropped} | ${r.batchesPerS} | ${fmt(r.ackP50)} ms | ${fmt(r.ackP95)} ms | ${fmt(r.ackMax)} ms | ${r.unanswered} | ${r.statesPerS} | ${fmt(r.spreadP50)} ms | ${fmt(r.spreadP95)} ms |`,
  );
}
for (const p of players) p.stop();
await wait(500);
process.exit(0);
