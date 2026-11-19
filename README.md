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
shared/              rules both sides use: mission, upgrades, votes, milestones
content/             game content as JSON: the vote pool and the six milestones
migrations/          D1 schema, one file per change
scripts/             build-pages.mjs (the plain HTML content pages), tap-flood.mjs (the tap-cap check)
public/              served as-is: sprites, icons, self-hosted fonts (+ the generated content pages)
docs/brief.md        what we're building
docs/plan.md         phase plan, with what was actually built and every decision
docs/changelog.md    one line per finished phase
docs/todo.md         loose ends and content waiting for approval
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
npm run build         # type-check and build to dist/
npm run deploy        # build, then deploy to https://onesmallclick.naveessharma.workers.dev
                      # (never bare `wrangler deploy`: it skips the build)
```

View the design file: `cd design && python -m http.server 8000`, then open http://localhost:8000/OneSmallClick.dc.html.

## Secrets

Local secrets go in `.dev.vars` (git-ignored): `ADMIN_KEY`, `DEVICE_SECRET` and `TURNSTILE_SECRET` (Cloudflare's always-pass test secret locally). Production secrets: `npx wrangler secret put NAME`.

New migrations go to production with `npx wrangler d1 migrations apply onesmallclick --remote` before the deploy that needs them.

## Backups

- **Code and docs:** GitHub `Naveess/onesmallclick` (private). Everything that matters is committed; only `node_modules/`, `.wrangler/` (local dev data), `dist/`, `.dev.vars` and the generated content pages are ignored.
- **Sprite masters:** Google Drive, OneSmallClick › Sprites.
