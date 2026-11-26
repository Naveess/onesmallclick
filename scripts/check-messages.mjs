// Local check of phase A2b-1: messages from mission control. One player's message (a template), opened and read;
// a gift of credits collected once (paid live over the socket, a save state first), Undo with the name typed; a badge
// gift and its Undo; an everyone message (not for players who joined after it), collected once across a guest signing
// in; stopping it, taking it back; withdraw; a paused player waits; the checks on what /admin sends. Local only:
//   node scripts/check-messages.mjs [http://localhost:5173]
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const vars = readFileSync(`${ROOT}/.dev.vars`, "utf-8");
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(vars)[1];
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const sqlJson = (q) => JSON.parse(execSync(`npx wrangler d1 execute onesmallclick --local --json --command "${q}"`, { cwd: ROOT, encoding: "utf-8" }))[0].results;

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const req = async (path, body) => {
    const res = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const name = kv.slice(0, kv.indexOf("="));
      const value = kv.slice(kv.indexOf("=") + 1);
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  const connect = async () => {
    const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/probe`, { headers: { Cookie: cookie(), Origin: base } });
    const queue = [];
    const waiters = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const i = waiters.findIndex((w) => w.t === m.t);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
      else queue.push(m);
    };
    await new Promise((res) => (ws.onopen = res));
    const next = (t, ms = 4000) => {
      const i = queue.findIndex((m) => m.t === t);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return Promise.race([new Promise((resolve) => waiters.push({ t, resolve })), wait(ms).then(() => null)]);
    };
    const hello = await next("hello");
    return { hello, next, drain: () => queue.splice(0), close: () => ws.close() };
  };
  return { req, connect };
}
const admin = async (action, body) => {
  const res = await fetch(`${base}/api/admin/${action}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Origin: base },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};
/** A GET that answers with a list (the helper above would spread it into an object). */
const adminList = async (action) =>
  (await fetch(`${base}/api/admin/${action}`, { headers: { Authorization: `Bearer ${KEY}`, Origin: base } })).json();
async function guest() {
  const b = browser();
  const s = await b.req("/api/session");
  b.key = sqlJson(`SELECT id FROM devices WHERE rowid = ${s.crew}`)[0].id;
  b.name = s.name;
  return b;
}
async function signIn(b, email) {
  const r = await b.req("/api/auth/email", { email, token: TOKEN });
  await b.req("/api/auth/confirm", { t: new URL(r.devLink).hash.slice(3) });
  const s = await b.req("/api/session");
  b.key = `a:${s.account.id}`;
  b.name = s.name;
  return s;
}
const credits = (me) => (me ? Math.round(me.credits) : null);

const st = await admin("state");
if (st.probe.maintenance) await admin("maintenance", { on: false, reason: "check-messages: start clean" });
const stamp = Date.now().toString(36);

// ---------- One player: a template message, opened ----------
const a = await guest();
let s = await a.req("/api/session");
check(s.inbox === 0, "a new guest has no messages");
let v = await admin("messages", undefined);
check(Array.isArray(v.templates) && v.templates.length === 5, "the five templates are listed");

let r = await admin("message-send", { key: a.key, title: "", body: "x", reason: "check" });
check(r.status === 400, "a message needs a title");
r = await admin("message-send", { key: a.key, title: "Hi", body: "Text", reason: "" });
check(r.status === 400, "a message needs a reason");
r = await admin("message-send", { key: "nobody-here", title: "Hi", body: "Text", reason: "check" });
check(r.status === 404, "no such player is refused");
r = await admin("message-send", { key: a.key, title: "Hi", body: "Text", gift: { credits: 2_000_000 }, reason: "check" });
check(r.status === 400, "a gift over 1,000,000 credits is refused");
r = await admin("message-send", { key: a.key, title: "Hi", body: "Text", gift: { badge: "not-a-badge" }, reason: "check" });
check(r.status === 400, "an unknown badge is refused");

r = await admin("message-send", { key: a.key, title: "Welcome back", body: `Good to see you, ${a.name}.`, template: "welcome-back", reason: "check-messages" });
check(r.status === 200 && r.messages?.[0]?.title === "Welcome back" && r.messages[0].template === "welcome-back", "sent to one player, from a template");
s = await a.req("/api/session");
check(s.inbox === 1, "their session counts 1 new message");
let inbox = await a.req("/api/inbox");
check(inbox.items?.length === 1 && inbox.items[0].read === false && inbox.items[0].everyone === false, "their inbox shows it, unread");
await a.req("/api/inbox/read", { ids: [inbox.items[0].id] });
s = await a.req("/api/session");
check(s.inbox === 0, "opened: the count goes to 0");
v = await admin(`messages?key=${encodeURIComponent(a.key)}`);
check(v.messages?.[0]?.readAt > 0, "/admin sees when they opened it");
const other = await guest();
check((await other.req("/api/inbox")).items?.length === 0, "another player doesn't see it");

// ---------- A gift of credits: paid live, once; a save state first; Undo ----------
const ws = await a.connect();
const before = credits(ws.hello.me);
r = await admin("message-send", { key: a.key, title: "Sorry", body: "Here's something for the trouble.", gift: { credits: 5000 }, reason: "check gift" });
ws.close(); // the send reconnects their screens; connect again
await wait(300);
const ws2 = await a.connect();
const base2 = credits(ws2.hello.me);
inbox = await a.req("/api/inbox");
const giftMsg = inbox.items.find((m) => m.gift && "credits" in m.gift);
check(giftMsg?.gift.credits === 5000 && giftMsg.collectedAt === null, "the gift shows, not collected");
const saves0 = sqlJson(`SELECT COUNT(*) AS n FROM snapshots WHERE player_key = '${a.key}'`)[0].n;
r = await a.req("/api/inbox/collect", { id: giftMsg.id });
check(r.ok === true && r.credits === 5000, "Collect pays 5,000 credits");
const me = await ws2.next("me");
check(me && credits(me.me) >= base2 + 5000 - 1, `their screen gets the credits at once (${base2} → ${credits(me?.me)})`);
r = await a.req("/api/inbox/collect", { id: giftMsg.id });
check(r.ok === false && r.error === "collected", "collecting twice is refused");
const saves1 = sqlJson(`SELECT COUNT(*) AS n FROM snapshots WHERE player_key = '${a.key}'`)[0].n;
check(saves1 === saves0 + 1, "a save state was taken before paying");
v = await admin(`messages?key=${encodeURIComponent(a.key)}`);
check(v.messages.find((m) => m.id === giftMsg.id)?.collectedCredits === 5000, "/admin sees it collected (5,000)");

r = await admin("gift-undo", { id: giftMsg.id, reason: "check undo", confirm: "wrong" });
check(r.status === 400, "taking a collected gift back needs their name typed");
r = await admin("gift-undo", { id: giftMsg.id, reason: "check undo", confirm: a.name });
check(r.status === 200 && r.result?.credits === 5000, "Undo takes the 5,000 back");
const me2 = await ws2.next("me");
check(me2 && credits(me2.me) <= credits(me.me) - 5000 + 1, "their screen shows it taken back");
inbox = await a.req("/api/inbox");
check(inbox.items.find((m) => m.id === giftMsg.id)?.giftClosed === true, "the gift shows as closed");
ws2.close();
void before;

// ---------- A badge gift and its Undo ----------
r = await admin("message-send", { key: a.key, title: "A badge", body: "For you.", gift: { badge: "patch" }, reason: "check badge" });
await wait(300);
const ws3 = await a.connect();
inbox = await a.req("/api/inbox");
const badgeMsg = inbox.items.find((m) => m.gift && "badge" in m.gift);
r = await a.req("/api/inbox/collect", { id: badgeMsg.id });
check(r.ok === true && r.badge === "patch" && r.badgeNew === true, "Collect gives the badge");
const bm = await ws3.next("badges");
check(bm?.earned?.includes("patch"), "their screen gets the badge toast");
check(sqlJson(`SELECT COUNT(*) AS n FROM badges WHERE player_key = '${a.key}' AND badge = 'patch'`)[0].n === 1, "the badge is in D1");
r = await admin("gift-undo", { id: badgeMsg.id, reason: "check badge undo", confirm: a.name });
check(r.status === 200, "Undo the badge gift");
check(sqlJson(`SELECT COUNT(*) AS n FROM badges WHERE player_key = '${a.key}' AND badge = 'patch'`)[0].n === 0, "the badge is gone again");
ws3.close();

// ---------- Not collected yet: Undo stops it ----------
r = await admin("message-send", { key: a.key, title: "Later", body: "Another one.", gift: { credits: 10 }, reason: "check stop" });
let stopId = r.messages[0].id;
r = await admin("gift-undo", { id: stopId, reason: "check stop" });
check(r.status === 200, "Undo on an uncollected gift needs no name");
r = await a.req("/api/inbox/collect", { id: stopId });
check(r.ok === false && r.error === "gone", "a stopped gift can't be collected");

// ---------- Withdraw ----------
r = await admin("message-send", { key: a.key, title: "Oops", body: "Wrong player.", reason: "check withdraw" });
const wId = r.messages[0].id;
r = await admin("message-withdraw", { id: wId, reason: "sent by mistake" });
check(r.status === 200 && r.messages.find((m) => m.id === wId)?.withdrawnAt > 0, "withdrawn");
inbox = await a.req("/api/inbox");
check(!inbox.items.some((m) => m.id === wId), "a withdrawn message they hadn't opened is gone from the inbox");

// ---------- Everyone ----------
const b = await guest(); // exists before the message
const d = await guest();
const e = await guest();
await wait(20);
r = await admin("message-send", { key: null, title: "Sorry about the outage", body: "Here's 1,000 credits.", gift: { credits: 1000 }, reason: `check everyone ${stamp}` });
check(r.status === 200 && r.messages[0].toKey === null, "sent to everyone");
const everyId = r.messages[0].id;
await wait(20);
const late = await guest(); // joins after it
check((await late.req("/api/inbox")).items.every((m) => m.id !== everyId), "a player who joined after it doesn't get it");
check((await b.req("/api/session")).inbox >= 1, "a player who existed counts it");
r = await b.req("/api/inbox/collect", { id: everyId });
check(r.ok === true && r.credits === 1000, "a guest collects the everyone gift");
await signIn(b, `msg-${stamp}@example.com`);
inbox = await b.req("/api/inbox");
const asAccount = inbox.items.find((m) => m.id === everyId);
check(asAccount && asAccount.collectedAt !== null, "signed in, it shows as collected already");
r = await b.req("/api/inbox/collect", { id: everyId });
check(r.ok === false && r.error === "collected", "and can't be collected again by the new account");

// A paused player waits.
const mod = await admin("moderate", { key: e.key, kind: "timeout", days: 1, reason: "check-messages pause" });
r = await e.req("/api/inbox/collect", { id: everyId });
check(r.ok === false && r.error === "paused", "a paused player can't collect yet");
const lifted = await admin("moderation-lift", { id: mod.items?.find((m) => m.kind === "timeout" && m.active)?.id, reason: "check over" });
check(lifted.status === 200, "pause lifted");
r = await e.req("/api/inbox/collect", { id: everyId });
check(r.ok === true, "after the pause they can collect");

v = await admin("messages");
let ev = v.messages.find((m) => m.id === everyId);
check(ev?.collected === 2 && ev.reads >= 2, `/admin counts 2 collected (${ev?.collected}), opened by ${ev?.reads}`);
r = await admin("gift-undo", { id: everyId, reason: "check stop everyone", takeBack: true, confirm: "nope" });
check(r.status === 400, "taking it back from everyone needs the phrase");
r = await admin("gift-undo", { id: everyId, reason: "check stop everyone" });
check(r.status === 200 && r.result.players === 0, "stop it (without taking back)");
r = await d.req("/api/inbox/collect", { id: everyId });
check(r.ok === false && r.error === "gone", "after stopping, nobody else can collect");
r = await admin("gift-undo", { id: everyId, reason: "check take back", takeBack: true, confirm: "TAKE THE GIFT BACK" });
check(r.status === 200 && r.result.players === 2 && r.result.credits === 2000, `taken back from the 2 who collected (${r.result?.credits} credits)`);
v = await admin("messages");
ev = v.messages.find((m) => m.id === everyId);
check(ev?.takenBack === 2, "/admin shows them taken back");
const log = sqlJson(`SELECT COUNT(*) AS n FROM admin_log WHERE action IN ('msg-send', 'msg-withdraw', 'gift-undo') AND at > ${Date.now() - 600000}`)[0].n;
check(log >= 10, `every send, withdraw and undo is in the admin log (${log})`);

// ---------- Prompt 141: the tab's list, one player from the tab, and taking an everyone gift back from one player ----------
r = await admin("message-send", { key: d.key, title: "Just you", body: "From the tab.", reason: "check tab one player", view: "all" });
check(r.status === 200 && r.messages.some((m) => m.toKey === null) && r.messages[0].toKey === d.key && r.messages[0].toName === d.name, "the tab sends to one player and lists everything, with who each went to");
r = await admin("message-send", { key: null, title: "Second gift", body: "500 each.", gift: { credits: 500 }, reason: `check one take-back ${stamp}`, view: "all" });
const secondId = r.messages[0].id;
check((await d.req("/api/inbox/collect", { id: secondId })).ok === true, "player d collects the second everyone gift");
check((await a.req("/api/inbox/collect", { id: secondId })).ok === true, "player a collects it too");
const who = await adminList(`message-collectors?id=${secondId}`);
check(Array.isArray(who) && who.length === 2 && who.some((c) => c.key === d.key && c.name === d.name && c.credits === 500), "Who collected it lists both, with names");
r = await admin("gift-undo", { id: secondId, playerKey: d.key, reason: "check one", confirm: "wrong", view: "all" });
check(r.status === 400, "taking it back from one player needs their name");
r = await admin("gift-undo", { id: secondId, playerKey: d.key, reason: "check one", confirm: d.name, view: "all" });
check(r.status === 200 && r.result.players === 1 && r.result.credits === 500, "taken back from that one player only");
const who2 = await adminList(`message-collectors?id=${secondId}`);
check(who2.find((c) => c.key === d.key)?.takenBackAt > 0 && who2.find((c) => c.key === a.key)?.takenBackAt === null, "the other collector keeps theirs");
check((await e.req("/api/inbox/collect", { id: secondId })).ok === true, "and the gift stays open for everyone else");
r = await admin("gift-undo", { id: secondId, playerKey: d.key, reason: "again", confirm: d.name });
check(r.status === 400, "taking it back twice is refused");

// Cross-site POSTs are refused.
const xs = await fetch(`${base}/api/inbox/collect`, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
check(xs.status === 403, "a cross-site collect is refused");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed.");
process.exit(failures ? 1 : 0);
