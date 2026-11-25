// Local check of phase A1a: admin sign-in (an allowlisted game account plus the key, a 12-hour cookie), the admin log,
// and the Players tab (search, lists, one player's page, notes). Local only: it signs in by email link (dev) as the
// ADMIN_EMAILS address in .dev.vars, and uses the Bearer key only where the check scripts always have.
//   node scripts/check-admin.mjs [http://localhost:5173]
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const vars = readFileSync(`${ROOT}/.dev.vars`, "utf-8");
const KEY = /^ADMIN_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(vars)[1];
const ADMIN_EMAIL = /^ADMIN_EMAILS\s*=\s*"?([^",\r\n]+)/m.exec(vars)[1].trim();
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const sql = (q) => execSync(`npx wrangler d1 execute onesmallclick --local --command "${q}"`, { cwd: ROOT, stdio: "ignore" });

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const req = async (path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { Cookie: cookie(), Origin: base, "Content-Type": "application/json", ...headers },
      body: body && JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const name = kv.slice(0, kv.indexOf("="));
      const value = kv.slice(kv.indexOf("=") + 1);
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
    return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.getSetCookie() };
  };
  return { req, jar };
}
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
async function signInGame(b, email) {
  await b.req("/api/session");
  const r = await b.req("/api/auth/email", { email, token: TOKEN });
  await b.req("/api/auth/confirm", { t: new URL(r.body.devLink).hash.slice(3) });
}

sql("DELETE FROM network_caps WHERE kind = 'admin'");
// The game allows a few sign-in links per address per 15 minutes: clear this check's own, so it can run again.
sql(`DELETE FROM login_tokens WHERE email = '${ADMIN_EMAIL}'`);

const startAt = Date.now();
// ---------- Sign-in ----------
const nobody = browser();
await nobody.req("/api/session");
let r = await nobody.req("/api/admin/state");
check(r.status === 401, "no admin session, no key: the panel's API says sign in");
r = await nobody.req("/api/admin/session", { key: KEY });
check(r.status === 401 && /Sign in to the game/.test(r.body.error), "the key alone isn't enough: sign in to the game first");

const stranger = browser();
await signInGame(stranger, `not-admin-${Date.now()}@example.com`);
r = await stranger.req("/api/admin/session", { key: KEY });
check(r.status === 401 && /isn't an admin/.test(r.body.error), "a signed-in account that isn't on the allowlist can't sign in, even with the key");

const nav = browser();
await signInGame(nav, ADMIN_EMAIL);
r = await nav.req("/api/admin/session", { key: "wrong" });
check(r.status === 401 && r.body.error === "Wrong key.", "the admin's account with a wrong key: refused");
r = await nav.req("/api/admin/session", { key: KEY });
check(r.status === 200 && r.body.email === ADMIN_EMAIL && r.body.role === "owner", "the admin's account plus the key: signed in as owner");
const sc = r.setCookie.find((c) => c.startsWith("osc_admin="));
check(/Path=\/api\/admin/.test(sc) && /HttpOnly/.test(sc) && /SameSite=Strict/.test(sc) && /Max-Age=43200/.test(sc), "the admin cookie: /api/admin only, HttpOnly, SameSite=Strict, 12 hours");
r = await nav.req("/api/admin/whoami");
check(r.status === 200 && r.body.email === ADMIN_EMAIL, "whoami with the cookie");
r = await nav.req("/api/admin/state");
check(r.status === 200 && !!r.body.probe, "the test controls work with the cookie (no key sent)");
r = await nav.req("/api/admin/discord-test", {}, { Origin: "https://evil.example" });
check(r.status === 403, "an admin POST from another site is refused");

// ---------- Players ----------
// A guest who plays a bit, to find.
const guest = browser();
await guest.req("/api/session");
const g = (await guest.req("/api/session")).body;
r = await nav.req("/api/admin/search?list=newest");
check(Array.isArray(r.body) && r.body.length > 0, `the newest list (${r.body.length})`);
r = await nav.req(`/api/admin/search?q=${encodeURIComponent(g.name)}`);
const found = r.body.find((x) => x.name === g.name);
check(!!found && found.kind === "guest", `search by name finds the guest ${g.name}`);
r = await nav.req(`/api/admin/search?q=${encodeURIComponent(ADMIN_EMAIL.slice(0, 8))}`);
check(r.body.some((x) => x.email === ADMIN_EMAIL && x.kind === "account"), "search by part of an email finds the account");
for (const list of ["active", "top", "changed"]) {
  r = await nav.req(`/api/admin/search?list=${list}`);
  check(r.status === 200 && Array.isArray(r.body), `the ${list} list answers`);
}
r = await nav.req("/api/admin/search");
check(r.status === 400, "a search needs words or a list");

r = await nav.req(`/api/admin/player?key=${encodeURIComponent(found.key)}`);
check(r.status === 200 && r.body.profile.name === g.name && r.body.kind === "guest" && r.body.devices.length === 1, "the guest's page: name, kind, device");
const accKey = (await nav.req(`/api/admin/search?q=${encodeURIComponent(ADMIN_EMAIL)}`)).body.find((x) => x.email === ADMIN_EMAIL).key;
r = await nav.req(`/api/admin/player?key=${encodeURIComponent(accKey)}`);
check(r.status === 200 && r.body.kind === "account" && r.body.profile.email === ADMIN_EMAIL && r.body.sessions.count >= 1, "an account's page: email, sessions");
check(Array.isArray(r.body.days) && typeof r.body.totals.km === "number" && Array.isArray(r.body.badges), "…with its days, totals and badges");
r = await nav.req("/api/admin/player?key=a%3Anobody");
check(r.status === 404, "an unknown player: 404");

// Notes and the log.
r = await nav.req("/api/admin/note", { key: found.key, text: "  Said on Discord his credits vanished.  " });
check(r.status === 200 && r.body.notes[0]?.text === "Said on Discord his credits vanished." && r.body.notes[0].admin === ADMIN_EMAIL, "a private note is saved (trimmed), with who wrote it");
check(r.body.log.some((l) => l.action === "note" && l.admin === ADMIN_EMAIL), "…and the note is in the player's admin log");
r = await nav.req("/api/admin/search?list=changed");
check(r.body[0]?.key === found.key, "the guest tops the 'changed by an admin' list");
r = await nav.req("/api/admin/log");
check(r.body.some((l) => l.action === "sign-in" && l.admin === ADMIN_EMAIL), "the admin log has the sign-in");
check(r.body.some((l) => l.action === "sign-in-failed" && l.reason === "wrong key"), "…and the failed one (wrong key)");
check(r.body.some((l) => l.action === "discord-test" && l.at >= startAt) === false, "…but not the refused cross-site POST");
await nav.req("/api/admin/discord-test", {});
r = await nav.req("/api/admin/log");
check(r.body[0]?.action === "discord-test" && r.body[0].admin === ADMIN_EMAIL, "a test control is logged with who pressed it");

// ---------- Signing out, and the failed sign-in cap ----------
r = await nav.req("/api/admin/signout", {});
r = await nav.req("/api/admin/whoami");
check(r.status === 401, "signed out: the cookie no longer works");
const bad = browser();
await signInGame(bad, ADMIN_EMAIL);
let last;
for (let i = 0; i < 12; i++) last = await bad.req("/api/admin/session", { key: `wrong-${i}` });
check(last.status === 429, "after 10 failed sign-ins from one network in a day, sign-in waits until tomorrow");
sql("DELETE FROM network_caps WHERE kind = 'admin'");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
