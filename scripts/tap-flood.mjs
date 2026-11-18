// Pretends to be a bot tapping 100 times a second, to check the server caps it.
//   node scripts/tap-flood.mjs                     (local: npm run dev must be running)
//   node scripts/tap-flood.mjs https://onesmallclick.naveessharma.workers.dev
// Needs Node 22+ (built-in WebSocket). It counts as one new device and adds real km.

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const SECONDS = 10;
const TAPS_PER_S = 100;

const res = await fetch(`${base}/api/session`);
const cookie = res.headers.get("set-cookie")?.split(";")[0];
if (!res.ok || !cookie) throw new Error(`No device cookie from ${base}/api/session (${res.status})`);
console.log(`device: ${(await res.json()).name}`);

const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/probe`, { headers: { Cookie: cookie, Origin: base } });
let sent = 0;
let credited = 0;
let seq = 0;

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.t === "credited") credited += msg.taps;
};
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error("WebSocket failed to open"));
});

const started = Date.now();
const timer = setInterval(() => {
  // One batch every 2 s, like the game, but claiming 100 taps a second.
  seq += 1;
  sent += TAPS_PER_S * 2;
  ws.send(JSON.stringify({ t: "taps", n: TAPS_PER_S * 2, seq }));
}, 2000);

await new Promise((r) => setTimeout(r, SECONDS * 1000 + 500));
clearInterval(timer);
await new Promise((r) => setTimeout(r, 800)); // last replies
ws.close();

const secs = (Date.now() - started) / 1000;
console.log(`claimed ${sent} taps, credited ${credited} (${(credited / secs).toFixed(1)} a second over ${secs.toFixed(1)} s)`);
console.log(credited / secs <= 20 ? "PASS: capped" : "FAIL: not capped");
process.exit(0);
