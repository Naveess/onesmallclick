# OneSmallClick

The whole world flies one real probe to Mars, one small click at a time.

A shared global clicker on Cloudflare Workers. Started from the [site-starter](https://github.com/Naveess/site-starter) template.

## What's inside

```
CLAUDE.md            standing rules for Claude Code (+ Project notes at the bottom)
PRODUCT.md           product context for design work
wrangler.jsonc       Worker config (Cloudflare Vite plugin)
index.html           the app's HTML shell (theme script, font preloads)
src/                 the React + TypeScript app: pixel kit, game screens, store, WebSocket client
worker/              the Worker (/api/*) and the Probe Durable Object (the shared game)
shared/              rules both sides use: balance, mission, upgrades, votes, campaign, medals, tech, burn, badges, share, beta
content/             game content as JSON: the Grand Tour (campaign.json), per-stop milestones, facts and detours, the vote pool, share texts, the early-access copy (beta.json)
migrations/          D1 schema, one file per change
scripts/             build-pages.mjs (the content pages), make-previews.mjs (link-preview images), check-*.mjs (scripted checks), check-leg.mjs (is a leg ready), sim.mjs, load-test.mjs
public/              served as-is: sprites, icons, self-hosted fonts (+ the generated content pages)
docs/brief.md        what we're building
docs/plan.md         phase plan, with what was actually built and every decision
docs/changelog.md    one line per finished phase
docs/todo.md         what's left: launch day, payday, phases, the PixelLab art still to make
docs/expansion.md    the Grand Tour plan (route, rewards, facts)
docs/launch-checklist.md  phone checks before launch, and where to look once it's live
docs/prompts/        every prompt given to Claude Code, numbered
design/              Claude Design export and PixelLab sprites
```

## Commands

```sh
npm install           # once per clone
npx wrangler login    # once per machine
npx wrangler d1 migrations apply onesmallclick --local   # once, and after each new migration
npm run dev           # app + Worker at http://localhost:5173 (pixel kit at /kit, test controls at /admin)
npm run pages         # rebuild only the content pages (dev and build already do this)
npm run sim           # days per leg for different crowd sizes (shared/balance.ts)
npm run check-leg     # is each leg's content ready, and what art it still needs
node scripts/check-burn.mjs   # one of the scripted checks (check-*.mjs), against npm run dev
npm run build         # type-check and build to dist/
npm run deploy        # build, then deploy to https://onesmallclick.naveessharma.workers.dev
                      # (never bare `wrangler deploy`: it skips the build)
```

View the design file: `cd design && python -m http.server 8000`, then open http://localhost:8000/OneSmallClick.dc.html.

## Secrets

Local secrets go in `.dev.vars` (git-ignored): `ADMIN_KEY`, `DEVICE_SECRET`, `TURNSTILE_SECRET` (Cloudflare's always-pass test secret locally), `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (empty locally unless you're testing Google sign-in), and `DEV_SIGN_IN_LINKS="1"` (local only: the email sign-in link shows on screen instead of being sent). Production secrets: `npx wrangler secret put NAME`, or the Cloudflare dashboard (Workers & Pages → onesmallclick → Settings → Variables and Secrets).

New migrations go to production with `npx wrangler d1 migrations apply onesmallclick --remote` before the deploy that needs them.

## Backups

- **Code and docs:** GitHub `Naveess/onesmallclick` (private). Everything that matters is committed; only `node_modules/`, `.wrangler/` (local dev data), `dist/`, `.dev.vars` and the generated content pages are ignored.
- **Sprite masters:** Google Drive, OneSmallClick › Sprites (the PixelLab zips, and the art made since: `onesmallclick-art-2026-11-25.zip`).
- **Live database (D1), three layers** (prompt 92; retention in docs/plan.md, "Backups and retention"):
  - Cloudflare's D1 Time Travel: restore to any minute in the last 7 days (30 on Workers Paid). Automatic.
  - `npm run backup -- <label>` before every deploy that changes data, and at least weekly: exports to `Documents\onesmallclick-backups\` (plain, kept 30 days), encrypts it with AES-256 into `encrypted\` (kept 90 days), checks it decrypts, and prunes old files. The passphrase is `BACKUP_PASSPHRASE` in `.dev.vars`, with a copy in Nav's password manager.
  - The encrypted file goes to Google Drive, OneSmallClick › Backups (encrypted); copies over 90 days are deleted there too.
  - To open one: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <file>.sql.enc -out <file>.sql -pass env:BACKUP_PASSPHRASE` (set the variable first). Never on GitHub: it holds players' emails.
- **Releases:** each live version is tagged in git (`s1-live` … `d-live`).
