# OneSmallClick — Brief

## Name & domain
- OneSmallClick
- onesmallclick.io (also buy onesmallclick.com if it's cheap)

## One-line pitch
The whole world flies one real probe to Mars, one small click at a time, and when it arrives depends on everyone.

## Audience
- Casual browser gamers who like idle and clicker games
- Space fans
- Streamers and their chat, playing together as a crew

## Core features (MVP)
- One shared global counter: every click is thrust for the same probe
- A real Earth to Mars route with true distances and milestones, each with a short fact card
- A live arrival date as the headline ("At this pace we arrive 14 March 2027"), which moves with how much everyone plays
- One crew vote a day (e.g. slingshot past Venus, photograph an asteroid, save power) that changes the route or the date
- Mission log recording every vote result and milestone
- Postcards: milestones unlock real space photos (licence checked for each)
- "Keep the signal alive" timer: any player's daily ping resets it
  - One ping a day per device, or per account when signed in
  - If it hits zero, the probe drops into safe mode and the arrival date jumps back (a setback, never a wipe)
  - Each ping earns a badge coloured by how low the timer was: blue with more than 6 hours left, orange under 6 hours, red in the final 60 seconds
  - Launch with a longer window than 60 seconds until traffic grows
- Full idle upgrades for your own thrust: auto-thrusters, offline progress and prestige
- Offline thrust capped at about 8 hours and checked by the server, never trusted from the browser
- Optional sign-in with email link or Google
  - Accounts keep progress and badges across devices
  - Only accounts appear on leaderboards and in the credits
- Individual and country leaderboards, ranked by distance pushed today
- Mission credits listing everyone who helped, shown on arrival
- "People here now" counter
- After Mars, players vote on the next destination
- Anti-cheat: an invisible bot check on pings and votes, a generous per-network daily cap, and clicks sent in batches every few seconds

## Later ideas
- Streamer mode where Twitch chat plays as one crew
- Monthly country trophies
- Rewarded ad for a short thrust boost (if approved for H5 Games Ads), never for pings
- Sound design (chiptune would suit the 16-bit style)
- Achievements

## Pages
- Home / game: thrust button, journey map, arrival date, signal timer, today's vote
- Mission log: votes, milestones, postcards
- Leaderboards: players and countries
- How to play
- Milestone fact pages (one per milestone)
- Sign in / profile: badges and stats
- Privacy policy, terms, contact

## Data & storage
- Cloudflare Workers with static assets
- A Durable Object holds the live shared state: the counter, the signal timer and the people-here count
- D1 holds accounts, device IDs, pings, votes, personal progress, leaderboards, the mission log and credits
- Personal progress is saved on the server, keyed to the device ID or the account, so offline thrust can be checked
- The browser keeps only the anonymous device ID and a local cache
- Cloudflare Turnstile handles the bot checks
- Pixel-art sprites are stored as PNG files at actual size in the site's assets

## Monetisation
- AdSense display ads, mostly on the content pages (mission log, fact pages, leaderboards, how to play)
- On the game page, ads sit well away from the thrust button (at least 150 px), with no anchor or floating ads
- Never reward or hint at clicking ads

## Design direction
- 16-bit SNES-era pixel art: a small pixel probe with a flickering thruster, chunky pixel planets, a twinkling pixel starfield
- UI framed in classic 16-bit game panels: bordered windows with a subtle gradient fill and a pixel border
- Limited palette of about 16–24 colours: deep navy and near-black for space, light blue as the main colour, light orange for urgency and celebrations, a few greys, one red for Mars
- Pixel font for headings, buttons and big numbers (e.g. Pixelify Sans); a clean readable font for small text and fact cards
- Phone first, then desktop
- One big central thrust button with clear space around it
- The arrival date and signal timer are the two most prominent numbers
- Mood: hopeful and shared, like a mission control room run by the whole world
- Motion: frame-based and 16-bit in feel. The thruster flickers, stars twinkle, the probe bobs, milestones get pixel confetti, safe mode dims the screen and the probe's light blinks slowly
- Respect reduced-motion settings

## Art assets
- Made with PixelLab, tidied in a pixel editor if needed
- One locked palette used for every asset: the design's colours in docs/tokens.css (decided 2026-11-18)
- Export at actual size; scale on the site only by whole numbers (2×, 3×, 4×) with crisp pixel rendering, never blurred
- Ready: probe, thruster (5 frames), Earth, rotating Earth (9 frames), Mars, rotating Mars (5 frames), Moon, starfield, firework, firework burst (7 frames), milestone flag, signal badge (blue, orange and red tiers); plus smaller copies made from them for where the design shows art at a smaller size (Mars at 64px and 32px, the small Earth)
- Animation sheets are one horizontal row of equal-sized frames
- Master copies are backed up in Google Drive (OneSmallClick folder); back up any new sprite there too
- Still to make: profile badge sprites (First Ping, Night Shift, Voter ×30, Halfway Crew, Mission Patch, Signal Keeper I–IV); see docs/todo.md

## Open questions
Answered ones point to the decision in docs/plan.md ("Decisions").
- ~~Prestige: what resets, and when?~~ **Decided:** upgrades and credits reset when you hand over the shift, any time after pushing 2,000,000 km since your last handover, for 3 Mission Patches (decision 10).
- ~~Daily vote: what time does it close, and how many options?~~ **Decided:** 3 options, closing at 00:00 UTC (decision 11). The pool of options is a draft waiting for approval (docs/todo.md).
- ~~Safe mode: how many days does the arrival date jump back?~~ **Decided:** every quiet hour adds about 10 hours, capped at 7 days per outage (decision 8).
- ~~Signal timer: how long is the window at launch?~~ **Decided:** 48 hours (decision 7).
- ~~How long should the first Mars mission take at launch traffic levels?~~ **Decided:** the design's numbers, about 6 months with a busy crew and never faster than about 4½ months (decision 4 and the crew-speed ceiling).
- Which email service sends the magic-link sign-in emails? (Recommended: Cloudflare Email Service; decision 14.)
- Country for leaderboards: detected automatically, or chosen by the player? (Recommended: detected, changeable once; decision 16.)
- Display names: how are rude names filtered out? (Recommended: generated names only at launch; decision 17.)
- Postcards: keep real space photos as a contrast, or convert them to pixel art? (Decision 13; can wait.)
- Confirm the .io domain is bought (needed before phase 8).
