# OneSmallClick

The whole world flies one real probe to Mars, one small click at a time.

A shared global clicker on Cloudflare Workers. Started from the [site-starter](https://github.com/Naveess/site-starter) template.

## What's inside

```
CLAUDE.md            standing rules for Claude Code (+ Project notes at the bottom)
PRODUCT.md           product context for design work
wrangler.jsonc       Worker config (Cloudflare Vite plugin)
index.html           the app's HTML shell (theme script, font preloads)
src/                 the React + TypeScript app: pixel kit components and pages
worker/              the Worker (only /api/* for now)
public/              served as-is: sprites, icons, self-hosted fonts
docs/brief.md        what we're building
docs/plan.md         phase plan
docs/changelog.md    one line per finished phase
docs/prompts/        every prompt given to Claude Code, numbered
design/              Claude Design export and PixelLab sprites
```

## Commands

```sh
npm install           # once per clone
npx wrangler login    # once per machine
npm run dev           # app + Worker at http://localhost:5173 (pixel kit at /kit)
npm run build         # type-check and build to dist/
npm run deploy        # build, then deploy to https://onesmallclick.naveessharma.workers.dev
```

View the design file: `cd design && python -m http.server 8000`, then open http://localhost:8000/OneSmallClick.dc.html.

## Secrets

Local secrets go in `.dev.vars` (git-ignored). Production secrets: `npx wrangler secret put NAME`.
