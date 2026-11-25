// Local check of the Early Beta badge (prompts 82-83): a guest doesn't get it; signing in gives it (with a toast
// message), the account keeps it on another visit, and /api/admin/beta lists the account.
//   node scripts/check-beta.mjs [http://localhost:5173]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(`${ROOT}/.dev.vars`, "utf-8"))[1];
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const BETA = JSON.parse(readFileSync(`${ROOT}/content/beta.json`, "utf-8"));
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(";");
      const k = kv.slice(0, kv.indexOf("="));
      if (attrs.some((a) => /max-age=0/i.test(a.trim()))) jar.delete(k);
      else jar.set(k, kv.slice(kv.indexOf("=") + 1));
    }
    return res;
  };
  const req = async (path, body) =>
    keep(await fetch(base + path, { method: body ? "POST" : "GET", headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json" }, body: body && JSON.stringify(body) }));
  const get = async (path) => (await req(path)).json();
  const post = async (path, body = {}) => (await req(path, body)).json();
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
    return { ws, hello: await next("hello"), next, close: () => ws.close() };
  };
  return { get, post, connect };
}
const has = (list) => (list ?? []).some((b) => b.id === "early-beta");

check(Date.now() < Date.parse(BETA.endsAt), `the beta is open now (ends ${BETA.endsAt})`);

const G = browser();
await G.get("/api/session");
let g = await G.connect();
check(!has(g.hello.badges), "a guest has no Early Beta badge");
const quiet = await g.next("badges", 1500);
check(!quiet || !quiet.earned.includes("early-beta"), "and isn't given one");
g.close();

const s = await G.post("/api/auth/email", { email: `beta${Date.now()}@example.com`, token: TOKEN });
await G.post("/api/auth/confirm", { t: new URL(s.devLink).hash.slice(3) });
const name = (await G.get("/api/auth/names")).offers[0];
await G.post("/api/auth/name", { name });
await wait(500);
g = await G.connect();
const earned = has(g.hello.badges) ? { earned: ["early-beta"], already: true } : await g.next("badges");
check(earned?.earned?.includes("early-beta"), `signed in as ${name} → Early Beta${earned?.already ? " (already in hello)" : " (badges message)"}`);
g.close();
await wait(300);
g = await G.connect();
check(has(g.hello.badges), "the account still has it on the next visit");
g.close();

const report = await (await fetch(`${base}/api/admin/beta`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
check(report.players?.some((p) => p.name === name), `/api/admin/beta lists ${name} (${report.players?.length} of ${report.accounts} accounts)`);
const wrong = await fetch(`${base}/api/admin/beta`, { headers: { Authorization: "Bearer nope" } });
check(wrong.status === 401, "/api/admin/beta needs the admin key");

await G.post("/api/auth/delete");
const after = await (await fetch(`${base}/api/admin/beta`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
check(!after.players?.some((p) => p.name === name), "a deleted account leaves the Early Beta list");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
