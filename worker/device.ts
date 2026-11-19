// The anonymous device ID: a random id in an HttpOnly cookie, signed with DEVICE_SECRET
// so it can't be forged or swapped for someone else's. Signing in (phase 8a) links it to an account.

const COOKIE = "osc_device";
const MAX_AGE_S = 400 * 24 * 60 * 60; // the longest browsers keep a cookie

export { generateName } from "../shared/names";

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
