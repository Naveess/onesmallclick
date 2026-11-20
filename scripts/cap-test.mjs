// Phase 9a: checks the per-network cap locally (npm run dev must be running; needs .dev.vars with ADMIN_KEY).
//   node scripts/cap-test.mjs        (from the project folder)
// 51 fresh devices on one network ping and vote; the 51st of each is refused. Takes about 5 minutes,
// because the game accepts at most one ping every 5 seconds. Clears the local network_caps table.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = "http://localhost:5173";
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf-8"))[1];
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
let fails = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) fails++;
};
const d1 = (sql) =>
  JSON.parse(execSync(`npx wrangler d1 execute onesmallclick --local --json --command "${sql}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;

// Start clean: today's counts for this network.
d1("DELETE FROM network_caps");

async function device() {
  const res = await fetch(`${base}/api/session`, { headers: { Origin: base } });
  const c = res.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
  return { Cookie: c, Origin: base, "Content-Type": "application/json" };
}
const admin = async (action) => (await fetch(`${base}/api/admin/${action}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
const state = await admin("state");
const round = state.probe.vote.round;

const pings = [];
const votes = [];
// Pings: the game takes one every 5 s at most ("someone just saved it"), so space them out.
for (let i = 0; i < 51; i++) {
  const h = await device();
  votes.push(await (await fetch(`${base}/api/vote`, { method: "POST", headers: h, body: JSON.stringify({ token: TOKEN, round, option: i % 3 }) })).json());
  pings.push(await (await fetch(`${base}/api/ping`, { method: "POST", headers: h, body: JSON.stringify({ token: TOKEN }) })).json());
  if (i < 50) await new Promise((r) => setTimeout(r, 5_200));
}
const okP = pings.filter((p) => p.ok).length;
const okV = votes.filter((v) => v.ok).length;
check(okP === 50, `50 pings went through (${okP})`);
check(pings[50].ok === false && pings[50].reason === "busy-network", `the 51st ping is refused: ${JSON.stringify(pings[50])}`);
check(okV === 50, `50 votes went through (${okV})`);
check(votes[50].ok === false && votes[50].reason === "busy-network", `the 51st vote is refused: ${JSON.stringify(votes[50])}`);

const rows = d1("SELECT * FROM network_caps");
console.log(rows);
check(rows.length === 2 && rows.every((r) => r.count === 50), "one row per kind, each at 50");
check(rows.every((r) => /^[0-9a-f]{32}$/.test(r.net_hash)), "the network is stored only as a 32-hex hash");
const all = JSON.stringify(rows);
check(!/127\.0\.0\.1|::1|local/.test(all), "no address in the table");

const rep = await admin("networks");
console.log(rep);
check(rep.networks === 1 && rep.top[0].pings === 50 && rep.top[0].votes === 50 && rep.top[0].net.length === 8, "/admin report");

// An old day is cleared when a new count lands.
d1("DELETE FROM network_caps");
d1("INSERT INTO network_caps VALUES (1, 'old', 'ping', 3)");
await new Promise((r) => setTimeout(r, 5_200));
const h = await device();
await fetch(`${base}/api/ping`, { method: "POST", headers: h, body: JSON.stringify({ token: TOKEN }) });
const after = d1("SELECT day, kind, count FROM network_caps");
check(!after.some((r) => r.day === 1) && after.length === 1, `days before yesterday are cleared (${JSON.stringify(after)})`);
d1("DELETE FROM network_caps");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
