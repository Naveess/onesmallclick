# To do

What's left, in the order it's needed. Rewritten 2026-11-25 (prompt 86): finished items are gone from here, and their history is in docs/changelog.md (one line per phase) and docs/plan.md (each phase's status). Tick items off as they're done, or move them into docs/plan.md when they become a phase.

## Start here (25 Nov, prompt 86)
- **Everything built is live:** version `d79ceb92` (tag `e4b2b-live`), with E4b part 2b (the landing burn, migration 0016), B2 (the launch wipe, not run) and B1 (the early-access banner and Early Beta badge). The live probe is on a fresh Earth → Mars leg (mission 9).
- **Backups (25 Nov):** live D1 exported before each deploy to `Documents\onesmallclick-backups\` (latest `d1-onesmallclick-2026-11-25-pre-E4b2b.sql`); code, docs and tags on GitHub; new art in Drive (OneSmallClick › Sprites: `onesmallclick-art-2026-11-25.zip`, and the 19 Nov stills in `onesmallclick-stills-2026-11-19.zip`). The D1 exports are on this computer only (see "Decisions for Nav").
- **Next prompt 87, next migration 0017.** Run `git pull` first: other sessions push here too.

## Launch day (15 Dec 2026, may move)
- [ ] **If the date moves:** change `endsAt`, `launchLabel` and `launchShort` in content/beta.json, and the date in its `body` and `badgeHowGuest` lines ("15 December", "15 Dec"), then deploy. Early Beta badges are given until `endsAt`, and the banner shows until then.
- [ ] **At launch (00:00 UTC, when `endsAt` passes):** back up D1 (`npx wrangler d1 export onesmallclick --remote --output ../onesmallclick-backups/d1-onesmallclick-<date>-pre-launch.sql`).
- [ ] **Run the wipe:** /admin → "Launch wipe (phase B2)", type WIPE EVERYTHING, confirm. Then check: the home shows mission day 1 and 0 km, the log says "Launch day", your profile has only Early Beta, the leaderboard is empty, the banner has gone.
- [ ] **Redeploy once after `endsAt`** so How to play drops its early-access box (the content pages are built at deploy time).
- [ ] **Before launch, if possible:** the phase G sign-in nudges (more Early Beta accounts) and 8d's opt-in box (so launch-day sign-ups can opt in to crew emails).

## Checks for Nav (live now)
- [ ] **B1:** the early-access banner on a phone (closed, More, ×), and the Early Beta badge across the top of your profile.
- [ ] **2a and 2b only show at an arrival.** To see them before the first real one, use /admin's "Start the landing burn now" (it lands the live probe for everyone, so only when you're happy to), or wait for the Mars arrival after launch.
- [ ] **E2:** the new probe reveal (it shows when the probe sets off on a new leg, so after the first arrival).
- [ ] **Google sign-in for friends:** if the OAuth consent screen's publishing status is "Testing", only listed test users can sign in. Add them, or publish the app.
- [ ] **Older unticked checks (19–20 Nov):** the flight view follow-up live (1f safe mode with the flight view, "Back to the mission" on the account page), and that the counts survive a reload.

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
- [ ] **Approve decisions 22–25** in docs/plan.md (sender, top 10 named, existing accounts asked once).
- [ ] **Build 8d:** the opt-in box and toggle, one-click unsubscribe, the halfway, **landing burn** (prompt 85: "the final burn has started, join the final push"; the Probe's `onBurnStart()` hook) and arrival emails, batched sending, /admin previews and test sends.
- [ ] **Check the opt-in and email wording** against UK rules (PECR and GDPR). Claude isn't a lawyer.
- [ ] **Privacy page:** crew emails and how to stop them.

### 5. Phase 9b (docs/plan.md, phase 9)
- [ ] **AdSense** in the ad slots, with its consent message, and the privacy page updated for ads.
- [ ] **The live load test** (docs/load-test.md), if Nav OKs it.
- [ ] **The launch checklist** on a real phone (docs/launch-checklist.md).

## Build phases still to do (in order)
- [ ] **G: Grow** (docs/plan.md "G: Grow"): the Invite crew button and Bring your crew card, the share nudge, sign-in nudges for guests (now also "sign in for the Early Beta badge" until launch), and the /admin Players card. Check as a guest and signed in, on a phone and a laptop: at most one toast a day, nothing in safe mode or the final 60 seconds. After a week, read the Players and K-factor cards and keep what works.
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
- [ ] **Postcard photos** (Nav picks or approves): a real space photo for each milestone (Mars 6, Ceres 5, Vesta 4) and a landing postcard per stop. Check each licence (prefer public-domain NASA/JPL) and note the credit. Or turn them into pixel art (an open question in the brief). Until then the postcards show "Postcard photo coming soon", and the landing postcard shows the destination.

## Clean-ups (Claude, small)
- [ ] **Delete `src/components/JourneyTrack.tsx` and `JourneyTrack.css`.** The flight view replaced them and was approved (prompt 33).
- [ ] **Whole-number scaling:** the campaign map and the desktop arrival (1k) show `mars.png` at half size. Use the 64px Mars instead.
- [ ] **Load only the current leg's content in the app** before Jupiter's (each leg's files add about 6 kB gzipped to the bundle).

## Decisions for Nav
- [ ] **An off-computer copy of the D1 backups?** They're only in `Documents\onesmallclick-backups\`. They hold players' emails and names, so if they go to Drive, the privacy page should say backups are kept there.
- [ ] **Countries board:** signed-in players only, later? It counts everyone for now (guests by device country).
- [ ] **The heliopause's distance:** no NASA page found gives it. The map says "distance not yet charted".
- [ ] **Postcards:** real photos, or pixel-art versions?

## Before each new leg (about a week before arrival)
Run `npm run check-leg <stop>` for both branches (E3). Content must pass; the art list is the PixelLab to-do. New content goes in `content/milestones/<stop>.json`, `content/facts/<stop>.json` and `content/detours/<stop>.json` (copy Ceres's), with one import line each in `shared/content.ts`, and Nav's approval date in each file's `approved`.
- [ ] Both branches' probes, engine loops, map art and stamps.
- [ ] Upgrade names and descriptions for both probes (content/campaign.json).
- [ ] The planet tech wired for the stop (see "Build phases").
- [ ] 4–6 milestones, 30 facts and 8+ detours per branch, each checked against its source.
- [ ] Link previews for its milestones and Destination file.
- [ ] Cosmetic art and postcard photos.
- [ ] A social post: "Next stop: the crew decides".
