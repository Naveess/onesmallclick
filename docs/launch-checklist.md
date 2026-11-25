# Launch checklist

Phase 9a (prompts 53–54). Run it before the launch reset, and again after anything big changes. Claude's automated
checks are at the bottom; the rest needs a real phone and a real person.

## On your own phone (Nav)

Use mobile data for one run and Wi-Fi for another.

1. **First visit.** Open the site in a private tab. The game loads, the probe is moving, and nothing jumps around as it loads.
2. **Tap THRUST** for 20 seconds. The km and "You've clicked" go up; the flight view boosts.
3. **Ping.** It works once; a second ping says you've already pinged.
4. **Vote.** It works once; the bar moves.
5. **Upgrades.** Open the sheet, buy one, close it with the grab bar and with a swipe-back.
6. **Share fact.** Save image gives a square picture; Copy link opens the fact.
7. **Sign in with Google.** Your name shows; the Profile icon opens your profile.
8. **Every tab:** Mission, Upgrades, Log, Ranks. Then How to play, Privacy, Terms and Contact from the footer.
9. **Light mode and dark mode** (the footer's toggle). Everything is readable in both.
10. **Turn the phone sideways** and back. Nothing breaks.
11. **Lock the phone for a minute**, then come back. The game reconnects by itself.
12. **Turn on reduced motion** (iPhone: Settings → Accessibility → Motion → Reduce Motion; Android: Remove animations). Nothing flashes or scrolls on its own.
13. **Larger text** (the phone's text size one or two steps up). Nothing overlaps.
14. **A broken address**, like /nothing-here. It says "Lost signal" with a way back.
15. **The leaderboard catches up** (phase 9a's storage change). After tapping in step 2, wait 5 minutes, then open Ranks: your km today are there. Before that they can be missing: D1 now gets them every 5 minutes.

## Before launch (after payday: phase 9b)

- onesmallclick.io connected, Turnstile and Google sign-in updated for it, email sign-in working.
- Workers Paid on.
- AdSense in the slots with its consent message, and the privacy page updated for ads.
- The live load test (docs/load-test.md), if Nav OKs it.

## Launch day (15 Dec 2026; phase B2, prompts 83–85)

The step-by-step list is in docs/todo.md ("Launch day"): back up D1, then /admin → "Launch wipe (phase B2)" (type WIPE EVERYTHING). It replaces the old "Reset mission (keep players)": the game starts fresh, and only accounts, devices, crew links and Early Beta badges stay. Then check mission day 1, the "Launch day" log entry, an empty leaderboard, and your profile with only Early Beta. Redeploy once after `endsAt` so How to play loses its early-access box.

## Automated (Claude, phase 9a)

Done 2026-11-21 (prompt 57); the results are in docs/plan.md ("Phase 9a status"). Scripts used are in the session scratchpad, not the project, except the scripted checks in `scripts/`.

- Lighthouse (`npx lighthouse`, not part of the project) on the game home, How to play, a milestone page, the Mars facts page and Privacy: phone and desktop.
- An accessibility pass: keyboard only (every control reachable, a visible focus ring, dialogs trap focus and Esc closes them), text contrast in both themes, labels on icon buttons, reduced motion.
- Screenshots at 375, 390 and 1440 in both themes.
- The scripted checks (`scripts/check-*.mjs`, local, against `npm run dev`): sign-in, clicks, badges, arrival, the network cap, recruits, rewards (medals, planet tech, stamps), Early Beta, the landing burn and the launch wipe. All passed on 2026-11-25.

## Monitoring (where to look once it's live)

- **Logs:** Cloudflare dashboard → Workers & Pages → `onesmallclick` → **Logs** (Workers Logs are on: `observability` in wrangler.jsonc; kept 3 days on the free plan, 7 on Workers Paid). Or `npx wrangler tail onesmallclick` for a live stream.
- **What to search for:**
  - `app-crash`: the app's crash screen came up, or an uncaught error in a browser (`POST /api/report`, at most 3 a page load; message, page and browser only).
  - `network-cap`: a network hit the 50 pings or 50 votes a day cap (hash prefix only). Lots of these from one hash prefix = a bot or a school; a spread of them = the cap is too low.
  - `D1 flush failed`: the probe couldn't write km and progress to D1 (it retries). Repeated = D1 trouble, or the free plan's daily row-write limit.
  - `failed` in general: every other storage error the probe logs (votes, pings, badges, milestones, credits).
  - Durable Object `overloaded` errors: the probe is getting more than it can handle (see docs/load-test.md).
- **Storage use:** `/admin` → "Rows written an hour (probe / D1)", since the probe last started. Rows written are what's billed (docs/load-test.md, "Storage"). The dashboard's D1 → `onesmallclick` → Metrics shows the same for D1 over time, and Workers & Pages → Durable Objects for the probe.
- **People:** `/admin` shows the open sockets, "people here" and the network cap's busiest networks today.
