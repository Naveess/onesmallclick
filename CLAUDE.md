# CLAUDE.md

Standing rules for this project. They apply to every task unless docs/brief.md or the Project notes below say otherwise.

## Stack

- **Decided for this project (2026-11-18): Vite + React + TypeScript**, served by **Cloudflare Workers with static assets**. This overrides the template default of plain HTML/CSS/vanilla JS.
  - Config lives in `wrangler.jsonc`. Until the app is scaffolded, everything served lives in `./public`. Once Vite is added, the assets directory becomes Vite's build output.
  - Local dev: `npx wrangler dev`. Deploy: `npx wrangler deploy`. Update both commands here once Vite is added.
- Add Durable Objects, D1, KV, R2 or Turnstile only when docs/brief.md asks for them and docs/plan.md has reached that phase (see "Data & storage" in the brief).
- Keep npm dependencies few. Reach for a small, well-known library only when writing it yourself would clearly be worse, and say why.

## Quality bar

- **Mobile-first.** Design and test at phone width first (~375px; the design's phone screens are 390px), then scale up. No horizontal scroll, tap targets at least 44px.
- **Fast.** Keep pages light: minimal JS, no render-blocking extras, compressed and correctly sized images, lazy-load anything below the fold, system or self-hosted fonts where practical.
- Semantic HTML and basic accessibility (alt text, labels, contrast, keyboard use) as standard, not as a later pass.

## Sources of truth

- **docs/brief.md**: what we're building.
- **design/**: how it looks (Claude Design export).
- **PRODUCT.md**: durable product context for design work (Impeccable).
- Read them before any feature work.
- If they conflict, or something you need is missing or unclear, **ask me instead of guessing**.

## Way of working

1. **Explore and explain first.** Read the relevant files, then tell me your approach (what you'll change and why). Wait for my OK before writing code.
2. **Work in phases.** Keep each phase small enough to check in one sitting. Keep the phase list in docs/plan.md.
3. **After each phase:**
   - Summarise what changed and how I can check it (URLs, steps, what to look for).
   - Add one line to docs/changelog.md (date, phase, what changed).
   - Commit and push.
   - Deploy.
   - **Stop** and wait for me before starting the next phase.
4. **Save my prompts.** Save every prompt I give you to docs/prompts/ as `NN-short-name.md` (next number, zero-padded), as the first step of the task. See docs/prompts/README.md.

## Git and secrets

- Never commit secrets: `.dev.vars`, `.env`, API tokens, keys or credentials of any kind. Use `wrangler secret put` for production secrets.
- Keep large media (video, audio, large image sets, raw design files) out of git unless I say otherwise. Ask me where they should live. (Exception: the whole design/ export is committed on purpose; it's small.)
- Write clear commit messages that describe the change.

## Project notes

A shared global clicker. Everyone taps THRUST to push one probe, OSC-1, from Earth to Mars together. Each player also has their own idle game with upgrades. Once a day someone has to Ping the probe or it drops into safe mode. The crew votes on route choices, and when the probe arrives they vote on the next destination. There are individual and country leaderboards.

- **Domain:** onesmallclick.io (planned, not connected). **Live now:** https://onesmallclick.naveessharma.workers.dev (placeholder page).
- **Hosting:** Cloudflare Worker `onesmallclick`. No bindings yet.
- **Code:** GitHub `Naveess/onesmallclick` (private), branch `main`. GitHub is blocked at work, so pushes may have to wait until I'm home.
- **Started from** the site-starter template (`Naveess/site-starter`).

### What's in this folder

| Path | What it is |
|---|---|
| `docs/brief.md` | What we're building: features, pages, data, monetisation, open questions. |
| `design/OneSmallClick.dc.html` | **The source of truth for the look.** All 12 screens from Claude Design, plus working interactions and the light/dark theme. Open it through a local server (see below). |
| `design/assets/` | The sprites the design file uses (Earth 8 frames, Mars 4, probe 4, burst 6). Kept only so the design file opens. Not shipped. |
| `design/sprites/` | The full PixelLab export (`frames/`, `sheets/`, `stills/`): rotating Earth 9 frames, rotating Mars 5, thruster 5, firework burst 7, plus stills. These frame counts match docs/brief.md. **This is the set that ships** (decided 2026-11-18). See design/sprites/README.md. |
| `design/icons/` | The design's ten 9×9 UI icons as `currentColor` SVGs, with their theme colours in its README. |
| `public/sprites/`, `public/icons/` | Copies of `design/sprites/` (sheets and stills, plus `nebula-tile.png`) and `design/icons/`, ready for the app. |
| `docs/todo.md` | Loose ends and decisions that aren't a phase yet. |
| `docs/design-brief.md` | Screens, game rules and numbers from the design phase. |
| `docs/tokens.css` | Every colour in the design, for both dark and light mode. |
| `docs/build-plan.html` | The earlier stage-by-stage build plan with prompts. Reference only; docs/plan.md is the live phase list. |
| `design/support.js`, `design/image-slot.js`, `design/_ds/` | Claude Design runtime files. They're only here so the design file opens. Don't ship them. |
| `design/scratch/`, `design/uploads/` | Leftover working files from the design process. Ignore them. |

To view the design locally, run `cd design && python -m http.server 8000`, then open http://localhost:8000/OneSmallClick.dc.html.

### How to treat the design file

- Copy the layout, spacing, sizes, colours, fonts and pixel-art details exactly. The game logic inside the file (in `class Component`) is a mock-up. It's useful as a reference for the numbers, but don't port it as-is. The real game state lives on the server.
- The file is written in a Claude Design format (`{{ holes }}`, `<sc-if>`, `<sc-for>`). Rebuild it as normal components. Don't try to run that format in production.
- The icons, star layers and small Earth that the design draws in code (`buildIcons()`, `buildSprites()`) are already exported: `design/icons/*.svg`, plus `stars-far.png`, `stars-near.png` and `earth-small.png` in `design/sprites/stills/`. Use those files.

### Visual rules

- 16-bit SNES pixel-art look. Always set `image-rendering: pixelated`. Scale sprites only by whole numbers.
- Fonts: **Pixelify Sans** for UI and headings, **VT323** for numbers, dates and timers Both are self-hosted with the app, not loaded from Google Fonts (decided 2026-11-18).
- Colour meaning: **light blue = action and the probe's path**, **light orange = signal, milestones and celebration**.
- Windows have a double border: a 2px light border, a 2px dark outer outline and a 2px inset.
- Animations use `steps()` timing so they move like pixel art, never smoothly. Respect `prefers-reduced-motion`.
- Colours: docs/tokens.css is the locked palette (decided 2026-11-18). Don't add colours outside it without asking.
- Content pages (How to play, milestone fact pages, privacy, terms, contact) are plain HTML pages built at deploy time, so search engines and AdSense can read them. The game itself is the React app.
- Two themes: dark (the night sky, which is the default) and light ("daylight mission control"). Follow the system setting by default, with a toggle that's saved per player. The THRUST and PING buttons look the same in both themes.
- Accessibility: use real `<button>` elements, put aria-labels on icon-only buttons, and keep text contrast at 4.5:1 or better in both themes.
- Leave space for ads where the design shows an ad slot, because the aim is Google AdSense. Keep ads at least 150px from THRUST.
