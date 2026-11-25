// Local check of phase Q1b-2: opt-in notifications (Web Push). A stand-in push service on a local port plays the
// browsers' push services; three players subscribe to it, the Probe fires the alerts, and this checks who got what:
// the signature on every push, the three switches, "skip if you've pinged or voted", at most 3 a day, a gone
// browser being forgotten, what /api/notice answers, and the test alert. Local only (needs DEV_SIGN_IN_LINKS=1).
//   node scripts/check-push.mjs [http://localhost:5173]
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NOTICES, PUSH_MAX_PER_DAY, isPushEndpoint } from "../shared/push.ts";

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
const sql = (q) => execSync(`npx wrangler d1 execute onesmallclick --local --command "${q}"`, { cwd: ROOT, stdio: "ignore" });

function player() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const req = async (path, body) => {
    const res = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      jar.set(kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1));
    }
    return res;
  };
  return { req };
}
const post = async (p, path, body) => {
  const res = await p.req(path, body);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ---------- The stand-in push service ----------
const hits = []; // { id, auth, ttl, at }
const goneIds = new Set();
const server = createServer((req, res) => {
  const id = req.url.split("/").pop();
  hits.push({ id, auth: req.headers.authorization ?? "", ttl: req.headers.ttl, bodyLength: Number(req.headers["content-length"] ?? 0), at: Date.now() });
  req.resume();
  res.writeHead(goneIds.has(id) ? 410 : 201);
  res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const ep = (id) => `http://127.0.0.1:${port}/push/${id}`;
const got = (id) => hits.filter((h) => h.id === id).length;

// ---------- The endpoint rules ----------
check(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc") && isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x") && isPushEndpoint("https://web.push.apple.com/Q1"), "Chrome, Firefox and Safari push services are accepted");
check(!isPushEndpoint("https://evil.example/x") && !isPushEndpoint("http://fcm.googleapis.com/x") && !isPushEndpoint("https://fcm.googleapis.com:8443/x") && !isPushEndpoint("http://127.0.0.1:1/x"), "anything else is refused (and local only in dev)");

await admin("reset", {});
sql("DELETE FROM network_caps WHERE kind = 'push'; DELETE FROM push_subscriptions");
await wait(800);

// ---------- Subscribing ----------
const a = player();
const b = player();
const c = player();
const other = player();
for (const p of [a, b, c, other]) await p.req("/api/session");
const cfg = await (await fetch(`${base}/api/push/config`)).json();
check(cfg.available === true && /^[\w-]{87}$/.test(cfg.publicKey), "the server has its key pair (public key 65 bytes)");
let r = await post(a, "/api/push/subscribe", { endpoint: "https://evil.example/x" });
check(r.status === 400, "an address that isn't a push service is refused");
r = await post(a, "/api/push/subscribe", { endpoint: ep("a") });
check(r.status === 200 && r.body.on && r.body.prefs.signal && r.body.prefs.burn && r.body.prefs.vote, "A turns alerts on: all three alerts are on (decision 29)");
r = await post(b, "/api/push/subscribe", { endpoint: ep("b"), prefs: { signal: true, burn: true, vote: false } });
check(r.body.on && r.body.prefs.vote === false, "B turns alerts on with the vote alert off");
r = await post(c, "/api/push/subscribe", { endpoint: ep("c") });
check(r.body.on, "C turns alerts on");
r = await post(other, "/api/push/state", { endpoint: ep("a") });
check(r.body.on === false, "another browser can't read or change A's switches");
r = await post(other, "/api/push/prefs", { endpoint: ep("a"), prefs: { signal: false, burn: false, vote: false } });
r = await post(a, "/api/push/state", { endpoint: ep("a") });
check(r.body.prefs.signal === true, "…and A's switches are untouched");
r = await post(a, "/api/push/prefs", { endpoint: ep("a"), prefs: { signal: true, burn: true, vote: true } });
check(r.status === 200 && r.body.on, "switches can be saved");
r = await post(a, "/api/push/prefs", { endpoint: ep("a"), prefs: { signal: true } });
check(r.status === 400, "a partial set of switches is refused");

// C pings and votes today: no signal alert, no vote alert (nothing for them to do).
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
let s = await admin("state");
let pr = await post(c, "/api/ping", { token: TOKEN });
check(pr.body.ok === true, "C pings today");
s = await admin("state");
const round = s.probe.vote.round;
pr = await post(c, "/api/vote", { token: TOKEN, round, option: 0 });
check(pr.body.ok === true, `C votes in ${round}`);
// ...and the stand-in's push service will say C's browser is gone from now on (410).
goneIds.add("c");

// ---------- The signal's final hour ----------
hits.length = 0;
await admin("signal", { seconds: 5 * 3600 });
await wait(1500);
check(hits.length === 0, "5 hours left: nobody is alerted");
await admin("signal", { seconds: 50 * 60 });
await wait(2500);
check(got("a") === 1 && got("b") === 1, "under an hour left: A and B get the signal alert");
check(got("c") === 0, "C pinged today, so there's nothing for C to do: no alert");
const h = hits.find((x) => x.id === "a");
check(h.bodyLength === 0, "the push carries no text (nothing to encrypt)");
check(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/.test(h.auth) && h.auth.endsWith(`k=${cfg.publicKey}`), "it's signed with the game's key (RFC 8292)");
{
  const [head, claims, sig] = h.auth.slice("vapid t=".length, h.auth.indexOf(", k=")).split(".");
  const pub = await crypto.subtle.importKey("raw", Buffer.from(cfg.publicKey, "base64url"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${head}.${claims}`));
  const cl = JSON.parse(Buffer.from(claims, "base64url").toString());
  check(ok, "the signature verifies against the public key");
  check(cl.aud === `http://127.0.0.1:${port}` && cl.exp > Date.now() / 1000 + 3600 && cl.exp < Date.now() / 1000 + 86400 && /^https?:\/\//.test(cl.sub), "the token names the push service, expires within a day, and names the site (not a person)");
}
check(Number(h.ttl) > 0, "it has a time to live");
let n = await post(a, "/api/notice", { endpoint: ep("a") });
check(n.body.title === NOTICES.signal.title, "A's browser asks what to show: the signal alert");
n = await post(a, "/api/notice", { endpoint: ep("a") });
check(n.body.title === "OneSmallClick", "asked again, it gets the general line (it was already shown)");
n = await post(a, "/api/notice", { endpoint: "https://fcm.googleapis.com/fcm/send/never-subscribed" });
check(n.status === 200 && n.body.title === "OneSmallClick", "an unknown browser gets the general line too");
r = await post(c, "/api/push/state", { endpoint: ep("c") });
check(r.body.on === true, "C is still subscribed (no push was sent to C)");

// The same outage doesn't alert twice; a new outage does (A and B again: their 2nd of the day).
await admin("clock", { hours: 0.001 });
await wait(1200);
check(got("a") === 1, "the same outage: no second alert");
hits.length = 0;
await admin("signal", { seconds: 45 * 60 });
await wait(2500);
check(got("a") === 1 && got("b") === 1, "a new outage: A and B get their 2nd alert of the day");

// ---------- The vote's last hour ----------
const utcNow = new Date((await admin("state")).serverNow);
const hoursTo = (hm) => (hm - (utcNow.getUTCHours() * 60 + utcNow.getUTCMinutes())) / 60;
if (utcNow.getUTCHours() >= 22) {
  console.log("SKIP  the vote alert (run before 22:00 UTC: the alert is sent at 23:00 UTC)");
} else {
  await admin("signal", { seconds: 40 * 3600 });
  hits.length = 0;
  await admin("clock", { hours: hoursTo(23 * 60 + 10) });
  await wait(2500);
  check(got("a") === 1, "an hour before the vote closes: A (hasn't voted) gets the alert (3rd of the day)");
  check(got("b") === 0, "B has the vote alert switched off: nothing");
  check(got("c") === 0, "C already voted: nothing");
  n = await post(a, "/api/notice", { endpoint: ep("a") });
  check(n.body.title === NOTICES.vote.title, "A's notice is the vote alert");
  hits.length = 0;
  await admin("clock", { hours: 0.001 });
  await wait(1200);
  check(hits.length === 0, "the same vote: no second alert");
}

// ---------- At most 3 a day ----------
hits.length = 0;
await admin("burn", { minutes: 30, target: 100000 });
await wait(2500);
check(got("a") === 0, `A already had ${PUSH_MAX_PER_DAY} alerts today: no 4th`);
check(got("b") === 1, "B had 2: the landing burn alert is its 3rd");
n = await post(b, "/api/notice", { endpoint: ep("b") });
check(n.body.title === NOTICES.burn.title, "B's notice is the landing burn");
check(got("c") === 1, "C (who pinged and voted) still gets the landing burn alert: it concerns everyone");
r = await post(c, "/api/push/state", { endpoint: ep("c") });
check(r.body.on === false, "the push service said C's browser is gone (410): C is forgotten");

// ---------- The test alert, and turning off ----------
hits.length = 0;
r = await post(a, "/api/push/test", { endpoint: ep("a") });
await wait(800);
check(r.status === 200 && r.body.ok === true && got("a") === 1, "A's test alert is pushed (even at the day's limit: a test isn't one of the 3)");
n = await post(a, "/api/notice", { endpoint: ep("a") });
check(n.body.title === NOTICES.test.title, "…and shows the test text");
r = await post(a, "/api/push/test", { endpoint: ep("a") });
check(r.status === 429 && r.body.error === "wait", "a second test within the hour waits");
r = await post(other, "/api/push/test", { endpoint: ep("a") });
check(r.status === 404, "another browser can't send A a test");
r = await post(a, "/api/push/unsubscribe", { endpoint: ep("a") });
check(r.body.on === false, "A turns alerts off");
r = await post(a, "/api/push/state", { endpoint: ep("a") });
check(r.body.on === false, "…and the server has forgotten the address");

server.close();
sql("DELETE FROM push_subscriptions");
await admin("reset", {});
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
