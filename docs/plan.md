# Plan

The live phase list. Every phase ends deployed on workers.dev (https://onesmallclick.naveessharma.workers.dev). After each one: a changelog line, a commit and push, a deploy, then a stop for your OK (see CLAUDE.md). Nav runs `npx wrangler deploy` (Claude's deploy command is blocked in auto mode).

Written 2026-11-18 from docs/brief.md, docs/design-brief.md, the design file and design/sprites/README.md. Nothing in it is built yet.

- [x] **Phase 1: Scaffold.** Site-starter template filled in, brief saved, placeholder page live on workers.dev, code on GitHub.
- [ ] **Phase 2: App shell and pixel kit**
- [ ] **Phase 3: Game home with fake data**
- [ ] **Phase 4: The shared probe**
- [ ] **Phase 5: Signal, Ping and safe mode**
- [ ] **Phase 6: Idle upgrades and offline thrust**
- [ ] **Phase 7: Votes, mission log, milestones and fact pages**
- [ ] **Phase 8: Accounts, leaderboards, profile and arrival**
- [ ] **Phase 9: Launch hardening, ads and legal pages**

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
- **Testing uses the live workers.dev URL.** All test data is wiped before launch (phase 9).
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
- **Prestige rules** aren't decided yet (decision 10).

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

## Phase 8: Accounts, leaderboards, profile and arrival

**Goal:** optional sign-in so progress follows you across devices, plus the leaderboards and the end of the mission.

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

## Phase 9: Launch hardening, ads and legal pages

**Goal:** ready for real players.

**What gets built**
- **A generous per-network daily cap.** Network addresses are stored only as hashes.
- **A load test with simulated players.** Relay objects get added only if the numbers say so.
- **AdSense in the ad slots** once the account is approved, with Google's consent message for UK and EEA visitors.
- **Pages:** privacy, terms and contact, plus error pages.
- **Domain:** onesmallclick.io connected.
- **Monitoring:** Workers logs and analytics.
- **Fresh start:** the test data is wiped and the real mission start date is set.
- **The launch checklist:** Lighthouse, an accessibility pass, both themes, reduced motion and real phones.

**Data changes**
- `network_caps` (day, net_hash, count).
- The wipe of all test rows.

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

## Decisions you need to make, by phase

My recommendation is in brackets. Items marked *(brief)* come from the open questions in docs/brief.md.

### Before phase 2
1. **Palette** *(brief)*: lock the design's colours in docs/tokens.css as the palette? *(Yes. They already include the light blue and light orange, and the sprites use them.)*
2. **Fonts:** self-host Pixelify Sans and VT323, or load them from Google Fonts as CLAUDE.md says? *(Self-host: faster, and no third-party request to explain in the privacy policy.)*
3. **Content pages:** build How to play, the fact pages and the legal pages as plain HTML pages, with the game as the React app? *(Yes. Search engines and AdSense need to read them.)*

### Before phase 4
4. **First mission length at launch traffic** *(brief)*. In the design's numbers the probe coasts at 21 km/s, and a busy crew adds about 8 km/s more. At that pace the 480M km trip takes about 6 months. Pick a target: 3, 6 or 12 months? *(About 6 months, as the design has it.)*
5. **Does the probe always coast, so it arrives eventually even with no players?** *(Yes. That fits "setbacks, never wipes".)*
6. **Wipe all workers.dev test data at launch?** *(Yes.)*

### Before phase 5
7. **Signal window at launch** *(brief)*. The design uses 24 hours. Should it be longer (say 48 hours) while the crew is small? Does the red tier stay at the final 60 seconds? *(48 hours at launch, red stays at 60 s.)*
8. **Safe-mode setback** *(brief)*. The design says every quiet hour adds about 10 hours; the brief asks how many days the date jumps back. Use the design's rate, with a cap per outage? *(Yes, capped at 7 days per outage.)*

### Before phase 6
9. **Do idle players move the shared probe?** That means auto-thrust while connected, plus the offline catch-up (up to 8 hours) added when they come back. *(Yes to both. That's what the design shows.)*
10. **Prestige** *(brief)*. The design resets upgrades and credits for 3 Mission Patches. When can you prestige: at any time after a credits threshold, or only at arrival? *(Any time after a lifetime-credits threshold. The exact number is set in phase 6 with the balance numbers.)*

### Before phase 7
11. **Vote** *(brief)*. The design already says 3 options closing at 00:00 UTC. Confirm? I'd draft a pool of about 30 options with their effects for your approval.
12. **Milestones.** The design names only two: 3 (mid-course burn, 120M km) and 4 (halfway, 240M km). I'd draft all six, with distances and checked facts, for your approval.
13. **Postcards** *(brief)*: real photos or pixel art? This can wait. Placeholders stay until then (todo, "At the end").

### Before phase 8
14. **Email service** *(brief)*: see the next section.
15. **Domain** *(brief)*: buy onesmallclick.io and add it to Cloudflare. It's needed for the sign-in email's sender address, so it has to happen before this phase.
16. **Country for leaderboards** *(brief)*: detected or chosen? *(Detected from Cloudflare's location header when the account is made, and changeable once. Free changes would make country boards easy to game.)*
17. **Rude names** *(brief)*: *(Generated names only at launch, like `orbit_otter`, picked from a few offers. Custom names with a blocklist and a report button can come later.)*
18. **Two devices, one account:** when progress merges, keep the higher upgrade levels and add the credits together? *(Yes.)*

### Before phase 9
19. **Workers Paid ($5/month) from launch?** *(Yes. Email Service needs it anyway, and the free plan's daily limits are too tight for a busy launch.)*
20. **AdSense:** is the account set up for this site? Ads stay off until it's approved.
21. **The per-network daily cap number.** *(Set it from the load test. Generous enough that a household or office isn't blocked.)*

## Email for sign-in

**Recommendation: Cloudflare Email Service**, with Resend as the fallback.

- **Why Cloudflare:**
  - It's built into Workers: the Worker sends mail through a binding, so there's no extra account and no API key to store.
  - It's the cheapest at scale.
  - It sits next to everything else in the dashboard.
- **The catch:**
  - It needs Workers Paid ($5/month). We'd want Paid for launch anyway (decision 19).
  - It has been in public beta since April 2026, so its API could still change.
- **The safeguard:** the sending code lives in one small function, so switching to Resend is a one-file change.
- **Google sign-in sends no email at all**, which keeps volumes low.

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
- **The domain:** the yearly cost of onesmallclick.io.

## Cloudflare resources the plan will need (none created yet)

| Phase | Resource | Who creates it |
|---|---|---|
| 4 | D1 database; the `Probe` Durable Object (declared in `wrangler.jsonc`, made on deploy); admin secret | Me (with your OK), and you for the secret |
| 5 | Turnstile widget (site key and secret) | You, in the dashboard (I'll list the steps) |
| 8 | Google OAuth client; email sender on onesmallclick.io; secrets | You |
| 9 | Custom domain on the Worker; AdSense | You |
