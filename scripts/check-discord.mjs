// Local check of phase Q1b-1: the Discord bot. Locally there's no webhook, so posts are only listed in /admin
// (each marked "not sent: no webhook set"); the batching, the rate limit and the Discord message itself are checked
// here as pure functions, and against a stand-in webhook on a local port.
//   node scripts/check-discord.mjs [http://localhost:5173]
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DISCORD_GAP_MS, DISCORD_MAX_EMBEDS, cleanWebhook, nextBatch, postForLog, sendToDiscord } from "../worker/discord.ts";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(`${ROOT}/.dev.vars`, "utf-8"))[1];
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = async (action, body) =>
  (
    await fetch(`${base}/api/admin/${action}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    })
  ).json();

// ---------- What gets posted ----------
const kinds = ["milestone", "arrival", "vote_result", "branch_open", "branch_result", "burn_start", "signal_lost", "signal_restored", "close_save", "goal", "launch"];
check(kinds.every((k) => postForLog(k, "T", "B", {}) !== null), "every moment in decisions 29-31 (and the goal) is posted");
check(["probe_idle", "probe_woken", "leg_start", "whatever"].every((k) => postForLog(k, "T", "B", {}) === null), "idle, woken and leg-start stay out of Discord");
check(postForLog("arrival", "Arrived at Mars", "Day 3.", { medal: "gold" })?.title === "Arrived at Mars · Gold medal", "an arrival carries its medal");
check(postForLog("arrival", "Arrived at Mars", "Day 3.", {})?.title === "Arrived at Mars", "…and none when there's no medal");
check(postForLog("signal_lost", "Signal lost", "x", {})?.tone === "orange" && postForLog("vote_result", "x", "y", {})?.tone === "blue", "orange for signal and celebration, blue for action");

// ---------- Batching and the one-a-minute limit ----------
const rows = Array.from({ length: 14 }, (_, i) => ({ at: 1000 + i, id: i }));
let b = nextBatch(rows, 5_000_000, 5_000_000 - 10_000);
check(b.send.length === 0 && b.waitMs === DISCORD_GAP_MS - 10_000, "10 s after the last post: wait 50 s");
b = nextBatch(rows, 5_000_000, 5_000_000 - DISCORD_GAP_MS);
check(b.send.length === DISCORD_MAX_EMBEDS && b.send[0].id === 0, `a minute on: the oldest ${DISCORD_MAX_EMBEDS} go together, nothing is lost (the other 4 wait)`);
b = nextBatch(rows.slice(0, 3), 5_000_000, 0);
check(b.send.length === 3, "a quiet channel: 3 waiting moments go in one post at once");
b = nextBatch(rows, 5_000_000, 0, 5_000_000 + 30_000);
check(b.send.length === 0 && b.waitMs === 30_000, "Discord said wait 30 s: we wait");
check(nextBatch([], 1, 0).send.length === 0, "nothing queued, nothing sent");

// ---------- The message Discord gets (a stand-in webhook) ----------
let last = null;
let reply = { status: 204, body: "" };
const server = createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    last = JSON.parse(data);
    res.writeHead(reply.status, { "Content-Type": "application/json", ...(reply.headers ?? {}) });
    res.end(reply.body);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const hook = `http://127.0.0.1:${server.address().port}/hook`;
const site = "https://onesmallclick.example";
const posts = [
  { tone: "orange", title: "Milestone 2: Past the Moon", text: "384,400 km (238,900 miles) from Earth. @everyone look" },
  { tone: "blue", title: "x".repeat(400), text: "y".repeat(5000) },
];
let out = await sendToDiscord(hook, posts, site, true);
check(out.status === "sent", "a 204 from Discord is a sent post");
check(last.embeds.length === 2 && last.embeds[0].url === site, "two moments are two embeds, each linking back to the game");
check(last.embeds[0].color === 0xffb37a && last.embeds[1].color === 0x8ccfff, "the tokens' orange and blue");
check(last.embeds[1].title.length <= 256 && last.embeds[1].description.length <= 4096, "over-long text is cut to Discord's limits");
check(Array.isArray(last.allowed_mentions.parse) && last.allowed_mentions.parse.length === 0, "nobody can be pinged, whatever the text says");
reply = { status: 429, body: JSON.stringify({ retry_after: 2.5 }) };
out = await sendToDiscord(hook, posts, site, true);
check(out.status === "retry" && out.retryAfterMs === 2500, "a 429 says when to retry");
reply = { status: 500, body: "" };
out = await sendToDiscord(hook, posts, site, true);
check(out.status === "retry", "a Discord error is retried");
reply = { status: 404, body: "{}" };
out = await sendToDiscord(hook, posts, site, true);
check(out.status === "failed" && out.code === 404, "a deleted webhook is a refusal, not a retry loop");
check((await sendToDiscord("", posts, site)).status === "off" && (await sendToDiscord(undefined, posts, site)).status === "off", "no webhook set: nothing is sent");
// Prompt 113: a pasted secret with spaces, a line break or quotes still works; anything that isn't a webhook says so.
check(cleanWebhook(' "https://discord.com/api/webhooks/1/abc"' + String.fromCharCode(10)) ==="https://discord.com/api/webhooks/1/abc", "a webhook pasted with quotes, spaces or a line break is cleaned");
out = await sendToDiscord("https://example.com/hook", posts, site);
check(out.status === "failed" && /isn't a Discord webhook/.test(out.detail), "an address that isn't a Discord webhook is refused, with the reason");
check((await sendToDiscord(hook, posts, site)).status === "failed", "a local address is refused outside the checks");
reply = { status: 404, body: JSON.stringify({ message: "Unknown Webhook", code: 10015 }) };
out = await sendToDiscord(hook, posts, site, true);
check(out.status === "failed" && /HTTP 404 .*Unknown Webhook/.test(out.detail), "Discord's own reason comes back for /admin (" + out.detail + ")");
server.close();

// ---------- On the probe (local: listed in /admin, not sent) ----------
await admin("reset", {});
await wait(1500);
let s = await admin("state");
check(s.discord && s.discord.webhook === false, "/admin shows there's no webhook locally");
// Only this run's posts count (earlier runs leave theirs in the list).
const startId = Math.max(0, ...s.discord.recent.map((p) => p.id)) - 1;
const titles = () => admin("state").then((x) => x.discord.recent.filter((p) => p.id > startId).map((p) => p.title));
check((await titles()).includes("Today's crew vote is open"), "the daily vote opening is queued");
const vote = (await admin("state")).discord.recent.find((p) => p.title === "Today's crew vote is open");
check(/•/.test(vote.text) && /00:00 UTC/.test(vote.text), "…with its options and when it closes");
check(vote.note === "not sent: no webhook set" && vote.sentAt > 0, "…and marked as not sent, since there's no webhook");

// The signal's final hour: once per outage.
await admin("signal", { seconds: 5 * 3600 });
await wait(1500);
check(!(await titles()).includes("The signal is in its final hour"), "5 hours left: no final-hour post");
await admin("signal", { seconds: 50 * 60 });
await wait(1500);
let t = await titles();
check(t.filter((x) => x === "The signal is in its final hour").length === 1, "under an hour left: the final-hour post, once");
await admin("clock", { hours: 0.01 });
await wait(1000);
t = await titles();
check(t.filter((x) => x === "The signal is in its final hour").length === 1, "…and not again for the same outage");

// Safe mode.
await admin("signal", { seconds: 0 });
await wait(1500);
check((await titles()).includes("Signal lost: the probe is in safe mode"), "safe mode is posted");

// The crew goal, a vote result and a test post.
await admin("close-vote", {});
await wait(1500);
check((await titles()).some((x) => /^Crew chose|^No votes today/.test(x)), "the vote result is posted");
await admin("discord-test", {});
await wait(1500);
check((await titles()).includes("Test post from /admin"), "the /admin test post is queued");
s = await admin("state");
check(s.discord.pending === 0, "nothing is left waiting (locally the queue empties at once)");

await admin("reset", {});
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
