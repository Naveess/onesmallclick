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

- **At 100 players about 1 in 20 tap batches waited about 3 seconds**, and updates came 0.8 a second instead of 1. Most answers took 11 ms, so the probe is fast between pauses. The likely cause is the probe's periodic save or its D1 flush holding it up (local D1 is slower than the real one). To find out before changing anything.
- **The first try at 2,000 players hung the local dev server** (it stopped answering and had to be restarted). That may be the laptop rather than the probe: 2,000 sockets from one Node process plus workerd. To retry on its own after the 500 and 1,000 stages.
- 500 and 1,000: not run yet (stopped when Nav went home).
