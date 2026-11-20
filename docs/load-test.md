# Load test (phase 9a)

`node scripts/load-test.mjs` (local; `npm run dev` must be running). Options: `--players=100,500,1000` (stages, each adding players on top of the last), `--seconds=45`. The live site needs `--live` and Nav's OK: every simulated player is a real device with real km there.

Each simulated player gets its own device, opens the probe's WebSocket and sends a batch of 8–30 taps every 2 seconds, like the app. Pings and votes aren't part of it (the network cap and the 5-second "someone just saved it" rule limit those anyway).

What it reports per stage: connection failures and drops; how long the probe takes to answer a tap batch ("credited"), at the median (p50), the slowest 1 in 20 (p95) and the slowest; how many "state" updates each player gets a second (at most one a second by design); and how much later updates reach some players than others (the fan-out spread).

Each stage counts only its own failures and drops, gives up on connecting after a 10 s timeout, and the run stops after a stage the probe didn't hold (most players gone, or the slowest 1 in 20 answers over 10 s).

Locally the probe runs in workerd through Vite on one laptop, alongside the simulated players, so the numbers are a rough guide, not the real thing. The live test is phase 9b.

## The finding and the fix (prompt 55, 2026-11-20)

**The cause was real work in the probe, not just the laptop.** Every tap batch asked "who's online?" about seven times (for the balance factor, the auto-thrust total, the idle pause, the snapshot's "people here"), and each answer read every open socket's attachment. With N players sending N/2 batches a second, that's N×N work a second: 4 million attachment reads a second at 1,000 players. A real crowd would have hit it too.

**The fix** (`worker/probe.ts`): the online list and its auto-thrust total are kept for 5 s between batches. Any socket opening, closing, signing in or out, or buying an upgrade clears it at once, so only a socket that goes silent without closing waits for it (that takes 90 s to notice anyway). A socket's "last seen" time is now rewritten every 15 s, not on every batch.

Before and after, same laptop, same run (30 s stages):

| Players | Answer p50 before | p95 before | p50 after | p95 after | Updates/s each after |
|---|---|---|---|---|---|
| 100 | 8 ms | 28 ms | 6 ms | 8 ms | 1.00 |
| 200 | 12 ms | 25 ms | 7 ms | 11 ms | 1.00 |
| 400 | 53 ms | 109 ms | 8 ms | 17 ms | 1.00 |
| 600 | – | – | 10 ms | 19 ms | 1.00 |
| 800 | – | – | 13 ms | 38 ms | 1.00 |
| 1,000 | – | – | 16 ms | 36 ms | 1.00 |
| 1,500 | – | – | 18 ms | 78 ms | 1.00 |
| 2,000 | – | – | 33 ms | 134 ms | 1.00 |
| 3,000 | – | – | fell over: 2,375 connected, answers 60–74 s, then the dev server hung | | |

Nobody failed to connect or dropped up to 2,000. The "before" answers doubled with every extra 100 players, the N×N pattern; "after" they grow slowly.

**What this means for launch.** 2,000 players tapping is 1,000 tap batches a second, which is Cloudflare's documented soft limit for one Durable Object (1,000 requests a second, "not guaranteed throughput"). So one probe should be good for about **1,500 players tapping at the same moment** with headroom. Past that, the cheapest next step is to have the app send its tap batch less often when the crowd is big (every 4 s instead of 2 s above ~1,500 online, which halves the load and changes nothing the player sees). Relay objects (several small objects that each collect taps from part of the crowd and pass on one total a second) are only worth building if the live test in 9b shows real crowds past that. **No relay objects for now.** The 3,000 collapse was local (one laptop running the probe, the dev server and 3,000 simulated players, with six other dev servers open); the live test in 9b gives the real number.

The 3 s stalls seen once at 100 players didn't come back in four runs after restarting the dev server (slowest at 100: 40–48 ms), so they look like the laptop.

## Storage: rows written (prompt 55)

Cloudflare bills both D1 and the probe's own SQLite by **rows written**: 100,000 a day each on the free plan (after that, writes fail until midnight UTC), and on Workers Paid 50 million a month each included, then $1 a million. `/admin` now shows rows written an hour for both (since the probe last started).

Measured with 100 simulated players tapping for 90 s: each player with the game open costs about **2,200 rows an hour in the probe's SQLite** (their progress is saved every 5 s, about 3 rows each time: the row is replaced, plus its index) and **about 1,000 rows an hour in D1** (the 30 s flush: today's km with its three indexes, the device's last seen, the progress copy).

| | Free plan (now) | Workers Paid |
|---|---|---|
| Probe SQLite | runs out after ~45 player-hours a day | ~23,000 player-hours a month included, then ~$0.0022 a player-hour |
| D1 | runs out after ~100 player-hours a day | ~50,000 player-hours a month included, then ~$0.001 a player-hour |

So on Workers Paid, 1,000 players around the clock would cost roughly **$75 a day** in rows written alone. **That needs fixing before launch** (proposal in docs/plan.md, "Phase 9a status"): save each player's progress every 60 s instead of 5 s (the shared distance keeps its 5 s save), update in place instead of replacing the row, flush to D1 every 5 minutes, and touch "last seen" at most once an hour. That should cut both by about 15×. The cost: if the probe restarts (a deploy, or a crash), players lose up to a minute of credits instead of 5 s, and the leaderboards' "today" lags up to 5 minutes.

**Built (prompt 56, Nav's OK).** As proposed, plus a queue of the km waiting for D1 kept in the probe's SQLite (`d1_queue`, saved with the 60 s save), so a restart loses at most a minute of them rather than 5 minutes. Measured the same way (100 players, 320 s, so the window takes in a 5-minute flush):

| Rows a player-hour | Before | After |
|---|---|---|
| Probe SQLite | ~2,200 | ~227 |
| D1 | ~1,000 | ~77 |
| Together | ~3,200 | ~300 (about 10× fewer) |

What's left in the probe: each player's progress row once a minute (with its index), their queue row once a minute, and the shared distance and pace every 5 s while anyone's playing (about 2,000 rows an hour in all, however many play: about half the free plan's daily allowance if it ran all day, and nothing much on Workers Paid).

| | Free plan (now) | Workers Paid |
|---|---|---|
| Probe SQLite | ~200–400 player-hours a day | ~220,000 player-hours a month included, then ~$0.0002 a player-hour |
| D1 | ~1,300 player-hours a day | ~650,000 player-hours a month included, then ~$0.0001 a player-hour |

So 1,000 players around the clock would now cost a few dollars a day in rows written on Workers Paid, not ~$75.

## Earlier results (2026-11-20, before the fix)


| Players | Connected | Tap batches/s | Answer p50 | p95 | max | Updates/s each | Spread p50 | p95 |
|---|---|---|---|---|---|---|---|---|
| 20 (trial, 10 s) | 20 | 10 | 5 ms | 8 ms | 16 ms | 1.00 | 1 ms | 1 ms |
| 100 | 100 | 50 | 11 ms | 3,195 ms | 3,632 ms | 0.80 | 6 ms | 8 ms |

**The first full run** (started earlier the same afternoon, finished late; its output turned up after Nav left):

| Players | Connected | Failed | Dropped | Tap batches/s | Answer p50 | p95 | max | Updates/s each |
|---|---|---|---|---|---|---|---|---|
| 100 | 100 | 0 | 0 | 50 | 7 ms | 14 ms | 25 ms | 1.00 |
| 500 | 0 | 75 | 425 | 0 | – | – | – | 0 |
| (1,000) | 500 still open | | | 250 | 22.8 s | 32.1 s | 33.4 s | 0.04 |
| 2,000 | 0 | 1,075 | 925 | 0 | – | – | – | 0 |

- **100 players was fine** in that run: answers in 7 ms (14 ms for the slowest 1 in 20) and one update a second each.
- **Somewhere between 100 and 500 players the local probe fell over.** Connecting the next 400 took almost 15 minutes, every player dropped, and the ones still open waited 20–30 seconds for answers. At 2,000 nothing connected and the dev server stopped answering altogether.
- The later rows are muddled (the script counts players across stages), but the message is clear. **This is the most important thing to understand in 9a.** It may be the laptop (workerd through Vite, local D1, and the simulated players all on one machine, with five other dev servers running), or it may be real work the probe does per player or per tap batch that a real crowd would also hit. Next: find where the probe spends its time as players go from 100 to 500 (per-batch D1 writes, the badge checks, the snapshot sent on every "credited"), fix the script's stage counting, and re-run in steps (100, 200, 300…).

**The second run** (after restarting the dev server):

- **At 100 players about 1 in 20 tap batches waited about 3 seconds**, and updates came 0.8 a second instead of 1. Most answers took 11 ms, so the probe is fast between pauses. The likely cause is the probe's periodic save or its D1 flush holding it up (local D1 is slower than the real one). To find out before changing anything.
- 500 and 1,000: stopped when Nav went home.
