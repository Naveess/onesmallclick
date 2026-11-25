// Backs up the live database (prompt 92): exports D1, encrypts the export, checks it decrypts, and applies the
// retention rules. The encrypted file is what goes to Google Drive (OneSmallClick › Backups); Claude uploads it.
//
//   npm run backup -- <label>        e.g. npm run backup -- pre-G1   (label: letters, numbers and dashes)
//
// Encryption: AES-256 (openssl enc -aes-256-cbc, PBKDF2 with 600,000 rounds and a random salt), with the passphrase in
// BACKUP_PASSPHRASE (.dev.vars, git-ignored; Nav keeps a copy in a password manager: without it the backups can't
// be opened). Decrypt one (README, "Backups"):
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <file>.sql.enc -out <file>.sql -pass env:BACKUP_PASSPHRASE
//
// Retention (docs/plan.md, "Backups and retention"): plain exports on this computer 30 days, encrypted copies 90
// days (here and in Drive), always keeping the newest 3 of each. Cloudflare's own D1 Time Travel keeps 7 days on
// the free plan and 30 on Workers Paid.
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, "..", "onesmallclick-backups");
const ENC = join(DIR, "encrypted");
const PLAIN_DAYS = 30;
const ENC_DAYS = 90;
const KEEP_NEWEST = 3;
const ITER = "600000";

const label = (process.argv[2] ?? "manual").replace(/[^a-zA-Z0-9-]/g, "");
const vars = existsSync(join(ROOT, ".dev.vars")) ? readFileSync(join(ROOT, ".dev.vars"), "utf-8") : "";
const pass = process.env.BACKUP_PASSPHRASE ?? /^BACKUP_PASSPHRASE\s*=\s*"?([^"\r\n]+)"?/m.exec(vars)?.[1];
if (!pass || pass.length < 20) {
  console.error("BACKUP_PASSPHRASE is missing (or under 20 characters) in .dev.vars. Nothing was exported.");
  process.exit(1);
}
const env = { ...process.env, BACKUP_PASSPHRASE: pass };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

mkdirSync(ENC, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const name = `d1-onesmallclick-${stamp}-${label}.sql`;
const plain = join(DIR, name);
const enc = join(ENC, `${name}.enc`);

// 1. Export the live database.
execSync(`npx wrangler d1 export onesmallclick --remote --output "${plain}"`, { cwd: ROOT, stdio: "inherit" });

// 2. Encrypt it (the passphrase goes through the environment, never the command line).
execFileSync("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", ITER, "-salt", "-in", plain, "-out", enc, "-pass", "env:BACKUP_PASSPHRASE"], { env });

// 3. Check it opens again and matches.
const back = execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", ITER, "-in", enc, "-pass", "env:BACKUP_PASSPHRASE"], { env, maxBuffer: 1 << 30 });
if (sha(back) !== sha(readFileSync(plain))) {
  console.error("The encrypted copy didn't decrypt to the same file. Keeping both; please look into it.");
  process.exit(1);
}

// 4. Retention: delete what's past its age, always keeping the newest few.
function prune(dir, test, days) {
  const files = readdirSync(dir)
    .filter(test)
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const cutoff = Date.now() - days * 86_400_000;
  const gone = files.slice(KEEP_NEWEST).filter((x) => x.t < cutoff);
  for (const x of gone) rmSync(join(dir, x.f));
  return gone.map((x) => x.f);
}
const prunedPlain = prune(DIR, (f) => f.endsWith(".sql"), PLAIN_DAYS);
const prunedEnc = prune(ENC, (f) => f.endsWith(".sql.enc"), ENC_DAYS);

const encBuf = readFileSync(enc);
console.log(`\nExported:  ${plain}`);
console.log(`Encrypted: ${enc} (${encBuf.length.toLocaleString("en-GB")} bytes, checked)`);
console.log(`sha256:    ${sha(encBuf)}`);
console.log(`Retention: removed ${prunedPlain.length} plain export(s) over ${PLAIN_DAYS} days, ${prunedEnc.length} encrypted over ${ENC_DAYS} days.`);
console.log("Next: upload the encrypted file to Drive (OneSmallClick › Backups) and remove Drive copies over 90 days.");
