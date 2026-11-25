# To do

What's left, in the order it's needed. Rewritten 2026-11-25 (prompt 86): finished items are gone from here, and their history is in docs/changelog.md (one line per phase) and docs/plan.md (each phase's status). Tick items off as they're done, or move them into docs/plan.md when they become a phase.

## Start here (25 Nov, prompt 122)
- **Everything built is live:** version `ace47a54` (tag `a1a-live`, prompt 121). Live, newest first:
  - **A1a** (prompt 120, migration 0020): /admin needs your Google game sign-in (on `ADMIN_EMAILS`) plus the admin key; tabs Players, Game, Reports; search, lists and a page per player; every admin action logged.
  - **Q1b** (prompts 107-118, migration 0019): the Discord bot posting to #mission-log, install as an app, and opt-in alerts (signal final hour, landing burn, vote closing). Checked by Nav on a real iPhone.
  - **M2** (tag `m2-live`): km first with a KM | MI toggle.
  - Earlier: Q1a (local times, crew goal, Report a bug or idea), M (miles), D (desktop layouts), the NASA postcard photos, G1 (sign-in nudges), 2b (landing burn), B1 (Early Beta) and B2 (the launch wipe, not run).
- **Next to build:** A1b (fixes and player save states; needs the R2 bucket `onesmallclick-snapshots`, which Claude can create when asked), then A1c (game save states, maintenance mode, docs/runbook.md), then A2 (decisions 36-40 first), then G2.
- **Backups (25 Nov, prompt 122):** live D1 backed up and encrypted, latest `d1-onesmallclick-2026-11-25-2255-checkpoint-a1a.sql.enc`, in Drive (OneSmallClick > Backups) and in `Documents\onesmallclick-backups\encrypted\`. Code, docs and tags are on GitHub; art in Drive (OneSmallClick > Sprites). Run `npm run backup -- <label>` from Git Bash (PowerShell can't find openssl).
- **Next prompt 123, next migration 0021.** Run `git pull` first: other sessions push here too.

## Launch day (15 Dec 2026, may move)
- [ ] **If the date moves:** change `endsAt`, `launchLabel` and `launchShort` in content/beta.json, and the date in its `body` and `badgeHowGuest` lines ("15 December", "15 Dec"), then deploy. Early Beta badges are given until `endsAt`, and the banner shows until then.
- [ ] **At launch (00:00 UTC, when `endsAt` passes):** back up D1 (`npx wrangler d1 export onesmallclick --remote --output ../onesmallclick-backups/d1-onesmallclick-<date>-pre-launch.sql`).
- [ ] **Run the wipe:** /admin → "Launch wipe (phase B2)", type WIPE EVERYTHING, confirm. Then check: the home shows mission day 1 and 0 km, the log says "Launch day", your profile has only Early Beta, the leaderboard is empty, the banner has gone.
- [ ] **Redeploy once after `endsAt`** so How to play drops its early-access box (the content pages are built at deploy time).
- [ ] **Before launch, if possible:** the phase G sign-in nudges (more Early Beta accounts) and 8d's opt-in box (so launch-day sign-ups can opt in to crew emails).

## Checks for Nav (live now)
- [x] **B1:** the early-access banner on a phone (prompt 87: looks fine).
- [x] **2a, 2b and E2:** approved from screenshots of a local copy (prompt 92). The live versions show at the Mars arrival after launch.
- [x] **Publish the Google sign-in app** (done by Nav 25 Nov, prompt 89; no logo, so no verification). It's in "Testing" (prompt 87), so only listed test users can sign in, and email sign-in is off until payday: new players can't make an account or get the Early Beta badge. Google Cloud console → Google Auth Platform → Audience → Publish app (In production). The app only asks for "openid email", so Google needs no verification. Then sign in from an account that isn't a test user to check. Branding (prompt 88): leave the logo off for now (a logo makes Google require verification); home page, privacy and terms links are the workers.dev ones. After the domain move, add onesmallclick.io as an authorised domain and switch the links; the logo (`design/brand/logo-120.png`) can go on then, with verification.
- [x] **Older checks (19–20 Nov):** "Back to the mission" on the account page, and the click count surviving a reload: screenshots sent (prompt 91), both fine.

## Payday (from Monday 30 Nov): domain, Email Service and Workers Paid

### 1. Setup (Nav)
- [ ] **Buy onesmallclick.io and add it to Cloudflare** (.com is taken; .co.uk reads as UK-only).
- [ ] **Turn on Email Service for onesmallclick.io** (its DNS records are added in Cloudflare).
- [ ] **Switch on Workers Paid** ($5/month). Email Service needs it, and so does launch traffic.

### 2. The domain move (Claude, after step 1; Nav does the dashboard steps Claude lists)
- [ ] Add the custom domain to the Worker. workers.dev then redirects to it.
- [ ] **Add onesmallclick.io to the Turnstile widget's hostnames**, or Ping and votes fail there.
- [ ] **Add the new address to the Google OAuth client** (authorised origin and redirect URI), or Google sign-in fails there.
- [ ] Guests start fresh on the new address (cookies belong to the old one). Accounts just sign in again. That's fine before the 15 Dec wipe.
- [ ] **Check crew-link previews** in the Facebook and X link debuggers.

### 3. Email sign-in goes live (Claude)
- [ ] Add the `send_email` binding and `EMAIL_FROM` (see wrangler.jsonc), deploy, and test an email link on Nav's phone.
- [ ] **privacy@onesmallclick.io**: set up where it forwards (Email Routing), then switch the privacy, terms and contact pages from the Gmail address to it (`CONTACT_EMAIL` in scripts/build-pages.mjs).

### 4. 8d: Crew emails (Claude; docs/plan.md "8d: Crew emails")
- [ ] **Set up the crew sender** (e.g. `crew@onesmallclick.io`), separate from the sign-in sender.
- [x] **Decisions 22–25 approved** (prompt 91): crew@onesmallclick.io, the top 10 named (km / miles), existing accounts asked once.
- [ ] **Build 8d:** the opt-in box and toggle, one-click unsubscribe, the halfway, **landing burn** (prompt 85: "the final burn has started, join the final push"; the Probe's `onBurnStart()` hook) and arrival emails, batched sending, /admin previews and test sends.
- [ ] **Check the opt-in and email wording** against UK rules (PECR and GDPR). Claude isn't a lawyer.
- [ ] **Privacy page:** crew emails and how to stop them.

### 5. Phase 9b (docs/plan.md, phase 9)
- [ ] **AdSense** (Nav has an account, prompt 91): add onesmallclick.io to it after the domain move, then the ad slots with the consent message, and the privacy page updated for ads.
- [ ] **The live load test** (docs/load-test.md), if Nav OKs it.
- [ ] **The launch checklist** on a real phone (docs/launch-checklist.md).

## Build phases still to do (in order)
- [x] **M (miles) is live** (prompts 103–104, version `7746bc10`, tag `m-live`; docs/plan.md "M: Miles status"). Next: Q1 (decisions 29–32 first), then G2.
- [x] **D: desktop layouts are live** (prompts 99–102, version `3c1bb51c`, tag `d-live`; docs/plan.md "D: Desktop layouts"): 1o, 1k and 1n desktop match the design, and the landing burn has its dusk sky.
- [x] **G1 is live** (built prompt 93, deployed prompt 94: encrypted backup pre-G1 in Drive, migration 0017 `--remote`, version `48bfb759`, tag `g1-live`). Next, in order: ~~the NASA postcard photos~~ (live, prompt 98), M (miles), **Q1 (the first five, added 25 Nov)**, **A1 and A2 (the admin panel, added 25 Nov)**, then G2.
- [ ] **G** (the full plan): the Invite crew button and Bring your crew card, the share nudge, sign-in nudges for guests (now also "sign in for the Early Beta badge" until launch), and the /admin Players card. Check as a guest and signed in, on a phone and a laptop: at most one toast a day, nothing in safe mode or the final 60 seconds. After a week, read the Players and K-factor cards and keep what works.
- [x] **Q1a is live** (prompt 105, version `0b44dac0`, tag `q1a-live`; docs/plan.md "Q1a status"): times in each player's own timezone, the daily crew goal, and "Report a bug or idea" (migration 0018). Decisions 29–32 approved.
- [x] **Q1b: install as an app with opt-in notifications (signal final hour, landing burn, vote closing), and the Discord bot.** Nav made the Discord server and webhook and set `DISCORD_WEBHOOK_URL` (prompt 107); the invite link is https://discord.gg/JPEree2vZF (never expires, prompt 112; in content/community.json). **Q1b is live and checked (prompts 112-118):** Nav confirmed the /admin test post reached #mission-log and the iPhone Add to Home Screen steps work. A real test alert arrived on Nav's phone too (prompt 119).
- [ ] **A1 and A2: the admin panel, before launch** (docs/plan.md "A"; Nav, 25 Nov), after Q1 and before G2. Decisions 33-35 approved (prompt 120); A1 is split into A1a (live, prompt 121), A1b and A1c:
  - A1: admin sign-in (your Google account plus `ADMIN_KEY`), find any player, the player page, fixes (reset, set values, add or remove rewards, name, country, merge, export, delete), save states for every player and the probe (R2), restore with a before-and-after view, the emergency rollback, maintenance mode and docs/runbook.md;
  - A2: warn, time out, hide from boards, ban, the Flags queue, "Report name", the name blocklist, messages (inbox, banner, push, Discord, templates, gifts), and the crew rules on the terms page.
  - [x] **A1a is live** (`ace47a54`, tag `a1a-live`): admin sign-in, the Players tab, the player page, the admin log.
  - [ ] **A1b:** the fixes and player save states (R2 bucket `onesmallclick-snapshots`); starts recording name history.
  - [ ] **A1c:** the game's save states, maintenance mode, docs/runbook.md. The emergency rollback waits until after launch (a runbook entry until then).
  - [ ] **A2:** decisions 36-40 first.
- [ ] **A3, after launch:** the Game tab, feature switches, the Health tab, the full Log tab, and Feedback and Flags together.
- [ ] **Q2–Q6, after Q1:**
  - Q2: settings, the first-visit guide, haptics and sound;
  - Q3: random space events, the daily quiz, the postcard album, and a seasonal cosmetic for December (with or after 2c);
  - Q4: the live crew ticker and emoji cheers;
  - Q5: retention (D1 and D7) in the Players card, and error alerts;
  - Q6 (after launch): science objectives, Season 2 and a supporter tip jar.
- [ ] **E4b part 2c: cosmetics** (skies, THRUST trails, probe paints; unlocked at arrival, picked on the profile). Needs the art below; Mars's (Mars-dust sky, Red dust trail, Gold foil paint) before the first arrival, about mid-January.
- [ ] **Jupiter's content** (E3 pipeline, before the Ceres/Vesta arrival, about mid-February): 4–6 milestones, 30 facts and 8+ detours, all NASA-checked, for Nav to approve. Then Europa and Ganymede, and so on, a leg ahead. `npm run check-leg <stop>` lists what's missing.
- [ ] **Wire the planet tech kinds that aren't yet:** Ganymede's safeAuto, Enceladus's pingCredits, Arrokoth's postcardCredits and Titania's nightTapCredits (shared/tech.ts and the Probe), before those legs. `check-leg` fails them until then.
- [ ] **E5: later ideas** (docs/plan.md): monthly country trophies, streamer mode, chiptune sound and the rest. Each gets its own plan first.

## PixelLab art still to make
Free plan: 5 generations a night, banked up to 20, one job at a time. **About 31 generations in all (6–7 nights).** Prices checked 25 Nov:
- a `create_1_direction_object` batch costs 10 (64 items at 32px or less, or 16 items at up to 64px);
- an `animate_object` engine loop costs 1 (4 or 8 frames only, not 5);
- a 512×512 `create_image_pro` image costs 25 and won't tile.

Back up every master to Drive (OneSmallClick › Sprites). File names are the ones `npm run check-leg` looks for.

**For the first arrival (Mars, about mid-January), in this order:**
1. [ ] **OSC-2 engine loops:** Ceres Hopper and Vesta Surveyor (`public/sprites/thruster-<probe id>-sheet.png`). 2 generations. The code expects 5 frames like OSC-1's: switch it to 4 or 8 when these arrive (src/sprites.ts and `check-leg`).
2. [ ] **Map and reveal art, one 16-item batch at 64px (10 generations):** Ceres 38, Vesta 34×29, Ganymede 54, Titan 50, Enceladus 34, Uranus 54, Miranda 30, Titania 36, Neptune 54, Pluto 38, Arrokoth 46×28, Heliopause, plus spare slots for the heliopause ring (58) and the probe-position ring (36) (`public/sprites/<stop>.png`). They're drawn in code now (src/game/mapArt.ts, flightArt.ts).
3. [ ] **16×16 icons, one 64-item batch at 32px (10 generations), then reduce to 16px:** a passport stamp for every stop but Mars (Ceres, Vesta, Jupiter, Europa, Ganymede, Saturn, Titan, Enceladus, Uranus, Miranda, Titania, Neptune, Pluto, Arrokoth, Heliopause) and a "branch not chosen yet" icon (`public/sprites/stamps/<stop>.png`); in the same batch, the flight view's bits (exhaust flame frames, the comet 18×5, the Sun 20×20, small Vesta 16×14) and the asteroid- and Kuiper-belt strips.
4. [ ] **Mars cosmetics (free, no generations):** the Mars-dust sky as a recolour of `nebula-tile.png` (a big tile costs 25 and wouldn't tile), the Red dust trail (32×8) and Gold foil paint (OSC-1 repainted, 64×40), drawn in the free pixelart workbench.

**Later, a leg ahead of each arrival:**
5. [ ] **Engine loops for the other nine probes:** Europa Lander, Ganymede Orbiter, Titan Glider, Plume Diver, Cliff Climber, Titania Lander, Heart Lander, Snowman Flyby, Long Voyager. 9 generations, 1 each.
6. [ ] **The other cosmetics (free, workbench):** skies (Salt-glow, Storm-band, Orange-haze, Deep-blue storm, Interstellar) as recolours of the nebula tile; trails (Aurora, Ring-dust, Geyser-plume, Fairy-light; default blue sparks) as 32×8 strips; paints (Basalt-grey, Ice-crack, Side-spin teal, Patchwork, Heart, Snowman-red) as 64×40 repaints. The list is in content/campaign.json (`cosmetics`).
7. [ ] **Tidy the medals** (Gold, Silver, Bronze, 10×15) in the free workbench and swap them into src/game/rewardArt.ts.

**Not PixelLab (Claude, free):**
- [ ] **Link previews for Ceres and Vesta:** two Destination file images and nine milestone images (`npm run check-leg ceres` / `vesta` lists them), by adding lines to scripts/make-previews.mjs.
- [ ] **The map share card**, 1080×1080 (in code, like the fact card).
- [ ] **UI icons, 9×9:** map, flag, share, close, exported to SVG like the other ten in `design/icons/`.
- [x] **Postcard photos: real NASA photos** (prompts 91, 95-97). Picked by Nav from contact sheets, wired in (prompt 97) and live (prompt 98, version 9550bc10, tag `postcards-live`): every Mars, Ceres and Vesta milestone and each landing postcard, with its credit (docs/postcard-photos.md). Still open: **Nav sends the MSSS request** (the msss.com Request Info form, "Image/Data Use Rights"; Mars 5 swaps to Curiosity's sunset, PIA19400, if they say yes) and **the Dawn request** (MPS press office); both drafts are in docs/postcard-photos.md. Each new leg needs its photos before `npm run check-leg` passes.

## Clean-ups (Claude, small)
- [ ] **Delete `src/components/JourneyTrack.tsx` and `JourneyTrack.css`.** The flight view replaced them and was approved (prompt 33).
- [ ] **Whole-number scaling:** the campaign map and the desktop arrival (1k) show `mars.png` at half size. Use the 64px Mars instead.
- [ ] **Load only the current leg's content in the app** before Jupiter's (each leg's files add about 6 kB gzipped to the bundle).

## Decisions for Nav
- [x] **Off-computer D1 backups** (prompt 92): Cloudflare's Time Travel plus encrypted copies in Drive, kept 90 days (docs/plan.md, "Backups and retention"). First one uploaded 25 Nov.
- [ ] **Nav, from home: copy `BACKUP_PASSPHRASE` from `.dev.vars` into your password manager.** Without it the Drive backups can't be opened. (Claude made a random 40-character one; it's never been shown in chat.)
- [x] **The privacy page's backup lines are live** (since the Q1a deploy).
- [x] **Countries board: signed-in players only** (Nav, prompt 91, to promote signing up). Built with G1.
- [x] **The heliopause's distance:** 122 AU, where Voyager 1 crossed it (NASA, checked 25 Nov, prompt 91): 12,344.5 million km from Pluto, 11,653.6 million km from Arrokoth (content/campaign.json).
- [x] **Postcards: real NASA photos** (Nav, prompt 91). See "Postcard photos" under the art list.
- [x] **Miles:** the whole game and the emails (prompt 92): phase M in docs/plan.md.

## Before each new leg (about a week before arrival)
Run `npm run check-leg <stop>` for both branches (E3). Content must pass; the art list is the PixelLab to-do. New content goes in `content/milestones/<stop>.json`, `content/facts/<stop>.json` and `content/detours/<stop>.json` (copy Ceres's), with one import line each in `shared/content.ts`, and Nav's approval date in each file's `approved`.
- [ ] Both branches' probes, engine loops, map art and stamps.
- [ ] Upgrade names and descriptions for both probes (content/campaign.json).
- [ ] The planet tech wired for the stop (see "Build phases").
- [ ] 4–6 milestones, 30 facts and 8+ detours per branch, each checked against its source.
- [ ] Link previews for its milestones and Destination file.
- [ ] Cosmetic art and postcard photos.
- [ ] A social post: "Next stop: the crew decides".
