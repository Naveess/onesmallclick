// Phase Q1b-2: makes the VAPID key pair that signs the game's push notifications (once; the public half is in
// wrangler.jsonc `vars` as VAPID_PUBLIC_KEY, the private half is the secret VAPID_PRIVATE_KEY).
//   node scripts/make-vapid.mjs            → writes VAPID_PRIVATE_KEY into .dev.vars and prints only the public key
// For production: npx wrangler secret put VAPID_PRIVATE_KEY (paste the value from .dev.vars; never print it in chat).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../.dev.vars", import.meta.url));
const vars = readFileSync(path, "utf-8");
if (/^VAPID_PRIVATE_KEY=./m.test(vars)) {
  console.log("VAPID_PRIVATE_KEY is already in .dev.vars; not making a new pair (that would orphan every subscription).");
  process.exit(0);
}
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const b64 = (u8) => Buffer.from(u8).toString("base64url");
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)); // 0x04 || x || y
writeFileSync(path, vars.replace(/\s*$/, "\n") + `\n# Phase Q1b-2: signs the push notifications (scripts/make-vapid.mjs). Production: npx wrangler secret put VAPID_PRIVATE_KEY\nVAPID_PRIVATE_KEY=${JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })}\n`);
console.log("public key (for wrangler.jsonc VAPID_PUBLIC_KEY):", b64(raw));
