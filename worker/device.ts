// The anonymous device ID: a random id in an HttpOnly cookie, signed with DEVICE_SECRET
// so it can't be forged or swapped for someone else's. Accounts arrive in phase 8.

const COOKIE = "osc_device";
const MAX_AGE_S = 400 * 24 * 60 * 60; // the longest browsers keep a cookie

const ADJECTIVES = [
  "orbit", "lunar", "solar", "comet", "nova", "astro", "cosmic", "stellar", "meteor", "rocket",
  "pulsar", "quasar", "nebula", "zenith", "apogee", "perigee", "ion", "plasma", "photon", "radar",
  "beacon", "crater", "dusty", "frosty", "polar", "rusty", "swift", "steady", "brave", "plucky",
];
const ANIMALS = [
  "otter", "badger", "falcon", "fox", "lynx", "heron", "puffin", "gecko", "koala", "lemur",
  "marmot", "newt", "owl", "panda", "quokka", "raven", "seal", "tapir", "walrus", "wombat",
  "yak", "zebra", "beaver", "bison", "crane", "dingo", "egret", "ferret", "hare", "ibis",
];

function pick<T>(list: T[]): T {
  return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
}

/** A friendly generated name like `orbit_otter`. */
export function generateName(): string {
  return `${pick(ADJECTIVES)}_${pick(ANIMALS)}`;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** The device id from a validly signed cookie, or null. */
export async function readDevice(request: Request, secret: string): Promise<string | null> {
  const cookie = request.headers.get("Cookie") ?? "";
  const value = cookie
    .split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const sigBytes = fromB64url(sig);
  if (!sigBytes) return null;
  const ok = await crypto.subtle.verify("HMAC", await key(secret), sigBytes, enc.encode(id));
  return ok ? id : null;
}

/** A Set-Cookie header for a new device id. */
export async function deviceCookie(id: string, secret: string): Promise<string> {
  const sig = b64url(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(id)));
  return `${COOKIE}=${id}.${sig}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
}
