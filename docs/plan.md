# Plan

The live phase list. Every phase ends deployed on workers.dev (https://onesmallclick.naveessharma.workers.dev). After each one: a changelog line, a commit and push, a deploy, then a stop for your OK (see CLAUDE.md). Nav runs `npm run deploy` (from phase 2; it builds, then runs `wrangler deploy`). Claude's deploy command is blocked in auto mode.

Written 2026-11-18 from docs/brief.md, docs/design-brief.md, the design file and design/sprites/README.md. Phases are ticked as they're built.

- [x] **Phase 1: Scaffold.** Site-starter template filled in, brief saved, placeholder page live on workers.dev, code on GitHub.
- [x] **Phase 2: App shell and pixel kit** (deployed 8fc6a83 and approved, 2026-11-18)
- [x] **Phase 3: Game home with fake data** (deployed 52b688b, THRUST lag fix d9cda91 deployed, approved 2026-11-18)
- [x] **Phase 4: The shared probe** (deployed c189904 and approved, 2026-11-18)
- [x] **Phase 5: Signal, Ping and safe mode** (deployed from 7261f30 and approved 2026-11-19)
- [x] **Phase 6: Idle upgrades and offline thrust** (deployed from 3faffe7 and approved 2026-11-19)
- [ ] **Phase 7: Votes, mission log, milestones and fact pages** (split in two, decided 2026-11-19)
  - [x] **7a: The daily vote and the mission log** (deployed from d80f813 and approved 2026-11-19)
  - [x] **7b: Milestones, the milestone moment, fact pages and How to play** (deployed from 31172c3 with migration 0005, 2026-11-19)
- [ ] **Phase 8: Accounts, leaderboards, profile and arrival** (split in three, decided 2026-11-19)
  - [x] **8a: Accounts and sign-in** (deployed from 02849c8 with migration 0007, 2026-11-19; Nav's checks tonight)
  - [x] **Flight view** (added 2026-11-19, before 8b): the game home's flight view replaces the straight track, plus "You've clicked". Built 2026-11-19 (prompt 32), deployed by Nav with migration 0008; checks passed 2026-11-20 (prompt 33) except that the counts after a reload weren't confirmed. Follow-up built 2026-11-20 (prompt 35) and deployed (prompt 36, version f65a4318); checked live by Nav (ticked in prompt 53).
  - [x] **8b: Leaderboards, profile and badges** (now also awards the three click badges). Built 2026-11-20 (prompts 37–38); migration 0009 applied and deployed by Claude at Nav's request (prompt 39, version 4982850b); checked live by Nav (prompt 40; ticked in prompt 53).
  - [x] **E0: Grand Tour planning** (plan only, before 8c). Planned 2026-11-20 (prompt 43) and approved by Nav (prompt 44): every recommendation in docs/expansion.md, section 11. Next: 8c.
  - [x] **8c: Arrival and credits** (its destination vote is the Grand Tour's first branch, Ceres or Vesta). Built 2026-11-20 (prompts 45–46); migration 0010 applied and deployed by Claude at Nav's request (prompt 47, version 93ab7f08); checked by Nav on the live site and approved (prompt 48), mission reset afterwards.
  - [ ] **8d: Crew emails** (added 2026-11-20, after 8c and before launch; **waits for the payday setup**, see docs/todo.md "Payday"): an opt-in halfway "help us make the push" email and an arrival round-up with your contribution, the top contributors and the next-destination vote. Needs the domain, Email Service and Workers Paid.
  - [x] **E4b part 1: the medal pace line and the Destination file card** (before launch; straight after 8c). Built 2026-11-20 (prompts 49–50), with `/destinations/mars` pulled forward from E4; live (c6e1027f) and approved (prompt 52).
- [ ] **Phase 9: Launch hardening, ads and legal pages** (split in two, prompt 54)
  - [x] **9a: now** (the network cap, the load test, terms and contact, the crash screen, monitoring, the launch checklist). **Deployed 2026-11-21** (prompt 58, version 17358aa0) and checked by Nav (prompt 60): see "Phase 9a status" below.
  - [ ] **9b: after payday** (the domain, Workers Paid, AdSense and its consent message, the live load test, then the launch reset)
- [ ] **S: Sharing and invites (K-factor)** (added 2026-11-20, after 9a and before E1, so the growth loop is ready for launch): share buttons for WhatsApp, X, Facebook and more at every big moment, rich link previews, personal crew invite links, recruit badges, and a K-factor panel in /admin. It also takes over E4's map card and share texts.
- [ ] **E1: The campaign map** (1m)
- [ ] **E2: Per-mission probes, upgrade names and per-leg balance**
- [ ] **E3: A content pipeline for each new leg**
- [ ] **E4: Sharing, fun facts and destination pages**
- [ ] **E4b: Collective rewards** (medals, planet tech, stamps, cosmetics, landing burn; part 1 before launch)
- [ ] **E5: Later ideas from the brief**

## What changed from the order in prompt 06

1. **Step (a) is split in two** (phases 2 and 3). The pixel kit (windows, buttons, sprites, sky, themes) is reused by every screen, and the game home on top of it is a full sitting on its own.
2. **Device identity moves into the shared-probe phase.** Batched clicks need a per-device ID from the first real tap, so the server can rate-limit them.
3. **Turnstile goes on Ping (phase 5) and votes (phase 7) as they're built**, not at the end. The workers.dev URL is public, and adding bot checks later is riskier. Phase 9 keeps the per-network cap and the load test.
4. **Test controls arrive in phase 4.** A small admin page behind a secret key can set the distance, fast-forward the clock and drain the signal. Without it you couldn't test safe mode, milestones or arrival on workers.dev without waiting days.
5. **Arrival, mission credits and the next-destination vote go with accounts (phase 8)**, because only accounts appear in the credits.
6. **How to play and the fact pages go together (phase 7)** as static HTML pages. They carry most of the ads, so search engines and AdSense must be able to read them without running the game.

## Rules for every phase

- **The server is the truth.** The browser sends tap counts and requests. The server decides km, credits, pings and votes.
- **One Durable Object, `Probe`, holds the live shared state.** D1 holds everything that has to last (devices, pings, votes, progress, accounts, the log).
- **Every day is a UTC day**: one ping per day, the vote closes at 00:00 UTC, and leaderboards count "today" in UTC.
- **Fake data lives in one store shaped like the real state**, so phases 4 to 8 swap it for server data piece by piece.
- **Testing uses the live workers.dev URL.** At launch only the mission is reset; players keep their progress (decision 6, changed 2026-11-19).
- **Few dependencies**: React, Vite, the Cloudflare Vite plugin, Wrangler and TypeScript. Any other library gets a reason first.

---

## Phase 2: App shell and pixel kit

**Goal:** the Vite + React + TypeScript app replaces the placeholder page, with the pixel-art pieces every screen is built from.

**What gets built**
- Vite + React + TS set up with the Cloudflare Vite plugin, so `npm run dev` runs the app and the Worker together and `npm run deploy` builds and deploys. CLAUDE.md gets the new commands.
- Themes: the colours from docs/tokens.css under readable names, dark and light, following the system setting with a toggle that's saved.
- The sky: the stepped gradient, `nebula-tile.png`, and `stars-far.png` / `stars-near.png` drifting at the design's 140 s and 70 s.
- Components:
  - **Window**: the double border.
  - **PixelButton**: blue, outline and orange.
  - **Sprite**: plays a sheet with `steps()` at whole-number scales only.
  - **PixelIcon**: from design/icons.
  - Fonts: Pixelify Sans and VT323.
- A `/kit` page that shows every piece in both themes. `/` becomes a "launching soon" page built in the new app.

**Data changes:** none.

**How you test it**
- Open `/kit` on your phone and on a laptop. Compare it with the Art kit screen in the design file.
- Switch the theme, then reload. The choice should stick.
- Turn on reduced motion in your phone or OS settings. The stars and sprites should stop moving.
- Zoom in on the sprites. The edges should stay sharp, with no blur.

**Main risks**
- The shipped sheets have more frames than the design's (5/9/5/7 against 4/8/4/6). Each animation needs new timing to keep the design's speed.
- Fonts that load late make the page jump. Self-hosting and preloading them fixes that (see decision 2).

## Phase 3: Game home with fake data

**Goal:** screens 1a (phone) and 1b (desktop) look and feel exactly like the design, with fake numbers ticking.

**What gets built**
- The header with people here, the arrival date, and the Earth→Mars track with the probe and milestone flags.
- THRUST with its particles and the "+km" popup.
- The signal card with Ping, and today's vote card.
- An ad slot placeholder at least 150px from THRUST.
- The bottom tab bar on phones. The wide layout from about 900px.
- The upgrades sheet (1c) for looks only: buying works in the browser, the same as the mock-up.
- The other tabs open "coming soon" stubs.

**Data changes:** none. The fake store lives in the browser.

**How you test it**
- Open `/` at 375px, 390px and 1440px next to the design file.
- Tap THRUST quickly on a real phone. The page should not zoom or lag.
- Check for sideways scrolling at every width.
- Use only the keyboard: Tab to THRUST, then press Space or Enter.
- Check both themes, then run a mobile Lighthouse check.

**Main risks**
- Tap feel on phones: double-tap zoom and tap delay. Fast tapping can spawn hundreds of particles, so they need a cap.
- Keeping the ad slot 150px from THRUST on short phones.

## Phase 4: The shared probe

**Goal:** one real probe. Every tap from every player moves the same distance, live on every screen.

**What gets built**
- **The `Probe` Durable Object** (SQLite-backed, using WebSocket hibernation). Each browser opens one WebSocket to it.
- **Batched taps.** The browser sends a tap count about every 2 seconds. The server:
  - caps taps per second per device;
  - multiplies by tap power (a flat 4 km until phase 6);
  - adds the result to the distance;
  - replies with the km it credited.
- **A once-a-second update to everyone**: distance, crew pace, arrival date and people here (the number of open connections).
- **The arrival date**, worked out on the server from the last few minutes of pace, plus "your taps today got us there X min sooner".
- **An anonymous device ID** in a signed, HttpOnly cookie, with a generated name like `orbit_otter`.
- **Test controls**: `/admin`, behind a secret key that you set with `wrangler secret put`. It can set the distance, move the clock forward and reset the mission.

**Data changes**
- **New D1 database:**
  - `devices` (id, name, country, created_at, last_seen)
  - `missions` (id, destination, route_km, started_at, arrived_at)
  - `daily_km` (day, device_id, km), filled from now on and used by the leaderboards later
- **Durable Object state:**
  - mission id and distance;
  - per-minute pace buckets for the arrival estimate;
  - per-device tap counts for the current window;
  - when it last flushed to D1.
- **Bindings in `wrangler.jsonc`:** the D1 database and the Durable Object.

**How you test it**
- Open the site on your phone and laptop at once. Tap on one and watch the other move within a second. People here should show 2, and drop back when you close a tab.
- Reload the page. The distance should be kept.
- A test script tapping 100 times a second should get capped.
- In `/admin`, set the distance and check the arrival date changes.

**Main risks**
- **One object takes every message.** A single Durable Object handles roughly a thousand messages a second, which is about 2,000 people tapping at once with 2-second batches. That's plenty for launch.
  - Way out: the server can tell browsers to batch less often, and phase 9's load test decides whether to add relay objects.
- **D1 writes per batch would be slow and costly.** The object totals taps in memory and writes to D1 every few seconds.
- **Time must come from the server clock**, never the device.

**As built (2026-11-18)**
- Updates go out when something changes, at most once a second, with no ticking timer. A once-a-second timer would keep the object awake all day (about 86,400 wake-ups against the free plan's 100,000 requests a day). Between updates each browser moves the probe on by coasting, using the server's clock.
- The cap is a token bucket per device: 15 taps a second, up to 45 banked. `scripts/tap-flood.mjs` checks it (local or live).
- The object saves to its own SQLite at most every 5 s and to D1 every 30 s, so a crash loses at most 5 s of distance and 30 s of daily km. (Changed in phase 9a, prompt 56: players' progress and the km waiting for D1 are saved every 60 s, and D1 gets them every 5 minutes; see docs/load-test.md, "Storage".)
- Credits, upgrades, the signal and the vote stay fake until their phases (see `src/game/store.ts`). The "+km" popup shows the server's flat 4 km.

## Phase 5: Signal, Ping and safe mode

**Goal:** the daily ritual. Anyone's Ping keeps the probe talking. If nobody pings in time, it drops into safe mode.

**What gets built**
- **The signal deadline in the `Probe` object**, with an alarm that fires when it runs out.
- **Ping works for real**: one per device per UTC day, with a Turnstile check.
- **A signal badge per ping**: blue with more than 6 hours left, orange under 6 hours, red in the final 60 seconds. It shows as a toast for now; the profile comes in phase 8.
- **The final-60-seconds pulse.**
- **Safe mode (screen 1f)**: the screen dims, the probe's light blinks, and the big orange PING appears. Time is added to the arrival date while the probe is quiet.
- **Mission log entries** such as "Saved with 9 seconds left, pinged by mira_t". They're stored now and shown in phase 7.

**Data changes**
- **D1:**
  - `pings` (day, device_id, account_id, at, seconds_left, tier), one row per device per day
  - `log_entries` (id, mission_id, at, kind, title, body, data)
- **Durable Object:** signal deadline, safe-mode start time, setback so far.
- **Turnstile:** needs a widget in the Cloudflare dashboard (site key plus secret). I'll give you the steps when we get there.

**How you test it**
- In `/admin`, set the timer to 70 seconds and watch the pulse start at 60. Ping in the red zone and you get a red badge.
- Set the timer to 0. Every open screen should go to safe mode and the arrival date should jump. Ping, and the probe recovers.
- Try a second ping on the same day. It should be refused.

**Main risks**
- **Two pings in the same last second.** The object handles one at a time, so the first one wins. The other player is told it's already saved, and keeps their ping for the day.
- **The Turnstile widget on small phones.** Its invisible mode avoids a visible box.
- **One person pinging from many devices.** Phase 9 adds the per-network cap.

**As built (2026-11-18)**
- The deadline lives in the `Probe` object with an alarm (alarms run on real time, so the /admin clock offset is taken off). If the alarm is late, any message checks the deadline too.
- `POST /api/ping` checks the Turnstile token, then the object records the ping in D1 `pings` (one row per device per UTC day). Any ping resets the timer to the full 48 hours. A ping within 5 s of another is told "just saved" and keeps its daily ping.
- Waking the probe earns the red badge. The setback (quiet time × 10, capped at 7 days) is added to the route as km at coasting speed. *(Retuned: × 2, capped at 1 day, at today's pace; see "Retune".)*
- Log entries go to D1 `log_entries` only for notable moments: signal lost, signal restored, and saves in the final 60 seconds. Shown in phase 7.
- The badge shows as a toast for now (an orange window with the badge sprite); the design has no toast, so it's built from the kit.
- `/admin` can set the signal timer (0 = safe mode now) and let the admin's own browser ping again today.
- Ping streaks are real (from `pings`); the "Signal Keeper" badge names stay the design's until phase 8.

## Phase 6: Idle upgrades and offline thrust

**Goal:** each player's own idle game, with every purchase and payout decided on the server.

**What gets built**
- **The upgrades sheet (1c) works for real.** It uses the design's numbers:
  - Cold-gas jets, Ion drive, Solar sail, Steady hands and Crew chant;
  - each upgrade costs ×1.55 more per level;
  - tap km = (4 + 2×hands) × (1 + 0.25×chant).
- **Auto-thrust adds km/s to the shared probe** while you're connected.
- **Welcome back (1d)** shows "counted / not counted", capped at 8 hours.
- **Prestige** ("Hand over the shift"): 3 Mission Patches, each worth +10% thrust forever.

**Data changes**
- **D1:** `progress` (player_id, credits, cold, ion, sail, hands, chant, patches, settled_at). Credits are stored as whole numbers so they never drift.
- **How credits are worked out:** the server adds them up when you connect and with each batch: auto rate × time since last settled. Time spent offline counts for at most 8 hours.
- **Durable Object:** the total auto-thrust of everyone connected, which is added to the crew pace.

**How you test it**
- Buy upgrades and reload. They should be kept.
- Check that tap km matches the formula.
- Close the tab and use `/admin` to move the clock forward 12 hours. Welcome back should show 8 hours counted and 4 hours not counted.
- Edit a purchase request in DevTools to fake credits. The server should refuse it.

**Main risks**
- **Balance.** Thousands of idle players' auto-thrust could outweigh tapping, or finish the mission far too early. This needs the mission-length target (decision 4).

**As built (2026-11-19)**
- The `Probe` object is the authority for everyone's idle game. Each device's progress (credits in thousandths as whole numbers, levels, patches, km since the last handover, and when auto-thrust was last paid) lives in the object's own SQLite. A copy goes to D1 `progress` (migration 0003, keyed by device for now; accounts take over in phase 8) every 30 s (every 5 minutes from phase 9a, prompt 56).
- The rules live in `shared/upgrades.ts`, so the app and the server use one copy. Buy and handover requests go over the WebSocket. The server checks the credits (or the 2,000,000 km), then replies; a refused request just gets the real balance back. Faked messages (30 solar sails at once, an unknown upgrade, extra fields) were refused in testing.
- Taps credit at the device's own tap power: (4 + 2×hands) × (1 + 0.25×chant) × (1 + 0.1×patches), rounded. Auto-thrust is the design's per-level km/s × the same patch boost.
- **Auto-thrust while connected** moves the shared probe continuously (each device once, whatever its tabs) and pays the device in full. **Offline**: when a device comes back, up to 8 hours of its auto-thrust is paid and added to the probe in one go. Time in safe mode doesn't pay.
- **The crew-speed ceiling** (decided 2026-11-19): what the crew adds to the shared probe counts in full up to 10 km/s, then flattens towards 21 km/s (`crewEffective` in `shared/mission.ts`). A busy crew still reaches Mars in about 179 days; no crew can make it faster than about 132 days. The ceiling looks at the last hour of taps and catch-ups plus connected auto-thrust. Your own km and credits always count in full; "+N km/s from crew" and "your taps got us there X sooner" show what actually moved the probe. *(Replaced by self-balancing thrust in the retune.)*
- **Welcome back (1d)** shows after 30 minutes or more away with some auto-thrust. It shows:
  - how long you were away, the km and credits earned, and counted / not counted;
  - the crew's km while you were away;
  - "arrival moved" (the crew's pushes beyond coasting, minus any outage);
  - the last ping while you were away.

  The server has already paid it, so "Collect & keep pushing" just closes it.
- **Prestige** unlocks at 2,000,000 km pushed since your last handover (the design's number, decision 10). It needs two taps ("Tap again: reset for 3 patches"), because it can't be undone.
- **Connections:** a tab hidden for 5 minutes closes its line, so it counts as away and the 8-hour cap applies. The browser sends a heartbeat every 30 s; Cloudflare answers it without waking the object. A socket silent for 90 s (a phone that lost signal) is treated as gone, and its device is paid only up to its last heartbeat. Leaving the page closes the line straight away.
- "+N thrusters idling" is real: devices away within the last 8 hours with auto-thrust, shown when 20 or fewer are here.
- `/admin` shows the crew push before the ceiling and how much of it counts, and can give this browser km (credits and prestige progress) for testing.

## Phase 7: Votes, mission log, milestones and fact pages

**Goal:** shared decisions, moments to celebrate, and the content pages that will carry the ads.

**What gets built**
- **The daily route vote**: 3 options, closing at 00:00 UTC (an alarm), one vote per device, with Turnstile. The result changes the pace or the date and goes in the log.
- **The mission log page (1h).**
- **Six milestones** with flags on the track. When one is reached, everyone connected gets the milestone moment (1e) with the burst sheet and confetti. Anyone offline sees it on their next visit.
- **One fact page per milestone**, plus How to play (1l). These are plain HTML pages built at deploy time, so Google can read them.
- **Postcards** use placeholder slots until the photos are chosen (todo, "At the end").

**Data changes**
- **D1:**
  - `vote_days` (day, options, tallies, winner, effect)
  - `votes` (day, voter_id, option), one vote per voter per day
  - `milestones` (mission_id, n, km, reached_at)
- **Content files in the repo:** the vote-option pool and the milestone facts, as JSON.
- **Durable Object:** today's tallies (live) and the next milestone.

**How you test it**
- Vote on your phone and watch the tally move on the laptop.
- In `/admin`, close the vote now. The result should appear in the log and the arrival date should shift by its effect.
- In `/admin`, set the distance just short of a milestone and tap past it. Both devices should celebrate.
- On a fact page, view the source. The text should be in the HTML, not added later by scripts.

**Main risks**
- **Content volume.** A long mission needs a lot of vote options, so options will repeat from a pool.
- **Every fact must be true and checked** (Product principle 5).

**As built: 7a (2026-11-19)**
- The pool is `content/vote-options.json` (approved by Nav 2026-11-19): 30 options, 10 each of faster (6 to 24 hours sooner), steady (no change) and detour (6 to 24 hours later, each with a true fact and its source). Rules in `shared/votes.ts`.
- Each round the `Probe` object picks one option of each kind, in a shuffled order, avoiding the last 3 rounds' picks. A round is a UTC day; one closed early from /admin gets ".2", ".3".
- Voting: `POST /api/vote` behind the invisible Turnstile check (action "vote"), one vote per device per round (D1 `votes`). The object keeps the live tallies in its own SQLite and sends them with every update (at most once a second).
- Closing: one alarm covers both the signal and 00:00 UTC; any message or /admin clock move also checks. The winner's hours are applied to the route at coasting speed, the result goes in the log (with the fact for a detour), and D1 `vote_days` keeps the record (migration 0004). A tie goes to steady, then detour; no votes means no change ("No votes today").
- The mission log page (1h) at `/log` reads `GET /api/log` (the current mission, newest first, 30 at a time) and puts today's open vote at the top. An open log page reloads by itself when a new entry is written. The design draws the marker icons at 12px; they're at 9px (1×) to keep whole-number pixels.
- `/admin` shows today's tallies, closes the vote now, and lets its own browser vote again.
- The open vote is shown as "DAY n" of the mission (mission days count from launch, not from midnight).

**As built: 7b (2026-11-19)**
- The six milestones are `content/milestones.json` (approved by Nav 2026-11-19), via `shared/milestones.ts`. Each fact was checked against the NASA/JPL pages listed with it:
  1. Past the Moon (384,400 km);
  2. Webb's neighbourhood (1.5M km);
  3. Mid-course burn (120M km, the design's);
  4. Halfway (240M km, the design's);
  5. Three quarters (360M km);
  6. Phobos in view (430M km).
- The design's halfway fact ("a radio ping from here takes about 7 minutes") isn't true at 240M km (it takes about 13 minutes), so it moved to milestone 3, where it is.
- The `Probe` object notices a milestone on any message, on /admin changes, and on an alarm set for when coasting reaches the next one (rounded to the minute), so it's caught with nobody around. It records it (its own SQLite, and D1 `milestones`, migration 0005), logs it (with the postcard and a link to the fact page), and sends it to everyone.
- **The milestone moment (1e)** shows on every open screen: the design's warmer sky, the postcard (a placeholder photo with a 32px Mars stamp), the fact from the flight deck, the share card, fireworks and pixel confetti (none with reduced motion). Each browser remembers the milestones it has seen. One that comes back after several milestones sees the newest. A first visit doesn't replay old ones.
- **Share result** opens the phone's share sheet, or copies the text on a computer. "Read more about this milestone" links to its fact page (an addition to the design).
- The track flags only milestones 3–6. Milestones 1 and 2 sit within 0.3% of Earth, where their flags would cover it. They're still celebrated and logged.
- **Content pages** are plain HTML written by `scripts/build-pages.mjs` (it runs before `npm run dev` and `npm run build`) into `public/` (git-ignored) from `content/milestones.json`:
  - `/how-to-play` (the design's 1l, plus the list of milestones);
  - `/milestones/<slug>` for each milestone (fact, postcard, two paragraphs, sources, previous and next);
  - their stylesheet `/content.css`, made from the game's own styles plus `src/content/pages.css`.

  The text is in the HTML source. They have ad-slot placeholders only. The theme follows the saved choice, else the system setting, live. In dev, a small Vite middleware serves them at the same clean addresses as production.

## Retune: a 30-day mission, the idle pause, a launch that keeps players (before phase 8)

**Deployed from c132a88 with migration 0006 and approved by Nav, 2026-11-19.**

**Goal:** Nav's decisions of 18–19 Nov (prompts 27 and 28): about 30 days to Mars with self-balancing thrust, an 8-hour idle pause, and a launch reset that keeps everyone's progress. Decisions 4, 5 and 6 below were changed; 8 (the setback) and the vote effects were retuned to fit a 30-day trip.

**As built (2026-11-19)**
- **Every balance number is in `shared/balance.ts`** (re-exported by `shared/mission.ts`). `npm run sim` (`scripts/sim.mjs`) runs missions minute by minute with the real upgrade rules and prints the days for 1 to 10,000 players.
- **Self-balancing thrust** replaces the phase 6 ceiling. The crew's raw push R (last hour's taps and catch-ups plus connected auto-thrust, km/s) moves the probe `crewSpeed(R) = 337 × R / (R + 90)` km/s on top of 21 km/s coasting. A tiny crew's km each move the probe about 3.7 km; a crowd's far less. It never reaches 337, so no crowd beats 15.5 days with no votes, or about 14 if "faster" wins every vote. Your own km, credits and prestige progress always count in full.
- **The sim** (no votes, no safe mode): 35 typical players (about 5 minutes a day) take about 30 days; 20 take 38; 50 take 26; 200 take 19; 10,000 take 15.5. One player alone takes 120 to 260 days. The same crew gets faster mission by mission as upgrades grow (35 typical players: 30, 25, 24, 23, 23 days), because progress is kept.
- **Today's pace:** the probe's average speed over its last 24 hours of moving (paused time left out), from track samples every 10 minutes of moving in the object's SQLite. The arrival date uses it, so a burst of taps no longer swings the date. Vote effects and setbacks are hours at this pace. For the first 10 minutes of a mission it's coasting plus the crew's live push.
- **"Your taps today got us there X sooner"** is what your taps actually moved the probe today (D1 `daily_km.tap_moved_km`, migration 0006) at today's pace. "+N km/s from crew" and the wide view's probe speed are the live push.
- **The idle pause (decision 5):** with no tap batch and no connected auto-thrust for 8 hours, an alarm pauses the probe where it is. The signal timer and any safe-mode setback wait with it, and no milestone can fire. A tap batch wakes it; so does connecting or buying with auto-thrust (connected auto-thrust is activity) or a ping (safe mode shows no THRUST button). The log gets "Probe idle" and "Probe woken by <name>". The home screen's arrival card says "Probe idle: tap to wake it" with the date "On hold"; safe mode and the milestone share text show "on hold" too. A clock jump in `/admin` pauses it part-way (8 hours after the last activity).
- **Safe-mode setback:** 2 hours per quiet hour, capped at 1 day per outage, added as hours at today's pace when someone pings. The safe-mode screen's line says "about 2 hours".
- **Vote effects:** the old 6–24 hours divided by 6 (1–4 hours), labels and results reworded to match (approved by Nav, prompt 28), applied as hours at today's pace.
- **"Past the Moon":** the fact page now says OSC-1 "coasts at 21 km a second even before anyone taps" instead of "never stops coasting" (approved, prompt 28).
- **Welcome back's "arrival moved"** compares the arrival date (today's pace) when you left with now.
- **`/admin`:** shows today's pace, the crew push and what it moves the probe, when the probe will pause (or that it's paused), and "Reset mission (keep players)" (decision 6): a new mission now on real time, 0 km, a full signal, no milestones, a fresh vote round (the open one ends with no effect) and an empty log; devices, pings, streaks, progress, credits, upgrades and patches are kept. Not to be run on live data without Nav's say-so.
- **Checked locally** with two scripted runs (taps, ping, reset, a 9-hour and a 50-hour clock jump, wake, vote, safe mode during a pause): all checks passed.

## Flight view (before 8b; added 2026-11-19)

**Goal:** the game home (1a phone, 1b desktop) uses the design's flight view instead of the straight Earth→Mars track (`JourneyTrack`), and THRUST gets "You've clicked" with real per-player click counts from the server.

**Decided 2026-11-19 (evening):** the flight view is chosen for the game home. The curved transfer-orbit view (design 2a/2b) was rejected and stays in the design unused. Click badges: Steady Finger (1,500 clicks), Iron Thumb (5,000) and Ten Thousand Club (10,000), awarded once 8b's badge system exists.

**What gets built**
- **The flight view** (design file, game home, commits abc10c7, 1357c54 and fcb448c):
  - a side-on 16-bit window where the probe flies right, Mars grows as the crew closes in and Earth shrinks behind;
  - stars and speed lines stream past;
  - THRUST makes the probe boost, with the "+km" pop;
  - crew sparks show other players' taps (driven by the live crew pace; no per-tap broadcast);
  - a beacon marks the next milestone;
  - a route strip shows the Ceres/Vesta split after Mars, with a tiny pixel probe;
  - the probe travels across the window as progress grows, with a glowing trail behind and a dashed path ahead to Mars;
  - it reacts to the final seconds, safe mode, a small crew, the idle pause and reduced motion;
  - the window stays deep space in light mode.
  - **Phone fix from the design (fcb448c):** the flight window needs `flex: none`, or it squashes to a line.
- **"You've clicked"** under THRUST: today's clicks as an odometer, the all-time total, and a bar to the next click badge.
- **Art drawn in code for now** (PixelLab later, see docs/todo.md): the horizontal exhaust flame, the comet, speed lines, Mars and Earth at growing sizes (whole-number sizes only), the Sun and a small Vesta.

**Data changes**
- **Per-player click counts** (the player key: the account when signed in, else the device): credited taps only, so capped taps don't count. Today's count and the all-time total, kept by the `Probe` object and copied to D1 with the other numbers (e.g. a `taps` column on `daily_km` in migration 0008; all-time is the sum).

**How you test it**
- Open `/` at 375px, 390px and 1440px next to the design file, in both themes. The flight window keeps its height on phones and stays deep space in light mode.
- Tap THRUST: the probe boosts, "+km" pops, and today's count goes up. Reload: the counts are kept. Signed in on two devices, the counts are shared.
- In `/admin`, set the distance near a milestone and near Mars: the beacon, Mars's size and the probe's position follow.
- Safe mode, the final 60 seconds, the idle pause and `?crew=handful` all show their states. Reduced motion stops the streaming.

**Main risks**
- **Performance on phones.** Many moving layers; keep them to CSS transforms and `steps()`, and cap the sparks and particles.
- **Whole-number scaling** of Mars and Earth as they grow: use a few fixed sizes rather than smooth scaling.

**As built (2026-11-19, prompt 32; deployed by Nav, checked 2026-11-20)**
- **`FlightView`** (`src/components/FlightView.tsx` and `.css`) replaces `JourneyTrack` on the game home, phone and wide. Its layout follows the design's `flightVals()`, measured from the window's real width.
  - It has every piece of 1a/1b:
    - the stars and speed lines streaming left;
    - the comet;
    - Ceres? and Vesta? ahead (plus Jupiter on wide screens);
    - Mars with its glow, and Phobos past 85%;
    - Earth behind;
    - the probe with its flame, trail and dashed path ahead;
    - the next-milestone beacon (the real milestones from `content/milestones.json`);
    - the header (progress, speed, and the ETA on wide screens);
    - "N crew pushing / Mars looks N× bigger";
    - the route strip with its ticks, tiny probe, Mars and the Ceres/Vesta fork.
  - The phone's "Travelled / Next" line sits under the window, as in the design. The window has `flex: none` and a fixed height (254px phone, 344px wide).
  - **THRUST** boosts it for 240 ms through a handle from `GamePage`: the probe shifts 8px, the flame doubles to 4×, the extra speed lines show, the chevrons light up, and "+N km" pops.
  - **Crew sparks** come from the live crew pace (`crewKmS`, out of the most the crew can add): none while nobody pushes, at least 2, up to 6 on phones and 9 wide; `?crew=handful` shows 2. No per-tap broadcast.
  - **States:**
    - The final 60 seconds: the blinking "SIGNAL 00:00:42 · PING NOW" chip.
    - The idle pause: engine off, the stars stop, 0.00 km/s, ETA "On hold", and a blue "PROBE IDLE · Tap THRUST to wake it" chip. This chip isn't in the design; it's built in the design's chip style.
    - Reduced motion: no streaming, flame, sparks, comet or pop.
    - Safe mode: engine off, the probe greyed out, the "SAFE MODE · ENGINE OFF" chip. In the game, safe mode still replaces the home with its own screen (1f), so this state shows only on `/kit`, which now has the flight view in all four states.
  - It stays deep space in light mode: it uses only the fixed `--space-*` colours at the end of `src/styles/theme.css`. Two of them are new and wait for Nav's OK (listed at the end of `docs/tokens.css`): `--space-dusk` #140b14 (the window's gradient near Mars) and `--glow-mars` (rgba 255,140,80 at 30%, the glow behind Mars).
- **Art drawn in code** (`src/game/flightArt.ts`, ported from the design's drawing code, made once on a canvas and cached): Mars and Earth, the flame (3 frames of 12×6), the comet (18×5), the speed lines, Ceres, Vesta (16×14), Jupiter, Phobos, the tiny probe and the strip's swatches.
  - Mars and Earth step through fixed radii (Mars 9 sizes, Earth 6, each drawn 1:1); everything else shows at 1×, 2× or 4×.
  - The Sun isn't in the flight view, so it wasn't drawn.
  - PixelLab sprites replace these in that one file.
- **"You've clicked"** (`ClickCounter`) under the THRUST rates: today's clicks as a six-digit odometer, all time, and the bar to the next click badge (`shared/clicks.ts`).
  - As in the design, the bar counts **today's** clicks. Whether the badges count a day's clicks or all-time clicks is for 8b to settle.
  - Past 10,000 it shows "Ten Thousand Club reached".
- **Click counts on the server:** the `Probe` counts the taps it credits (after the tap cap; none in safe mode) per player (the account when signed in, else the device), in today's entry it already keeps.
  - They're copied to D1 with the km (`daily_km.taps`, migration 0008).
  - Today is that day's rows and all time is the sum of all rows.
  - Signing in already moves a device's `daily_km` rows onto the account, so the counts add up with no new merge code.
  - Taps not yet confirmed show straight away and are corrected by the server's reply.
- **Migration 0008:** `daily_km.taps`, and an index on `daily_km (device_id, day)` for a guest's all-time sum.
- `JourneyTrack.tsx` and its CSS are kept but no longer used (removed once the flight view is approved).
- **Decided after the checks (prompt 33, 2026-11-20):**
  1. Safe mode (1f) uses the flight view (in its safe state) instead of its own muted track.
  2. The two new colours are approved.
  3. The idle-pause chip goes into the design file.
  4. The click badges count **all-time** clicks for now, so the bar in "You've clicked" moves to the all-time total.
- **Follow-up as built (2026-11-20, prompts 34–35; deployed by Claude at Nav's request, prompt 36):**
  - The safe-mode screen shows the flight view in its safe state, with the "Coasting · thrusters asleep" line under it. This replaces its muted track. The rest of 1f is unchanged.
  - "You've clicked" keeps today's odometer, but its bar and "to go" now count all-time clicks.
  - The account page (`/sign-in`, signed in) has a full-width "Back to the mission" button under your name. The footer keeps only the Privacy link.
  - The design file now has an "idle pause" signal state for 1a/1b (the blue PROBE IDLE chip, engine off, stars stopped), and 1f shows the flight view in its safe state, its frame now scrolling.
  - No migration.
- **Checked locally:**
  - Screenshots at 375, 390 and 1440 in both themes, next to the design file's 1a/1b. Also: the boost, the start and near Mars (phone and wide), a small crew, reduced motion, the final seconds, the idle pause, and the `/kit` states.
  - A scripted check passed in full:
    - Capped and safe-mode taps don't count.
    - The counts survive a reconnect.
    - Two devices on one email add up and share the count.
    - D1's `daily_km.taps` matches after the flush.
  - The 8a auth checks pass again.
  - `npm run build` passes.

## Phase 8: Accounts, leaderboards, profile and arrival

**Goal:** optional sign-in so progress follows you across devices, plus the leaderboards and the end of the mission.

**Split in three (agreed 2026-11-19).** The retune came first and was approved; 8a was built on 2026-11-19.
- **8a: Accounts and sign-in (1i).** Email link and Google sign-in, linking the device and merging its progress, sign-out, generated names, country, delete account and the privacy page. Migration 0007 (0006 went to the retune). Email sign-in goes live once onesmallclick.io is set up in Email Service; Google works as soon as its redirect address is accepted.
- **8b: Leaderboards (1g), profile (1j) and badges.** Needs the profile badge sprites (todo); placeholders until they're made. Also awards the click badges (Steady Finger 1,500, Iron Thumb 5,000, Ten Thousand Club 10,000) from the flight view phase's click counts.
- **8c: Arrival and credits (1k).** The credits, the next-destination vote and the new mission. **Changed by E0 (2026-11-20, prompt 43):**
  - The next-destination vote is a **two-way branch read from content/campaign.json**: at Mars, Ceres or Vesta (later Europa or Ganymede, and so on). It replaces the old three-way "Europa, Psyche or a Venus flyby".
  - The Venus flyby can return as a detour option in the daily vote pool (content/vote-options.json), with a checked fact.
  - The vote shows each branch's probe, distance and planet tech (1k), and the winner starts mission 2 with that branch's probe. Its art and names come in E2; until then OSC-1 flies on with a placeholder card.
  - The credits roll for everyone who helped, with names for signed-in players.
  - The arrival rewards (medal, planet tech, stamp, cosmetic) and the landing burn are E4b, and part 2 must be live before this first arrival.
- **8d: Crew emails (added 2026-11-20).** Two opt-in emails per leg to signed-in players: halfway and arrival. See "8d: Crew emails" below.

**8a as built (2026-11-19, prompt 30; deployed from 02849c8 with migration 0007 and approved by Nav, 2026-11-19)**
- **Answers (prompt 30):** signed in, pings and votes are once per account per day; signing out leaves the browser as a brand-new guest device (progress stays with the account); one of the three name offers is the device's own name; delete account is included; the privacy page lists privacy@onesmallclick.io; the screens the design lacks are built from the kit in 1i's style.
- **`/sign-in`** is the design's 1i for guests ("Join the crew", email, "Email me a sign-in link", "or", "Continue with Google", "Keep playing as guest · Crew #N" with the device's real crew number). Signed in, it becomes the name picker (straight after the first sign-in) and then the account view: name, email, country with one change, sign out, and delete account (tap twice). "Check your email" and the link's page (`/sign-in/confirm`, one "Sign in" button) are kit-built too. The header's "Sign in" shows your name once you're signed in.
- **Email link:** Turnstile first (action `signin`), then a random single-use token valid for 15 minutes, stored only as a hash; at most 3 links per address per 15 minutes and 5 per device per hour. The token rides in the link's #fragment, so it never reaches a server log. The link's page posts it when you press the button, so a mail scanner opening the link signs nobody in. Sending is `worker/email.ts` only (Cloudflare Email Service, `env.EMAIL.send`). It needs a `send_email` binding named EMAIL and an `EMAIL_FROM` address on an onboarded domain; until then the live site says email sign-in opens soon. Locally (`DEV_SIGN_IN_LINKS="1"` in `.dev.vars`) the link comes back on screen instead of being sent.
- **Google:** the server-side code flow with PKCE and a state cookie (`osc_oauth`, 10 minutes), scope `openid email`, `prompt=select_account`; no Google script on our pages. The ID token comes straight from Google's token endpoint, so its claims are checked (issuer, audience, expiry, verified email) without a signature check. The same address by email and by Google is one account.
- **Sessions:** a random token in an HttpOnly cookie (`osc_session`, 90 days, renewed when under 60 days are left), stored as a hash. The device cookie is unchanged.
- **The merge (decision 18)** happens in the `Probe` object: both are paid up to now, then the account keeps the higher level of each upgrade and the higher patch count, and credits and km since the last handover are added together. The device's km per day, pings and votes are attached to the account (`account_id`), and its open tabs reconnect as the account (close code 4001). The probe now keeps progress, today's numbers, the tap allowance, pings and votes under a player key (`a:<account id>` signed in, else the device id); people here and auto-thrust count an account once however many devices it has.
- **Names (decision 17):** generated only (`shared/names.ts`), unique across accounts; a taken name gets a number (`orbit_otter_42`). Only names of that shape are accepted, so nobody can type one.
- **Country (decision 16):** from Cloudflare's location when the account is made; one change, from a list of countries the browser can name.
- **Delete account:** the account, its sessions and sign-in links and its progress go; the devices, km, pings and votes stay as anonymous history; the browser becomes a brand-new guest.
- **`/privacy`:** a plain HTML page (`scripts/build-pages.mjs`) covering the device cookie, the game data, the browser storage, sign-in data, what other players see, Cloudflare (hosting, Turnstile with a link to its Turnstile Privacy Addendum, which invisible mode requires, and Email Service), Google, and how to delete or ask (privacy@onesmallclick.io). Linked from the sign-in screens; phase 9 links the legal pages from everywhere.
- **Migration 0007:** `accounts`, `sessions`, `login_tokens`, `account_id` on `devices` and `daily_km`, indexes for pings and votes by account.
- **Checked locally** with a scripted run of two devices on one email (merge, once-per-account ping and vote, names, country, sign out, delete, Google off locally, a forged callback refused): all 37 checks passed, plus the retune checks again. Screenshots of every screen at phone and desktop width. The real Google round trip can only be tried in Nav's browser.

**E4b part 1 as built (2026-11-20, prompts 49–50; deployed 2026-11-20, prompt 51, version c6e1027f; no migration; approved by Nav, prompt 52)**
- **Answers (prompt 50):** the share image is laid out at 360px and drawn at exactly 3× (1080 × 1080), and the Mars facts page is built now, ahead of E4.
- **The medal pace line** sits under "Your taps today" (1a/1b), from the arrival estimate the home already shows:
  - "Gold if we arrive by 15 Dec · on pace for Silver", a bar and "2.4 days to Gold". On Gold pace it reads "top tier · hold it"; on Bronze pace it aims for Silver ("Silver if we arrive by…", the days to Silver).
  - The rule is in `shared/medals.ts` (`medalFor`, `medalPace`), counted from the leg's launch with the medal days in content/campaign.json (Gold by day 25, Silver by day 30). Part 2 should award the medal at arrival with the same `medalFor`.
  - Hidden while the probe is idle (no estimate) and in orbit.
  - The medals are 10×15, drawn in code from the design's `medal()` (`src/game/rewardArt.ts`), shown at 2×. The `--medal-*` colours are now in `src/styles/theme.css`.
- **The Destination file card** (below the vote on phones, under the vote in the right-hand column on desktop):
  - "DESTINATION FILE · MARS", today's fact, "Fact N of 30", and "Next fact at 00:00 UTC" with a countdown.
  - Fact 1 on the leg's launch day (UTC), then the next one each midnight UTC, round again after 30 (`src/game/facts.ts`). Everyone sees the same fact.
  - Shown only on legs whose stop has facts in content/facts/ (Mars for now).
  - "Share fact" opens the design's share card preview (a modal dialog): "Save image" downloads a 1080 × 1080 PNG (`src/game/shareCard.ts`), "Copy link" copies `/destinations/mars#fact-N`, and "Close". What happened shows in the dialog.
  - The card stays deep space in both themes, with the fixed `--space-*` colours (two more palette colours added there: `--space-deep`, `--space-rule`). The share icon is the design's own (`buildIcons()`).
- **`/destinations/mars`:** a plain HTML page (`scripts/build-pages.mjs`) with all 30 facts, each with its NASA source and the quote that supports it, and an anchor per fact (`#fact-12`; the linked fact gets an orange border). One page per file in content/facts/.
- **Checked locally:**
  - Screenshots at 375, 390 and 1440 in both themes: the pace line on Gold and on Bronze pace (and hidden when idle), the card, the share dialog, the saved PNG (also with the longest fact), and the Mars page.
  - `npm run build` passes, and the badge, arrival and click checks pass again.

**8c as built (2026-11-20, prompts 45–46; deployed with migration 0010 on 2026-11-20, prompt 47; waiting for Nav's checks)**
- **Answers (prompt 46):**
  - The orbit pause is approved.
  - The branch vote closes at the next midnight UTC, or the one after if that's under 12 hours away; ties are settled by a logged random draw.
  - The credits show every signed-in name (reduce to the top 1,000 if the crowd gets big).
  - The per-leg balance is built now, not in E2.
  - The arrival rewards wait for E4b.
  - The medal pace line and the Destination file card are a small phase straight after 8c.
- **The tour** comes from `content/campaign.json` through `shared/campaign.ts`.
  - The `Probe` knows each leg's stop, start, length and crew balance.
  - A row in D1 `missions` is one leg.
  - The launch reset starts the tour again from Earth → Mars.
- **Arrival:** when the probe reaches the leg's end (from taps, coasting or `/admin`):
  - it goes into orbit: the probe, the signal timer and any setback wait, like the idle pause;
  - taps still earn credits but don't move or wake it;
  - the crew is snapshotted into `mission_crew`: everyone with at least one credited tap on the leg's days, with km and taps;
  - the log says "Arrived at Mars · Day N. N crew pushed us here with N taps".
- **The branch vote:**
  - At a stop with two ways on, the daily vote gives way to "Where next? The route splits". It's the same vote system, with option ids `branch:<stop>`.
  - The winner launches the next leg: a fresh mission row, the leg's length from the campaign, the log's "The crew chose Ceres" and "On to Ceres · OSC-2 Ceres Hopper sets off on a 186 million km leg".
  - At a stop with no vote (Ceres, Vesta), the next leg launches straight away.
- **The per-leg balance:**
  - Coasting and the crew's top speed scale with the leg's length (leg km ÷ 480M), so any leg takes about as long. For example, the Ceres leg coasts at 8.155 km/s.
  - The crew balance is recalibrated at each launch: the last 3 full days' push against the Mars leg's average. It's steadier than the whole-leg average the E0 sim tried: the second leg comes out at 27.3 days, not 24.6.
  - Km per tap and credits don't change.
- **The arrival screen (1k)** shows once per browser, within 3 days of an arrival (an arrival with no vote, like Ceres, still gets its screen).
  - The destination, with OSC-1 in orbit.
  - "MARS ORBIT REACHED · We made it", the date and time, and "N days · N crew · N taps".
  - The rolling credits: every signed-in name with its flag, guests as "…and N guest crew". It rolls in pixel steps; with reduced motion it's a list you scroll.
  - The branch vote, or "On to Jupiter" once the probe has moved on.
  - `GET /api/credits?mission=<id>` serves it.
- **The branch vote card (1k):** each branch shows its distance from here, its new probe (name and pitch; the art comes in E2), its planet tech with Gold/Silver/Bronze, a live percentage and a vote button. On the game home it replaces the daily vote card while in orbit.
- **The game home on any leg:**
  - The flight view draws the leg's destination and start in the design's code-drawn style (`destinationArt` in `src/game/flightArt.ts`).
  - The fork or the next stop come from the campaign, with "CREW VOTE AT MARS" or "ON TO VESTA".
  - In orbit: "IN MARS ORBIT · The crew is voting on where next", and the arrival card reads "Mars orbit reached · We arrived on…" with "Watch the credits again".
  - Only the Earth → Mars leg has milestones until E3.
- **The mission log** covers the whole tour since the launch reset, with each entry's day counted from its own leg. New entries: ARRIVAL, ROUTE VOTE and NEW LEG.
- **Migration 0010:** the new `missions` columns (stop, from_stop, leg_km, crew_half, crew_count, taps, branch) and `mission_crew`.
- **Checked locally:**
  - A scripted run passed all 18 checks:
    - arrival and orbit;
    - the vote closing at midnight UTC;
    - the credits naming the signed-in player and counting the guests;
    - taps in orbit earning credits without moving the probe;
    - 2 votes to 1 choosing Ceres;
    - the Ceres leg's length and coasting;
    - the log;
    - Ceres going on to Jupiter by itself;
    - the reset going back to Mars.
  - The badge, click and sign-in checks pass again, and `npm run build` passes.
  - Screenshots: the arrival screen at 390 in both themes and at 1440, the home in orbit, and the Vesta leg.

**8b as built (2026-11-20, prompts 37–38; deployed with migration 0009 on 2026-11-20, prompt 39; waiting for Nav's checks)**
- **Answers (prompt 38):**
  - Signal Keeper I–IV at 3 / 7 / 21 / 30-day ping streaks.
  - Night Shift is THRUST taps credited between 02:00 and 04:59 local time.
  - Halfway Crew goes to anyone who pushed at any point in the mission before the probe passed halfway.
  - The Countries board counts everyone for now (signed-in only later).
  - The passport and cosmetics wait for 8c.
- **Leaderboards (1g), `/ranks`** (`src/pages/RanksPage.tsx`):
  - Players and Countries tabs, by km pushed today (UTC, the probe's day).
  - Players lists signed-in accounts only, the top 50. Countries counts everyone: an account by its country, a guest by its device's country.
  - Your row is pinned above the tab bar (sticky at the bottom on wide screens) and links to your profile. A guest's Players row says "Sign in to appear on the board".
  - `GET /api/leaderboard` (`worker/boards.ts`) works out each board's top at most once a minute per Worker instance. Your own row is looked up on each request. The page asks again every minute.
  - The design has no desktop version, so wide screens get a centred column.
- **Profile (1j), `/profile`** (`src/pages/ProfilePage.tsx`):
  - Your name, "Crew since day N · country", and three stats: total pushed, today, and pings in the last 30 days.
  - Badges as a 3×3 grid: Signal Keeper is one tile showing your highest level, then First Ping, Night Shift, Voter ×30, Halfway Crew, Mission Patch and the three click badges. Earned tiles are lit, the rest dimmed, as in the design.
  - The 30-day ping grid, today outlined, with your streak and Keeper level.
  - "Share my mission card" shares the milestone moment's text card, and a link goes to your account.
  - `GET /api/profile` gives the name, country, first-played date, all-time km and the last 30 days' pings.
  - Signed in, your name in the header links here; on phones the footer has "Profile" and "Account".
- **Badges** (`shared/badges.ts`; awarded by the `Probe`):
  - Kept per player (the account when signed in, else the device) in D1's `badges` table (migration 0009), and loaded with the day's numbers.
  - Checked when you connect (so earlier pings, votes, clicks and handovers count), after a ping, a vote, credited taps, a handover, and when the probe passes halfway.
  - A new badge shows a toast ("Badge earned: First Ping") on every tab of that player.
  - **Signal Keeper** uses your longest streak ever, from your ping history.
  - **Night Shift** uses the time zone Cloudflare gives for the connection (never the browser's), and it isn't stored.
  - **Halfway Crew:** when the probe passes 240M km, everyone with km between the mission's first day and that day gets it (to the day).
  - Signing in moves a device's badges onto the account (the account keeps the earlier date when both have one). Deleting the account deletes its badges.
  - The badges show the design's 9×9 icons at 3× until the PixelLab sprites exist.
- **The signal card** shows your real Signal Keeper level from today's streak (for example "Signal Keeper I · 4 days", "21-day ping streak · 9 days to IV"), instead of the design's placeholder "III".
- **Text:**
  - The delete-account text now lists badges.
  - The privacy page (updated 20 November) mentions click counts, badges, the Night Shift time zone check, and that the Players board shows signed-in names only.
- **After Nav's checks (prompts 40–41, 2026-11-20):**
  - **Pixel flags** on both boards, in place of the two-letter code box: next to each player's name and each country. There are 256 flags at 16×12, shown at 2× (`src/components/Flag.tsx`).
    - Made by `scripts/make-flags.mjs` from flag-icons (MIT, credited in `design/sprites/flags/`).
    - 54 busy flags were tidied by hand (`scripts/flags/overrides.json`).
    - Flags keep their real colours (an agreed palette exception).
  - **A profile icon in the phone header** (prompt 42), beside "here now" (or SAFE MODE): a 32px box with a 44px tap area. On wide screens your name button already opens the profile.
  - **The signal card's wording** before Signal Keeper I: "Ping streak · 2-day ping streak · 1 day to Signal Keeper I" (it used to say "Signal Keeper I · 1 day to I").
- **Checked locally:**
  - A scripted run passed all 18 checks: each badge rule, Halfway Crew not going to someone who pushed only after halfway, the merge of two devices' badges, the leaderboards as guest and signed in, the profile, and delete account removing badges.
  - The 8a sign-in checks and the click-count checks pass again, and `npm run build` passes.
  - Screenshots: `/ranks` (players, countries, guest) and `/profile` at 390 in both themes and at 1440, plus the signal card.

**What gets built**
- **Sign in (1i)** by email link or Google.
  - Signing in attaches the device's progress to the account.
  - The email link opens a page with a button; mail scanners that open the link don't sign anyone in.
- **Leaderboards (1g)** for players and countries:
  - ranked by km pushed today (UTC);
  - accounts only;
  - your own row pinned.
- **Profile (1j)**: badges, including the new profile badge sprites; distance; and the 30-day ping grid.
- **Display names and country** for each account.
- **Arrival & credits (1k)**: rolling credits, then the next-destination vote. A new mission starts when that vote closes.
- **A basic privacy policy**, because this phase starts storing email addresses.

**Data changes**
- **D1:**
  - `accounts` (id, email, google_sub, name, country, created_at)
  - `sessions` (id_hash, account_id, expires_at)
  - `login_tokens` (token_hash, email, expires_at, used_at)
  - `badges` (player_id, badge, earned_at)
  - a new `account_id` column on `devices`
- **Mission credits** come from `daily_km` per account.
- **Leaderboards** are worked out once a minute and cached, not recalculated for every view.

**Outside setup (you):**
- a Google OAuth client in the Google Cloud console;
- the email sender (see "Email for sign-in");
- secrets via `wrangler secret put`.

**How you test it**
- Sign in by email on your phone and by Google on the laptop with the same address. You should end up with one account and merged progress.
- Check you appear on the leaderboard.
- Sign out. Anonymous play should still work.
- In `/admin`, set the distance to just short of 480M km. You should get the arrival screen, the credits and the next-destination vote.

**Main risks**
- **Merging progress when one person has two devices** (decision 18).
- **The email needs a domain you own.** Sign-in emails can't come from workers.dev, so onesmallclick.io has to be on Cloudflare before this phase, not at launch.
- **Display names on public boards** (decision 17).

## 8d: Crew emails (added 2026-11-20)

**Goal:** bring signed-in players back at the two moments that matter most on each leg. At halfway, an email asks them to help make the push. At arrival, a round-up shows their contribution, shouts out the top contributors and invites everyone to vote on the next destination, including "if you missed out, don't worry, help us on the next journey!". After 8c, before launch. **Moved to the payday plan (2026-11-20):** it can't fully work until onesmallclick.io is bought and added to Cloudflare, Email Service is turned on for it, and Workers Paid is switched on. Email sign-in needs the same three, so both go live together after payday (docs/todo.md, "Payday").

**Idea from Nav (2026-11-20, while approving 8c).** Only accounts get emails, which also gives players a reason to sign in.

**What gets built**
- **Consent (opt-in, never pre-ticked).** These are game updates, not sign-in emails, so they're treated as marketing:
  - an unticked "Email me mission updates (about two a month)" box when an account is made (the name picker);
  - a toggle on the account page and the profile;
  - existing accounts are asked once in the game (a small card), never opted in automatically;
  - stored with when and where consent was given.
- **One-click unsubscribe in every email.** A signed link that works without signing in, plus the `List-Unsubscribe` and `List-Unsubscribe-Post` headers, with a small confirmation page.
- **The halfway email** goes out when the leg's Halfway milestone is reached. It shows:
  - your km, clicks, pings and votes this leg, and where that puts you in the crew (e.g. "top 12%");
  - the crew's numbers and the medal race ("On pace for Silver: 2 days faster and we get Gold");
  - one button: "Make the push".
- **The arrival email** goes out when the probe arrives. It shows:
  - your total contribution for the leg, the medal and the planet tech earned (once E4b exists);
  - the top 10 contributors by their public generated names (already public on the leaderboards);
  - for anyone who didn't help: "If you missed out, don't worry, help us on the next journey!";
  - the main button: "Vote now: Ceres or Vesta?", while the destination vote is open.
- **Sending:**
  - all of it through `worker/email.ts`;
  - from a separate address from the sign-in emails (e.g. `crew@onesmallclick.io`), so spam reports on updates can't hurt sign-in links;
  - in batches over a few minutes, not all at once;
  - each send recorded, so nobody gets the same email twice;
  - deleted and opted-out accounts skipped.
- **The emails themselves:** plain text plus simple HTML in the game's voice, with a pixel header image hosted on the site. No tracking pixels and no tracked links.
- **`/admin`:** preview each email for any account, send a test to yourself, and see the last send's numbers.
- **The privacy page** gets a section on crew emails and how to stop them.

**Data changes** (the next free migration number)
- `accounts`: `email_updates` (on/off), `email_updates_at` and `email_updates_source`.
- `email_sends` (account_id, mission_id, kind, sent_at), one row per account per mission per kind.

**How you test it**
- Opt in on a test account. In `/admin`, move the distance past halfway: one halfway email arrives with the right numbers, and moving past it again sends nothing new.
- Move to arrival: the arrival email arrives, with the top contributors and the vote button. A test account that didn't help gets the "next journey" line.
- Click unsubscribe in the email: it works without signing in, and the next send skips you.
- A guest and an opted-out account get nothing.

**Main risks**
- **Consent rules (UK PECR and GDPR).** Opt-in plus easy unsubscribe is the safe pattern. Claude isn't a lawyer, so check the wording before launch.
- **Deliverability.** Keep it to two emails per leg, use a separate sender, keep the content plain, and send in batches. Email Service is still in public beta, so check its sending limits.
- **Cost.** Workers Paid includes 3,000 emails a month, then about $0.35 per 1,000.

## Phase 9: Launch hardening, ads and legal pages

**Phase 9a status (2026-11-20, prompts 53–54; IN PROGRESS, not deployed; migration 0011 not applied live)**

Answers (prompt 54): split phase 9 into 9a (now) and 9b (after payday); the cap is 50 pings and 50 votes per network per day; the site is run by websitesbynavee.co.uk, contact naveessharma@gmail.com for now; anyone can play as a guest, under-13s ask a parent before signing in; Lighthouse runs with npx (not added to the project).

Done and committed (checked locally where it says so):
- **The per-network daily cap** (`shared/caps.ts`, `worker/caps.ts`, migration 0011 `network_caps`). Ping and vote check it before the bot check and count only the ones that go through; over the cap they're refused with "busy-network" and a toast ("Lots of pings came from your network today…"). The network is an IPv4 address or an IPv6 /64, kept only as an HMAC with the day (keyed from DEVICE_SECRET); rows before yesterday are deleted as new counts land. `/admin` has a "Network cap · today" card (`GET /api/admin/networks`: hash prefixes and counts only). **Checked:** a scripted run of 51 devices on one network passed all 9 checks (50 pings and 50 votes go through, the 51st of each is refused, only a 32-hex hash is stored, the /admin report, old days cleared); the IPv6 prefix was checked by hand.
- **Terms and Contact pages** (`/terms`, `/contact`, plain HTML from `scripts/build-pages.mjs`), and the privacy page now names websitesbynavee.co.uk as the data controller, gives naveessharma@gmail.com instead of privacy@onesmallclick.io (not set up yet), explains the network cap, and has the under-13 line. **Checked:** all three build and load (200); not yet looked at in screenshots.
- **Privacy · Terms · Contact linked from every page:** the content pages' footer, the game's phone footer (its own row) and a new small desktop footer, the sign-in screens and the "Lost signal" page. Not yet checked in screenshots.
- **The crash screen** (`src/components/CrashScreen.tsx`): an error boundary around the app ("Something went wrong · Reload"), plus `POST /api/report`, which writes app crashes and up to 3 uncaught errors per page load to the Workers Logs (nothing stored). `/?crash` shows it in local dev only. Not yet checked in a browser.
- **The load test script** (`scripts/load-test.mjs`): local by default, refuses the live site without `--live`. First result in docs/load-test.md.
- **docs/launch-checklist.md:** the phone checklist for Nav, and what 9b must do before the launch reset.
- `npm run build` passes.

Done in prompt 55 (2026-11-20):
- **The load test, finished** (docs/load-test.md). The collapse between 100 and 500 players was real work in the probe: every tap batch rebuilt "who's online" about seven times from every socket's attachment (N×N work a second). **Fixed:** the list is kept for 5 s and cleared whenever a socket opens, closes or changes, and a socket's "last seen" is rewritten every 15 s, not on every batch. After the fix: 2,000 players at 33 ms (p95 134 ms) with nobody dropped; it fell over locally at 3,000. 2,000 players is about Cloudflare's soft limit for one object (1,000 requests a second), so **no relay objects for now**; the next step past ~1,500 players tapping at once would be sending tap batches less often in a big crowd. The script now counts each stage on its own, times out stuck connections and stops after a stage that fell over.
- **Rows written are counted** and shown in /admin ("Rows written an hour (probe / D1)").
- **Monitoring** written down in docs/launch-checklist.md ("Monitoring").
- **The scripted checks moved into scripts/** (`check-auth.mjs`, `check-clicks.mjs`, `check-badges.mjs`, `check-arrival.mjs`; each takes the base URL, default localhost:5173). Re-run after the probe change: sign-in 37/37 and arrival 18/18 pass; clicks passed its 8 probe checks and then stopped at the step that reads local D1 through wrangler, which (like `check-badges.mjs` and `cap-test.mjs`) couldn't start on this laptop ("spawn UNKNOWN": six old dev servers from this morning were still running and Claude wasn't allowed to stop them).

**Storage costs (prompt 55 proposal, OK'd by Nav in prompt 56, built).** Each player with the game open wrote about 2,200 rows an hour to the probe's SQLite and 1,000 to D1 (about $75 a day for 1,000 players around the clock on Workers Paid, and only ~45 player-hours a day on the free plan). Now: players' progress is saved every 60 s (the shared distance stays at 5 s), rows are updated in place instead of replaced, D1 gets km, taps and progress every 5 minutes, "last seen" is written at most hourly (also on page loads), and the /admin clock offset only when it changes. The km waiting for D1 are kept in a new table in the probe's SQLite (`d1_queue`, written with the 60 s save), so a restart loses at most a minute of them, not 5 minutes; a flush only takes off what D1 confirmed, and one flush runs at a time. **Measured after:** about 227 rows a player-hour in the probe and 77 in D1, about 10× fewer (a little short of the 15× estimate). Checked: sign-in 37/37 and arrival 18/18 still pass; a scripted restart test showed the queued taps survive a restart and the queue is empty after the flush. Locally, the dev server's code reload leaves the old copy of the probe running, and it flushed its own copy too, so that test double-counted. On Cloudflare only one copy runs, which it enforces when a copy touches its storage, so every flush now reads the probe's storage before sending. The trade-offs Nav accepted: after a restart players can lose up to a minute of credits, and the leaderboards' "today" lags up to 5 minutes.

Done in prompt 57 (2026-11-21): **the automated checks** (docs/launch-checklist.md, "Automated").
- **Scripted checks, all pass** (after the storage change): `cap-test.mjs` (now takes a base URL), `check-clicks.mjs`, `check-badges.mjs` (earlier this session: `check-auth.mjs` 37/37, `check-arrival.mjs` 18/18).
- **Screenshots** (headless Edge, 39 of them): /terms, /contact, /privacy, /sign-in, the game home with its footers, and the crash screen at 375, 390 and 1440 in both themes, plus the busy-network toast (the ping answered "busy-network", the real refusal's reply) on a phone in both themes and on desktop. No sideways scroll and no page errors anywhere. **Fixed:** on a phone, sign-in's "Privacy · Terms" wrapped one link per line and had no Contact link; they're now on a line of their own with Contact.
- **Lighthouse 12** (`npx`, Edge, the built site served with brotli like Cloudflare) on the game home, How to play, a milestone page, the Mars facts page, Privacy, Terms and Contact, phone and desktop:
  - Accessibility **100 on every page in both themes** after two fixes on the milestone pages: the postcard stamp's number was 4.14:1 on the paper (now `--text-stamp` is #8a4620, already in the palette, 5.70:1; its border keeps #a8582a; the in-game postcard gets it too), and the source links were 16px tall (now 24px targets).
  - Best practices 100 (the game home's only miss is console errors from having no API behind the static server).
  - SEO 100 once **`public/robots.txt`** exists: until now `/robots.txt` served the game page live, which crawlers read as a broken robots file. A Sitemap line waits for the domain (9b).
  - Performance: content pages 95–100 on a phone and 100 on desktop; the game home 89 on a phone (LCP 3.8 s on Lighthouse's slow-4G) and 100 on desktop. Content pages' phone LCP (~2.9 s) is the fonts: they're set to stay invisible until loaded (on purpose, so the pixel text never changes font), and Lighthouse's slow-4G shows that wait. Left as is.
  - **For Nav:** Lighthouse flags the game home on a phone for small text: about 40% of its text is the design's 11px labels (flight view, vote footer, "You've clicked", streak, header line, fact card), and it wants 60% at 12px or more. It's at 59.7%, so it fails the audit only just. Left as designed unless Nav wants the labels at 12px.
- **Keyboard only:** every control on the game home is reachable by Tab at 390 and 1440 (21 and 17 stops) with a visible focus ring (THRUST's is the 8-sided blue plate); the Upgrades sheet and the Share fact dialog are modal `<dialog>`s, so Tab stays out of the page behind, Esc closes them and focus goes back to the button that opened them.
- **Reduced motion:** with it on, nothing animates on the game home, How to play or sign-in (3–14 animations run without it).

**Deployed (prompt 58, 2026-11-21, by Claude at Nav's request):** live D1 backed up to `Documents\onesmallclick-backups\d1-onesmallclick-2026-11-21-pre-9a.sql` (not in git: it holds emails), migration 0011 applied remotely, `npm run deploy` (version 17358aa0). Checked live: every page and `/api/health` answer 200, `/robots.txt` is the new text file, the served bundle is the new build, the milestone pages have the stamp and source-link fixes, and D1 has `network_caps` with 0011 recorded. The probe closed the vote by its own alarm at 00:00 UTC after the deploy. Nobody had tapped since, so the 5-minute D1 flush hasn't been seen live yet: added to Nav's phone checks (docs/launch-checklist.md, step 15).

**Lighthouse on the live site** (prompt 59; content pages only, because every visit to the game home makes a live guest player): How to play, the Halfway milestone page, the Mars facts page, Privacy, Terms and Contact, phone and desktop. **Accessibility, best practices and SEO 100 on all 12 runs; performance 97–100** (phone LCP 1.1–1.5 s, desktop 0.3–0.7 s). Faster than the local runs, which waited longer for the fonts.

**Checked (prompt 60, 2026-11-22):** Nav did all 15 phone checks: fine. Nav OK'd 12px labels: every 11px label in the app is now 12px (36 rules; built and pushed, goes live with the next deploy).


**Goal:** ready for real players.

**What gets built**
- **A generous per-network daily cap.** Network addresses are stored only as hashes.
- **A load test with simulated players.** Relay objects get added only if the numbers say so.
- **AdSense in the ad slots** once the account is approved, with Google's consent message for UK and EEA visitors.
- **Pages:** privacy, terms and contact, plus error pages.
- **Domain:** onesmallclick.io connected.
- **Monitoring:** Workers logs and analytics.
- **Fresh start:** "Reset mission (keep players)" from `/admin` (decision 6): the mission, its milestones, the vote round and the mission log start again, and the real start date is set. Devices, pings, streaks and progress are kept.
- **The launch checklist:** Lighthouse, an accessibility pass, both themes, reduced motion and real phones.

**Data changes**
- `network_caps` (day, net_hash, count).
- No wipe: the launch reset clears only the mission's own rows (decision 6).

**How you test it**
- Read the load-test report.
- Check the ads sit in their slots, at least 150px from THRUST.
- Visit from a UK connection. The consent message should appear.
- Check the legal pages are linked from every page.
- Run through the checklist on your own phone.

**Main risks**
- **AdSense approval** can be slow and can reject new, thin sites. Apply only once the content pages are live.
- **A traffic spike on the free plan.** Move to Workers Paid before launch (decision 20).

---

## S: Sharing and invites (K-factor) (added 2026-11-20)

**Goal:** make the game spread. Every big moment is easy to share to WhatsApp, X, Facebook and the rest. Every share carries a personal crew link, and new players who come through it land straight in the game. Build it after 9a and before E1, so it's ready for launch.

**Why (Nav's idea, 2026-11-20).** A friend suggested the K-factor: K = i × c, where *i* is invites (shares) per player and *c* is the share of invitees who become players. K above 1 means each player brings in more than one new player, which is exponential growth ([Wikipedia](https://en.wikipedia.org/wiki/K-factor_(marketing))). It only counts direct invites. Shared content also brings in visitors who then share themselves (the "social K-factor"). So the phase works on three levers:
- **Raise *i*** (more shares): one-tap share at the moments people feel something, and shares that make the sharer look good.
- **Raise *c*** (more invitees become players): a rich preview in the chat, a landing that drops them straight into play with "orbit_otter invited you", and no sign-up wall.
- **Shorten the cycle** (how fast a share turns into a new sharer): urgent moments, such as the signal's final hour, the landing burn and the vote closing, which get answered in minutes, not days.

**What gets built**
- **One share kit**, used everywhere:
  - on phones, the native share sheet (`navigator.share`), which covers WhatsApp, Messenger, Instagram and the rest;
  - plus explicit buttons: WhatsApp (`wa.me`), X (the tweet intent link), Facebook (the sharer link), Reddit, Telegram, and Copy link, plus "Save image" where there's a card;
  - plain links only: no share SDKs, no third-party scripts and no tracking. That keeps pages fast and private, and keeps AdSense happy.
- **Personal crew links:** `/c/<code>` for each player (a short random code, not the email). Every share adds the moment and the channel (e.g. `?m=milestone&v=wa`), so we know what's working.
- **Rich link previews:**
  - Open Graph and Twitter card tags on every shareable page;
  - for crew links, the Worker rewrites the page's title and description on the fly (HTMLRewriter, built into Workers, so no new library), e.g. "orbit_otter pushed 41,200 km toward Mars. Help the crew";
  - preview images (1200×630, pixel art) made ahead of time for each moment, milestone and destination, with a default for everything else. Personal numbers go in the text, not the image, so nothing has to be drawn on demand.
- **Share moments** (each with a short prefilled message and the crew link):
  - the milestone moment (upgrading 7b's "Share result");
  - arrival and its medal;
  - the branch vote ("Vote with me: Ceres or Vesta?");
  - the signal's final hour and safe mode ("The probe's about to go quiet. Ping it!"), which are urgent;
  - the landing burn ("2M km in the next hour, we need you"), urgent;
  - a badge earned;
  - your leaderboard rank, and the **country rivalry** ("🇬🇧 UK is #4 on the countries board. Help us pass 🇫🇷 France");
  - the daily fact (E4b part 1 already has the card);
  - the fact and destination pages.
- **A Wordle-style result line**, easy to paste anywhere: e.g. "OneSmallClick · Day 12 🚀 ▓▓▓▓▓░░░░░ 48% to Mars · I pushed 41,200 km 🇬🇧 · onesmallclick.io/c/k7p2".
- **The invite landing:** a crew link opens the game with a small "orbit_otter invited you to the crew" banner and THRUST ready. No sign-in is needed to play.
- **Recruits** (conversions, not shares, so nobody is rewarded for spamming):
  - a recruit counts when a **new** device arrives through your link and actually plays (e.g. 50 credited taps or a Ping);
  - once per device, never your own devices or account, and capped per day;
  - the recruiter badges: Crew Recruiter I / II / III (1, 5 and 25 recruits);
  - "Your recruits have pushed X km" on the profile.
- **The K-factor panel in /admin**, for the last 7 days:
  - active players, shares (by moment and channel), crew-link visits, new players from links and recruits;
  - *i* = shares per active player, *c* = recruits per share, **K = i × c**;
  - the median time from a share to the recruit's first tap (the cycle time).
- **E4's remaining sharing work** moves here: the map share card and the branch-result and arrival texts.

**Data changes** (the next free migration number)
- `share_links` (code, player key, created_at).
- `share_counts` (day, moment, channel, shares, visits), as counters only, with no personal data.
- `recruits` (recruiter key, recruit device, arrived_at, converted_at).

**How you test it**
- On a phone, share a milestone to WhatsApp: the preview shows the pixel image and your line. Open it on another phone: the invite banner shows, and after 50 taps the recruit counts once.
- Each button opens the right app or site with the message filled in. Copy link works on a laptop.
- Your own second device doesn't count as a recruit.
- /admin shows the shares, visits, recruits and K for the test.
- Paste a crew link into a link-preview checker (e.g. the Facebook and X debuggers once the domain is live).

**Main risks**
- **Spam.** Reward recruits who play, never shares. Cap recruits per day, and never let players message other people's contacts.
- **Previews need the real domain.** Links shared before launch point at workers.dev. Build the links from the site's own address, so they switch to onesmallclick.io when it's connected.
- **Privacy.** The crew code isn't the email or name. The privacy page gets a line on crew links and recruit counts.
- **No rewards linked to ads**, ever (AdSense).

## The Grand Tour: expansion phases (E1–E5, planned in E0 on 2026-11-20)

The plan is docs/expansion.md (prompt 43); the content drafts are content/campaign.json and content/facts/mars.json. Nav approved the E0 decisions on 2026-11-20 (prompt 44): docs/expansion.md, section 11. The Mars leg is the first players see, and its arrival is about 25–30 days after launch. So E4b's first half ships before launch, and E1, E2, E3 (Ceres and Vesta) and E4b's second half within the first 3 weeks after it (docs/expansion.md, section 12).

### E1: The campaign map (1m)

**Goal:** the star chart of the whole tour, on phone and desktop, as the design's 1m.

**What gets built**
- `/map` (the "Map" tab in the bottom bar and the wide header): every stop from content/campaign.json, laid out as the design does. Phone: a vertical chart with a pixel scroll indicator. Desktop: full width, with a pixel scrollbar and drag to pan.
- Each stop's state:
  - visited (medal and date, and your stamp if you helped);
  - current (the probe's live position on the leg);
  - next vote (both branches teased);
  - future (dimmed);
  - not taken.
- Tapping a stop opens its card: name, distance, probe, planet tech (with Gold/Silver/Bronze), today's fact or the stop's fact, and a link to its destination page.
- The design file's two wrong distances and its loose facts are corrected to the sourced versions.

**Data changes:** none (the map reads content/campaign.json and the missions table from 8c).

**How you test it:** open `/map` at 375, 390 and 1440 in both themes, next to the design. In `/admin`, finish a leg and vote: the map moves the probe on, marks the branch not taken, and shows the medal.

**Main risks:** a long scrolling chart on small phones (keep it to CSS and pixel art, lazy-load the far stops' art). Whole-number scaling of every body (the todo's "Whole-number scaling" item).

### E2: Per-mission probes and upgrade names, and per-leg balance

**Goal:** each mission flies its own probe with renamed upgrades; each leg takes about 30 days whatever its length.

**What gets built**
- The probe for the current mission everywhere OSC-1 shows now (flight view, safe mode, the share card), from content/campaign.json.
- The new probe reveal (1n), once per mission: "OSC-3 Europa Lander… Your upgrades have new names".
- Upgrade names and flavour lines per probe. Effects and prices are unchanged (shared/upgrades.ts).
- **The leg's length** scales coasting and the crew's top speed, so any leg takes the same time for the same crowd; credits per tap don't change (docs/expansion.md, section 2). Moon legs show speed in km/h.
- **Per-leg recalibration** (if approved): each leg's `CREW_HALF_KM_S` scales with how hard the crew pushed on the previous leg, so a steady crew stays near 30 days as upgrades carry over (docs/expansion.md, section 3). `npm run sim` gains a whole-tour table.

**Data changes:** the Probe's mission row gets the stop, leg length and calibration. D1 `missions` gets the stop and branch.

**How you test it:** `npm run sim` shows each leg near 30 days for a steady crew. In `/admin`, jump to a moon leg: the flight view shows km/h and the right probe; the reveal shows once.

**Main risks:** a balance change to a live game. Ship it at a leg boundary, and keep the sim as the check.

### E3: A content pipeline for each new leg

**Goal:** adding a leg is filling in content files, checked by a script, not writing code.

**What gets built**
- One folder of content per stop: milestones (4–6, with fact pages), the daily vote pool, 30 facts, postcards with licences, and the branch teaser. Same format as content/milestones.json, content/vote-options.json and content/facts/mars.json.
- `npm run check-leg <stop>`: refuses a leg with a missing sprite, thruster sheet, stamp icon, upgrade name, fact source, postcard licence or next branch.
- The "Before each new leg" checklist in docs/todo.md, run monthly about a week before arrival.
- Ceres and Vesta first.

**Data changes:** none (content files only).

**How you test it:** the checker passes for Ceres and Vesta and fails on purpose for a stop with a fact missing its source.

**Main risks:** the monthly fact-checking load (30 facts and 4–6 milestones per branch, both branches). Start each pair a month ahead.

### E4: Sharing, fun facts and destination pages

**Goal:** the daily fact on the game home, shareable, collected on a page per destination; and the map and results as share cards.

**What gets built**
- The Destination file card (1a/1b): today's fact for the current destination, "Fact N of 30", changing at 00:00 UTC, with "Share fact" (the design's 1080×1080 card: "Save image", "Copy link").
- `/destinations/<slug>`: plain HTML built at deploy time like the milestone pages, with all 30 facts and their sources.
- ~~The map share card ("The crew chose Europa") and the branch-result and arrival share texts (docs/expansion.md, section 8).~~ **Moved to phase S (Sharing and invites, 2026-11-20).**

**Data changes:** none (content/facts/*.json).

**How you test it:** the card's fact changes with the mission day (move the clock in `/admin`). The share card saves a 1080×1080 PNG. /destinations/mars lists 30 facts with sources and passes the content-page checks.

**Main risks:** none big. Every fact needs its source before it ships (Product principle 5).

### E4b: Collective rewards: medals, planet tech, stamps, cosmetics and the landing burn

**Goal:** arriving somewhere feels like an event the whole crew earned (1k, 1o, 1j).

**What gets built**
- **Part 1, before launch:** the medal pace line on the game home (1a: "Gold if we arrive by… · on pace for Silver"), and E4's Destination file card for Mars. Both are cheap, and the Mars leg is the first one players see.
- **Part 2, before the first arrival (within 3 weeks of launch):**
  - **Medals:** Gold by day 25, Silver by 30, Bronze after, from the leg's start to arrival.
  - **Planet tech:** the credits-only perks (docs/expansion.md, section 9), applied by the Probe to credits, prices and the offline cap.
  - **Passport stamps** in the medal's colour for everyone who helped (one credited tap on the leg), on the profile.
  - **Cosmetics:** one unlock per stop (skies, THRUST trails, probe paint), picked on the profile ("Tap to switch").
  - **The landing burn (1o):** the last hour before arrival, the crew's pushed km (taps count double) fill a 2,000,000 km bar; the landing time is fixed at the start of the hour. Success gives a gold-framed postcard; a miss still lands ("Rough landing, but we made it").
  - **The arrival screen's rewards (1k),** including the "you weren't on this leg" version.

**Data changes:** D1 `missions` gets medal, days and the landing burn; new tables `stamps` and `cosmetics_owned`, plus the cosmetics in use. Merged on sign-in, deleted with the account (docs/expansion.md, section 9).

**How you test it:**
- In `/admin`, finish a leg at day 24, 28 and 33: Gold, Silver and Bronze, each with its perk strength.
- A device that tapped once gets the stamp and unlock; one that didn't sees the "push on the next leg" card.
- Run the landing burn with two tabs tapping: the bar fills, and the probe lands on time either way.

**Main risks:** the burn's timing (the arrival estimate moves while people tap: hence the fixed landing time). Perks must never change trip speed: they act on credits, prices and the offline cap only.

### E5: Later ideas from the brief

**Goal:** the extras that keep a long tour lively. Each one gets its own small plan and approval first.

**What gets built (candidates)**
- **Monthly country trophies:** a monthly country leaderboard with a trophy on the profile, and the main draw of the interstellar leg.
- **Streamer mode:** a Twitch chat plays as one crew (chat commands push THRUST), with an overlay view.
- **Chiptune sound:** short 16-bit sounds for THRUST, Ping, milestones and the landing burn, off by default, with a mute button.
- **Achievements beyond badges:** distance records on the interstellar leg, tour-wide stamps.
- **A rewarded ad for a short thrust boost,** only if approved for H5 Games Ads, never for pings, and never tied to medals, stamps or planet tech (AdSense rules).

**Data changes:** per idea.

**How you test it:** per idea.

**Main risks:** ads tied to rewards would break AdSense rules: keep them separate. Twitch's terms for streamer mode.

## Decisions you need to make, by phase

My recommendation is in brackets. Items marked *(brief)* come from the open questions in docs/brief.md.

### Before phase 2 (all decided 2026-11-18)
1. ~~**Palette**~~ **Decided: yes.** The design's colours in docs/tokens.css are the locked palette.
2. ~~**Fonts**~~ **Decided: self-host** Pixelify Sans and VT323 (no Google Fonts request).
3. ~~**Content pages**~~ **Decided: plain HTML pages** for How to play, the fact pages and the legal pages. The game is the React app.

### Before phase 4 (all decided 2026-11-18)
4. ~~**First mission length**~~ **Decided (changed by Nav, 18–19 Nov; replaces "about 6 months, never under 4½ months"): about 30 days to Mars at launch traffic, with self-balancing thrust.** A small crew's push is boosted and a big crowd's is squeezed: more players always means sooner, but each extra player helps a bit less, and no crowd gets there in under about 14 days. Your own km, credits and prestige progress always count in full. The formula and its numbers are in `shared/balance.ts` (approved by Nav, prompt 28: fastest trip 15.5 days with no votes, so about 14 even if "faster" wins every vote); `npm run sim` prints the days for different crowds.
5. ~~**Does the probe always coast?**~~ **Decided (changed by Nav, 18–19 Nov): it coasts on its own, but pauses after 8 hours with no player activity** (any tap batch, or auto-thrust from a connected player). The next tap wakes it. While paused the screen says "Probe idle: tap to wake it" and the arrival date shows as on hold. So coasting alone never finishes a mission.
6. ~~**Wipe all workers.dev test data at launch?**~~ **Decided (changed by Nav, 18–19 Nov): reset only the mission** (distance, route, milestones reached, the current vote round and the mission log) and set the real start date. **Keep devices, pings, streaks, progress, credits, upgrades and patches.** `/admin` gets a "Reset mission (keep players)" action so this can be tested before launch.

Also decided with phase 4 (2026-11-18): **people here counts devices**, so five tabs on one phone count once. **THRUST below the fold on 375×667 is fine.** **No half-scaled sprites:** the track's Mars is a 64px sheet made from the 128px one, and the Moon shows at its full 32px.

### Before phase 5 (all decided 2026-11-18)
7. ~~**Signal window at launch**~~ **Decided: 48 hours**, with the red tier at the final 60 seconds.
8. ~~**Safe-mode setback**~~ **Decided: the design's rate** (every quiet hour adds about 10 hours), **capped at 7 days per outage.** *(Retuned for a 30-day trip, prompt 28: every quiet hour adds about 2 hours, capped at 1 day per outage, at today's pace. The setback waits while the probe is paused.)*

Also decided with phase 5 (2026-11-18): **the setback lengthens the route** (the probe drifted off course: the distance is kept and the real arrival really is later); **taps don't count in safe mode** (the design's "0 km/s from crew"); **PING's fixed `--ping-*` colours** are agreed, like THRUST's. Turnstile widget made by Nav (site key `0x4AAAAAAGHp999jPtmZ4xYE`, invisible).

### Before phase 6 (all decided 2026-11-19)
9. ~~**Do idle players move the shared probe?**~~ **Decided: yes to both**: auto-thrust while connected, plus the offline catch-up (up to 8 hours) added when they come back.
10. ~~**Prestige**~~ **Decided: the design's number.** Any time once you've pushed 2,000,000 km since your last handover.

Also decided with phase 6 (2026-11-19): **a crew-speed ceiling** (full up to 10 km/s, flattening towards 21 km/s, so Mars takes at least about 4½ months; replaced by the self-balancing thrust of decision 4 in the retune); **a tab hidden for 5 minutes counts as away**; **welcome back shows after 30 minutes away** with some auto-thrust, and collecting is automatic.

### Before phase 7 (11 and 12 decided 2026-11-19)
11. ~~**Vote**~~ **Decided:** 3 options closing at 00:00 UTC, from a pool of about 30 drafted for approval (`content/vote-options.json`), each between a day sooner and a day later.
12. ~~**Milestones**~~ **Decided:** I draft all six, with distances and checked facts, for approval in 7b. Fact pages are built from the kit in the style of How to play (1l), at `/milestones/<name>`.
13. **Postcards** *(brief)*: real photos or pixel art? This can wait. Placeholders stay until then (todo, "At the end").

### Before phase 8 (14, 16, 17 and 18 decided 2026-11-19)
14. ~~**Email service**~~ **Decided: Cloudflare Email Service**, with the sending code in one file so switching to Resend is a one-file change. Nav switches on Workers Paid when the domain is connected. See the next section.
15. **Domain** *(brief)*: **Nav is buying onesmallclick.io on payday**, together with Email Service and Workers Paid (the payday plan in docs/todo.md) and adding it to Cloudflare. Until then email sign-in stays off on the live site (Google can work on workers.dev if Google accepted that redirect address). It's needed for the sign-in email's sender address (and probably for Google's sign-in address, since Google may reject workers.dev), so sign-in goes live for real players once it's connected.
16. ~~**Country for leaderboards**~~ **Decided: detected** from Cloudflare's location header when the account is made, **and changeable once.** Free changes would make country boards easy to game.
17. ~~**Rude names**~~ **Decided: generated names only at launch**, like `orbit_otter`, **picked from three offers.** Custom names with a blocklist and a report button can come later.
18. ~~**Two devices, one account**~~ **Decided:** when progress merges, **keep the higher level of each upgrade and the higher patch count, and add credits and km together.**

Also decided 2026-11-19 (evening): **the flight view** replaces the straight track on the game home (the transfer-orbit view, design 2a/2b, was rejected); **click badges** Steady Finger 1,500, Iron Thumb 5,000 and Ten Thousand Club 10,000; **the medal colours** are approved; **the Grand Tour rules** are agreed (docs/todo.md). **The domain:** onesmallclick.io, bought on payday Friday (.com is taken and .co.uk reads as UK-only).

### Before 8d (added 2026-11-20; recommendations in brackets)
22. **Crew emails go ahead** *(decided 2026-11-20, Nav's idea)*: halfway and arrival, accounts only, opt-in.
23. **The sender address** *(`crew@onesmallclick.io`, separate from the sign-in sender)*.
24. **How many top contributors to name** *(top 10 by km this leg, using their generated names)*.
25. **Existing accounts** *(asked once in the game; nobody is opted in automatically)*.

### Before phase S (added 2026-11-20; recommendations in brackets)
26. **What counts as a recruit** *(a new device that arrives through your link and makes 50 credited taps or a Ping; never your own devices; at most 10 a day per recruiter)*.
27. **Recruiter badges** *(Crew Recruiter I / II / III at 1, 5 and 25 recruits)*.
28. **Share buttons** *(the phone's own share sheet first, then WhatsApp, X, Facebook, Reddit, Telegram and Copy link; no share SDKs)*.

### Before phase 9
19. **Workers Paid ($5/month) from launch?** *(Yes. Email Service needs it anyway, and the free plan's daily limits are too tight for a busy launch.)*
20. **AdSense:** is the account set up for this site? Ads stay off until it's approved.
21. **The per-network daily cap number.** *(Set it from the load test. Generous enough that a household or office isn't blocked.)*

## Email for sign-in

**Decided (2026-11-19, decision 14): Cloudflare Email Service**, with Resend as the fallback.

- **Why Cloudflare:**
  - It's built into Workers: the Worker sends mail through a binding, so there's no extra account and no API key to store.
  - It's the cheapest at scale.
  - It sits next to everything else in the dashboard.
- **The catch:**
  - It needs Workers Paid ($5/month). We'd want Paid for launch anyway (decision 19).
  - It has been in public beta since April 2026, so its API could still change.
- **The safeguard:** the sending code lives in one small function, so switching to Resend is a one-file change.
- **Google sign-in sends no email at all**, which keeps volumes low.
- **Crew emails (8d, added 2026-11-20)** use the same service and file, from a separate sender address, at about two per signed-in, opted-in player per leg. They're the main email volume once there are players.

| Service | Free tier | Paid | Notes |
|---|---|---|---|
| **Cloudflare Email Service** | None for sending to players (only to your own verified addresses) | 3,000 emails/month included with Workers Paid ($5/month), then $0.35 per 1,000 | Native Workers binding. Public beta. |
| **Resend** | 3,000/month, but at most **100 a day** | Pro $20/month for 50,000 | Simple API that works well from Workers. The 100-a-day cap could block sign-ins on launch day. |
| **Postmark** | 100/month (developer plan, no overage) | About $15/month for 10,000 | Excellent delivery, but the free tier is too small for anything beyond testing. |

Prices were checked on 2026-11-18 from Cloudflare's docs and from pricing summaries. Check the live pricing pages before signing up. Sources:
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Resend free tier (Automation Atlas)](https://automationatlas.io/answers/resend-free-tier-explained-2026/)
- [Resend pricing (Nuntly)](https://nuntly.com/resend-pricing)
- [Postmark pricing](https://postmarkapp.com/pricing.txt)

## Running costs at a glance

- **Phases 2 to 8 fit the free Workers plan.**
  - Static files are free.
  - Durable Objects allow 100,000 requests a day on the free plan, and each incoming WebSocket message counts as 1/20 of a request ([Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)).
  - The D1 free tier is plenty for testing.
- **Turnstile and Google sign-in are free.**
- **Workers Paid ($5/month)** is needed for Cloudflare Email Service and for launch traffic.
- **Crew emails (8d):** the 3,000 emails a month included with Workers Paid cover about 1,500 opted-in players at two emails a leg. After that it's about $0.35 per 1,000.
- **The domain:** the yearly cost of onesmallclick.io.

## Cloudflare resources the plan will need (none created yet)

| Phase | Resource | Who creates it |
|---|---|---|
| 4 | D1 database; the `Probe` Durable Object (declared in `wrangler.jsonc`, made on deploy); admin secret | Me (with your OK), and you for the secret |
| 5 | Turnstile widget (site key and secret) | You, in the dashboard (I'll list the steps) |
| 8 | Google OAuth client; email sender on onesmallclick.io; secrets | You |
| 8d | The crew email sender (e.g. crew@onesmallclick.io) in Email Service | You, in the dashboard (Claude lists the steps) |
| 9 | Custom domain on the Worker; AdSense | You |
