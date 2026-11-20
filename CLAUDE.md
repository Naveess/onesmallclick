# CLAUDE.md

Standing rules for this project. They apply to every task unless docs/brief.md or the Project notes below say otherwise.

## Stack

- **Decided for this project (2026-11-18): Vite + React + TypeScript**, served by **Cloudflare Workers with static assets**. This overrides the template default of plain HTML/CSS/vanilla JS.
  - Scaffolded in phase 2 (2026-11-18) with the **Cloudflare Vite plugin**. Worker config is `wrangler.jsonc`; the Worker is `worker/index.ts` and only answers `/api/*`. Everything else is the React app (`src/`), built by Vite into `dist/client/`. Unknown paths get `index.html` (single-page-application mode) and `src/App.tsx` picks the page.
  - `npm run dev`: the app and the Worker together at http://localhost:5173.
  - `npm run build`: type-checks (`tsc -b`, must pass with no errors) and builds to `dist/`.
  - `npm run deploy`: builds, then `wrangler deploy`. Nav runs it.
  - `npm run cf-typegen`: regenerates `worker/worker-configuration.d.ts` after any change to `wrangler.jsonc`.
  - **Server state (phase 4):** the `Probe` Durable Object (`worker/probe.ts`, SQLite-backed, WebSocket hibernation) holds the live probe and, from phase 6, everyone's idle game (credits, upgrades, patches) in its own SQLite; D1 `onesmallclick` (binding `DB`, schema in `migrations/`) holds devices, missions, km per day, pings, the mission log, and a copy of progress. Secrets `ADMIN_KEY`, `DEVICE_SECRET`, `TURNSTILE_SECRET`, and from phase 8a `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Nav set both in the Cloudflare dashboard): `npx wrangler secret put` in production, `.dev.vars` locally (git-ignored; locally TURNSTILE_SECRET is Cloudflare's always-pass test secret, and the dev build uses the matching test site key; the Google ones are empty locally, so Google sign-in says it's off; `DEV_SIGN_IN_LINKS="1"` puts the email sign-in link on screen instead of sending it, and must never be set in production).
  - **Local first run:** `npx wrangler d1 migrations apply onesmallclick --local`, and a `.dev.vars` with both secrets. New migrations go to production with `--remote` before the deploy that needs them; Nav runs that (Claude's remote D1 commands are blocked in auto mode).
  - `node scripts/tap-flood.mjs [url]` checks the tap cap (local by default, or the live URL).
  - `npm run sim` prints how many days a mission takes for different crowd sizes, using `shared/balance.ts` and `shared/upgrades.ts`.
  - No `@vitejs/plugin-react`: Vite compiles the JSX itself, so edits reload the page instead of hot-swapping components. Adding it would need Nav's OK (dependency rule).
  - npm blocks install scripts by default here. `workerd` and `esbuild` are approved in `package.json` (`allowScripts`); after a version bump run `npm approve-scripts workerd esbuild`.
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

- **Domain:** onesmallclick.io (planned, not connected). **Live now:** https://onesmallclick.naveessharma.workers.dev (phase 8b, leaderboards, profile and badges, with migration 0009, plus the pixel flags and the phone profile icon, deployed 2026-11-20. Email sign-in is off live until the domain is in Email Service). How to play is at `/how-to-play` and the fact pages at `/milestones/<slug>`. The pixel kit is at `/kit` and the test controls at `/admin` (neither linked, both noindex).
- **Hosting:** Cloudflare Worker `onesmallclick`, with the `PROBE` Durable Object and the D1 database `onesmallclick` (id a772545d-83b9-4468-8b63-7691b9359dd4, created by Nav 2026-11-18).
- **Code:** GitHub `Naveess/onesmallclick` (private), branch `main`. GitHub is blocked at work, so pushes may have to wait until I'm home.
- **Started from** the site-starter template (`Naveess/site-starter`).

### What's in this folder

| Path | What it is |
|---|---|
| `docs/brief.md` | What we're building: features, pages, data, monetisation, open questions. |
| `design/OneSmallClick.dc.html` | **The source of truth for the look.** Screens 1a–1o from Claude Design (updated 2026-11-19 with 1m Campaign map, 1n New probe reveal, 1o Landing burn, the arrival rewards and medals, plus desktop versions; later that day 1a/1b got the **flight view** journey panel and "You've clicked", and 1m desktop went full width with a pixel scrollbar; on 2026-11-20 an "idle pause" signal state was added and 1f got the flight view), with working interactions and the light/dark theme. Group 2 at the bottom (2a/2b) is an unused idea, the curved transfer orbit; ignore it. Open it through a local server (see below). |
| `design/assets/` | The sprites the design file uses (Earth 8 frames, Mars 4, probe 4, burst 6). Kept only so the design file opens. Not shipped. |
| `design/sprites/` | The full PixelLab export (`frames/`, `sheets/`, `stills/`): rotating Earth 9 frames, rotating Mars 5, thruster 5, firework burst 7, plus stills. These frame counts match docs/brief.md. **This is the set that ships** (decided 2026-11-18). See design/sprites/README.md. |
| `design/sprites/flags/` | The 16×12 pixel flags for the leaderboards (prompts 40–41), made by `scripts/make-flags.mjs` from flag-icons (MIT; licence and README there), 54 tidied by hand in `scripts/flags/overrides.json`. |
| `design/icons/` | The design's ten 9×9 UI icons as `currentColor` SVGs, with their theme colours in its README. |
| `src/` | The React app. `components/` holds the pixel kit (Window, PixelButton, Sprite, PixelIcon, Sky, ThemeToggle) and the game home pieces (ThrustButton, JourneyTrack, GameCards, UpgradesSheet, GameShell, from phase 5 SafeMode, PingButton and Toast, from the flight view phase FlightView (replaces JourneyTrack, which is kept unused until approved) and ClickCounter, from phase 6 WelcomeBack, from phase 7b MilestoneMoment and the shared `Postcard.css`); `pages/` holds `/` (game home), the mission log (`/log`, phase 7a), the leaderboards (`/ranks`, `RanksPage`) and the profile (`/profile`, `ProfilePage`) from phase 8b, sign-in (`/sign-in`, phase 8a), the unused "coming soon" `StubPage`, and `/kit`; `game/` holds the rules (`rules.ts`), the store (`store.ts`: the shared probe and your km today are real from phase 4, the signal and Ping from phase 5, credits, upgrades and welcome back from phase 6, the vote from phase 7a, the milestone moment from phase 7b, your click counts from the flight view phase, your badges from 8b, and it marks what is still fake; test switches `?crew=handful`, `?ads=off`), the flight view's drawn-in-code art (`flightArt.ts`, until PixelLab sprites replace it), the WebSocket client (`probeClient.ts`) and the Turnstile helper (`turnstile.ts`); `pages/AdminPage.tsx` is `/admin`; `router.ts` is a tiny in-app router; `styles/theme.css` is docs/tokens.css under readable names; `sprites.ts` lists every sprite with its retimed duration; `theme.ts` handles the theme toggle; `content/pages.css` styles the plain HTML content pages (see `scripts/`). Links to content pages (`/how-to-play`, `/milestones/…`) do a full page load, because they aren't part of the React app. |
| `worker/` | The Worker: `index.ts` (only `/api/*`: health, session, the probe WebSocket, ping, vote, log, admin), `auth.ts` (phase 8a: email link, Google, sessions, names, country, sign out, delete account), `boards.ts` (phase 8b: the leaderboards and the profile, `/api/leaderboard` and `/api/profile`; 8c: the mission credits, `/api/credits`), `email.ts` (the only file that sends email: sign-in links, and from 8d the opt-in crew emails from a separate sender), `probe.ts` (the `Probe` Durable Object; from 8a it keeps progress, today's numbers, pings and votes per player: the account when signed in, else the device; from 8b it awards the badges; from 8c it flies the Grand Tour leg by leg: arrival, orbit, the branch vote, the next leg), `device.ts` (the signed device cookie), and its generated types. |
| `shared/` | Code both the app and the Worker use: `balance.ts` (every number that sets the trip's length: route, coasting, the self-balancing thrust, the idle pause, today's pace, the signal window and setback; approved in prompt 28), `mission.ts` (re-exports the balance; tap cap, the signal tiers, the heartbeat, the probe's clock while paused, the arrival estimate, and the WebSocket message types), `upgrades.ts` (upgrade prices and effects, tap power, auto-thrust, prestige, the offline cap), `account.ts` and `names.ts` (phase 8a: the session and sign-in types, generated names), `campaign.ts` (phase 8c: the Grand Tour from content/campaign.json: stops, leg lengths, probes, the branch votes), `clicks.ts` (the click badges' thresholds), `badges.ts` and `boards.ts` (phase 8b: every badge's rule and name; the leaderboard and profile types), `votes.ts` (picking each round's options, the winner, the vote types) and `milestones.ts` (the six milestones, read from `content/milestones.json`). |
| `content/` | Game content as JSON, checked into git: `vote-options.json` (the daily vote's pool, each detour with a fact and its source) and `milestones.json` (the six milestones: distance, the moment's fact, the fact page's text and sources). Both approved by Nav on 2026-11-19; any change to their facts needs a checked source. From E0 (approved by Nav 2026-11-20; nothing reads them yet): `campaign.json` (the Grand Tour: stops, branches, distances, probes, upgrade names, planet tech, cosmetics) and `facts/mars.json` (30 checked fun facts, the template for every destination). |
| `migrations/` | D1 schema migrations (`0001_init.sql`: devices, missions, daily_km; `0002_signal.sql`: pings, log_entries; `0003_progress.sql`: the copy of everyone's progress; `0004_votes.sql`: vote_days, votes; `0005_milestones.sql`: milestones reached; `0006_retune.sql`: what each device's taps moved the probe each day; `0007_accounts.sql`: accounts, sessions, sign-in links, and account_id on devices and daily_km; `0008_clicks.sql`: credited THRUST taps per day, for "You've clicked"; `0009_badges.sql`: the badges each player has earned; `0010_arrival.sql`: each leg's stop, length and crew balance on `missions`, and `mission_crew`, who helped on each leg, for the credits). |
| `scripts/` | `tap-flood.mjs`, the tap-cap check. `make-flags.mjs` (with `flags/overrides.json`) remakes the pixel flags from a downloaded flag-icons package. `sim.mjs` (`npm run sim`), the mission-length simulation. `build-pages.mjs` writes the plain HTML content pages (`/how-to-play`, `/milestones/<slug>`) and their `/content.css` into `public/` from `content/` (git-ignored; runs before `npm run dev` and `npm run build`, or on its own with `npm run pages`). Their own styles are `src/content/pages.css`. |
| `public/` | Served as-is at the site root: `sprites/` and `icons/` (copies of `design/sprites/` and `design/icons/`, unchanged), and `fonts/` (Pixelify Sans and VT323, self-hosted, with their OFL licences). Also the generated content pages (`how-to-play.html`, `milestones/`, `content.css`), which are git-ignored. |
| `docs/expansion.md` | The Grand Tour plan (E0): the route, distances, carry-over, rewards, facts and the open decisions. Phases E1–E5 are in docs/plan.md. |
| `docs/todo.md` | Loose ends and decisions that aren't a phase yet, including the content still waiting for Nav's approval ("Before launch"). |
| `docs/prompts/` | Every prompt Nav has given, numbered (see its README). |
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

- 16-bit SNES pixel-art look. Always set `image-rendering: pixelated`. Scale sprites only by whole numbers, never halve them (decided 2026-11-18): where the design shows art smaller than its file, make a sprite at that size (as with `mars-rotating-64-sheet.png`).
- Fonts: **Pixelify Sans** for UI and headings, **VT323** for numbers, dates and timers Both are self-hosted with the app, not loaded from Google Fonts (decided 2026-11-18).
- Colour meaning: **light blue = action and the probe's path**, **light orange = signal, milestones and celebration**.
- Windows have a double border: a 2px light border, a 2px dark outer outline and a 2px inset.
- Animations use `steps()` timing so they move like pixel art, never smoothly. Respect `prefers-reduced-motion`.
- Colours: docs/tokens.css is the locked palette (decided 2026-11-18). Don't add colours outside it without asking. Agreed exceptions (2026-11-18): THRUST's fixed `--thrust-*` colours, PING's fixed `--ping-*` colours, and see-through versions of palette colours (`--glow-blue`, `--glow-orange`, `--scrim`), all at the end of `src/styles/theme.css`. Also agreed (2026-11-19): the medal colours (`--medal-*`, listed at the end of docs/tokens.css), added to `src/styles/theme.css` by the phase that first uses them. Also agreed (2026-11-20, prompt 41): the pixel flags keep their real colours (they're art in a sprite, `design/sprites/flags/`), and the flight view's `--space-dusk` and `--glow-mars`.
- Content pages (How to play, milestone fact pages, privacy, terms, contact) are plain HTML pages built at deploy time, so search engines and AdSense can read them. The game itself is the React app.
- Two themes: dark (the night sky, which is the default) and light ("daylight mission control"). Follow the system setting by default, with a toggle that's saved per player. The THRUST and PING buttons look the same in both themes.
- Accessibility: use real `<button>` elements, put aria-labels on icon-only buttons, and keep text contrast at 4.5:1 or better in both themes.
- Leave space for ads where the design shows an ad slot, because the aim is Google AdSense. Keep ads at least 150px from THRUST.
