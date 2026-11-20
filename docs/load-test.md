# Load test (phase 9a)

`node scripts/load-test.mjs` (local; `npm run dev` must be running). Options: `--players=100,500,1000` (stages, each adding players on top of the last), `--seconds=45`. The live site needs `--live` and Nav's OK: every simulated player is a real device with real km there.

Each simulated player gets its own device, opens the probe's WebSocket and sends a batch of 8–30 taps every 2 seconds, like the app. Pings and votes aren't part of it (the network cap and the 5-second "someone just saved it" rule limit those anyway).

What it reports per stage: connection failures and drops; how long the probe takes to answer a tap batch ("credited"), at the median (p50), the slowest 1 in 20 (p95) and the slowest; how many "state" updates each player gets a second (at most one a second by design); and how much later updates reach some players than others (the fan-out spread).

Locally the probe runs in workerd through Vite on one laptop, alongside the simulated players, so the numbers are a rough guide, not the real thing. The live test is phase 9b.

## Results so far (2026-11-20, local)

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
