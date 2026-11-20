// Local check of "You've clicked": credited taps only, kept across reconnects, written to D1, merged on sign-in.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf-8"))[1];
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(";")[0];
      jar.set(kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1));
    }
    return res;
  };
  const req = async (path, body) =>
    keep(
      await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      }),
    );
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
    const next = (t) => {
      const i = queue.findIndex((m) => m.t === t);
      return i >= 0 ? Promise.resolve(queue.splice(i, 1)[0]) : new Promise((resolve) => waiters.push({ t, resolve }));
    };
    let seq = 0;
    return {
      ws,
      hello: await next("hello"),
      taps: async (n) => {
        ws.send(JSON.stringify({ t: "taps", n, seq: ++seq }));
        return next("credited");
      },
    };
  };
  return { jar, req, connect, cookie };
}
const admin = async (action, body) =>
  (
    await fetch(`${base}/api/admin/${action}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    })
  ).json();

await admin("signal", { seconds: 30 * 3600 }); // out of safe mode

// --- A guest: the cap ---
const A = browser();
await A.req("/api/session");
let a = await A.connect();
check(a.hello.tapsToday === 0 && a.hello.tapsAll === 0, `a new guest starts at 0 clicks (${a.hello.tapsToday}, ${a.hello.tapsAll})`);
let c = await a.taps(10);
check(c.taps === 10 && c.tapsToday === 10 && c.tapsAll === 10, `10 taps credited: today ${c.tapsToday}, all ${c.tapsAll}`);
c = await a.taps(500); // far over the tap cap
check(c.taps < 500 && c.tapsToday === 10 + c.taps, `500 at once: only ${c.taps} credited, and only those count (today ${c.tapsToday})`);
const afterCap = c.tapsToday;
a.ws.close();
await wait(300);

// --- Reconnect (a reload) ---
a = await A.connect();
check(a.hello.tapsToday === afterCap && a.hello.tapsAll === afterCap, `after a reload: today ${a.hello.tapsToday}, all ${a.hello.tapsAll}`);
a.ws.close();

// --- Safe mode: taps don't count ---
await admin("signal", { seconds: 0 });
await wait(1500);
a = await A.connect();
c = await a.taps(5);
check(c.taps === 0 && c.tapsToday === afterCap, `in safe mode 5 taps credit ${c.taps}; today stays ${c.tapsToday}`);
a.ws.close();
await admin("signal", { seconds: 30 * 3600 });

// --- Another guest with taps, then both sign in to one email: the counts add up ---
const B = browser();
await B.req("/api/session");
let b = await B.connect();
await wait(1100); // let B's bucket fill
c = await b.taps(7);
check(c.tapsToday === 7, `B tapped 7 (${c.tapsToday})`);
b.ws.close();

const email = `clicks${Date.now()}@example.com`;
for (const X of [A, B]) {
  const r = await (await X.req("/api/auth/email", { email, token: TOKEN })).json();
  await X.req("/api/auth/confirm", { t: new URL(r.devLink).hash.slice(3) });
}
await wait(400);
b = await B.connect();
check(b.hello.tapsToday === afterCap + 7 && b.hello.tapsAll === afterCap + 7, `signed in on both: today ${b.hello.tapsToday}, all ${b.hello.tapsAll} = ${afterCap} + 7`);
await wait(1100);
c = await b.taps(3);
a = await A.connect();
check(a.hello.tapsToday === afterCap + 10, `the other device sees the account's count: ${a.hello.tapsToday}`);
a.ws.close();
b.ws.close();

// --- D1 gets the counts (flushed within 5 minutes, since prompt 56) ---
console.log("waiting for the D1 flush (every 5 minutes)…");
await wait(305_000);
const out = execSync(
  `npx wrangler d1 execute onesmallclick --local --json --command "SELECT SUM(taps) AS t FROM daily_km d JOIN accounts a ON a.id = d.account_id WHERE a.email = '${email}'"`,
  { cwd: new URL("..", import.meta.url), encoding: "utf-8" },
);
const t = JSON.parse(out)[0].results[0].t;
check(t === afterCap + 10, `D1 daily_km.taps for the account: ${t}`);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
