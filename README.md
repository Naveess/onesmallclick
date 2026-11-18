# OneSmallClick

The whole world flies one real probe to Mars, one small click at a time.

A shared global clicker on Cloudflare Workers. Started from the [site-starter](https://github.com/Naveess/site-starter) template.

## What's inside

```
CLAUDE.md            standing rules for Claude Code (+ Project notes at the bottom)
PRODUCT.md           product context for design work
wrangler.jsonc       Worker config, serves ./public
public/              what the Worker serves (placeholder page + sprites for now)
docs/brief.md        what we're building
docs/plan.md         phase plan
docs/changelog.md    one line per finished phase
docs/prompts/        every prompt given to Claude Code, numbered
design/              Claude Design export and PixelLab sprites
```

## Commands

```sh
npx wrangler login    # once per machine
npx wrangler dev      # local preview at http://localhost:8787
npx wrangler deploy   # deploy to https://onesmallclick.naveessharma.workers.dev
```

View the design file: `cd design && python -m http.server 8000`, then open http://localhost:8000/OneSmallClick.dc.html.

## Secrets

Local secrets go in `.dev.vars` (git-ignored). Production secrets: `npx wrangler secret put NAME`.
