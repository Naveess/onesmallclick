# OneSmallClick: design brief for the build

Implement this design in this codebase:
https://claude.ai/code/artifact/f83946f1-4a8c-46b1-9a9d-4bba08a95fd3

Read the design's files from that link. Match how it looks, using this codebase's own components and conventions.

## The screens (all in `design/OneSmallClick.dc.html`)

| ID | Screen | Notes |
|---|---|---|
| — | Art kit & notes | Sprites, palette swatches, type samples |
| 1a | Game home · phone (390×844) | Header (players online), live arrival date, Earth→Mars progress track with the probe, THRUST button, signal countdown and Ping, today's route vote, ad slot, bottom tab bar. Scrolls. |
| 1b | Game home · desktop 1440 | Same content, wide layout |
| 1c | Upgrades bottom sheet | Credits, auto-thrust upgrades, tap upgrades, Prestige card. Buying works in the mock-up. |
| 1d | Welcome back | Offline summary: "8 h counted / 3 h 32 m not counted" |
| 1e | Milestone moment | Postcard (real space photo) + fact from the flight deck, celebration burst + confetti |
| 1f | Safe mode | Signal lost. It's a setback, not game over. Big orange PING button that wakes the probe |
| 1g | Leaderboards | Players / Countries tabs, top 3 coloured, your own row pinned |
| 1h | Mission log | Votes, results, milestones, postcards, signal saves, as a timeline |
| 1i | Sign in | Email link or Google |
| 1j | Profile | Badges, distance, 30-day ping history grid |
| 1k | Arrival & credits | Scrolling crew credits, then a vote on the next destination (Europa / Psyche / Venus flyby) |
| 1l | How to play | Numbered steps |

## Game rules decided so far

- **One shared probe**, with a route of **480,000,000 km** Earth→Mars. Every tap from every player moves it.
- **Six milestones** (halfway = milestone 4 at 240M km). Each one unlocks a postcard and a fact.
- **Live arrival estimate**, worked out from the crew's current pace. It shows "your taps today got us there X min sooner".
- **Personal idle game**: credits are earned at the same rate as the km the player adds.
  - Auto-thrust: Cold-gas jets +0.02 km/s each (base cost 150), Ion drive +0.08 (900), Solar sail +0.30 (12,000).
  - Tap power: Steady hands +2 km per tap (300), Crew chant +25% tap power (4,000).
  - Each upgrade's cost goes up by ×1.55 per level. Tap km = (4 + 2×hands) × (1 + 0.25×chant).
  - **Prestige**: "Hand over the shift". This resets upgrades and credits in exchange for 3 Mission Patches, each worth +10% thrust forever.
- **Offline thrust is capped at 8 hours** and checked by the server.
- **The signal**: the probe needs a Ping at least every 24 hours or it goes into safe mode. Every quiet hour adds about 10 hours to the trip. Each player gets one Ping a day, tied to their device and, if they're signed in, their account. The last 60 seconds of the countdown pulse urgently (in the style of Reddit's "The Button").
- **Daily route vote**: three options, closes at 00:00 UTC. The result is written to the mission log.
- **Leaderboards**: individual players and countries.
- **Accounts at launch**: sign-in by email magic link or Google. Playing without an account still works, tied to the device.
- **After Mars**: crew credits, then players vote on the next destination.
- **Badges**: Signal Keeper I–IV (ping streaks), First Ping, Night Shift, Voter ×30, Halfway Crew, Mission Patch.
- **Signal badge per ping** (decided 2026-11-18): blue with more than 6 hours left on the timer, orange under 6 hours, red in the final 60 seconds.

## Things the server must handle (anti-cheat)

- Taps are counted on the server in batches and rate-limited per device or account. Never trust a client's km total.
- The offline catch-up is calculated on the server, capped at 8 hours.
- Pings are limited to one per device and account per UTC day.
- The global distance is one shared counter that every player sees update live.
