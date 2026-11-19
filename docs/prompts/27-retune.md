# 27 · Retune: 30-day mission, idle pause, launch keeps players

Date: 2026-11-19

> GOAL
> Retune the mission to the decisions Nav made on 18 Nov, which didn't make it into docs/plan.md: about 30 days to Mars with self-balancing thrust, an 8-hour idle pause, and only the mission resetting at launch. Run this before phase 8a.
>
> READ FIRST
> - CLAUDE.md
> - docs/plan.md (decisions 4, 5 and 6, the phase 4 and phase 6 "As built" notes, and the crew-speed ceiling)
> - shared/mission.ts, shared/upgrades.ts and worker/probe.ts
> - content/milestones.json and content/vote-options.json, for the effects measured in hours
>
> DECISIONS (Nav, 18–19 Nov 2026). These replace decisions 4, 5 and 6 in docs/plan.md.
> 4. Mission length: about 30 days to Mars at launch traffic, with self-balancing thrust instead of the current "about 6 months, never under 4½ months".
> 5. Idle pause: the probe coasts on its own, but pauses after 8 hours with no player activity (any tap batch or auto-thrust from a connected player). The next tap wakes it. While paused, the screen says "Probe idle: tap to wake it" and the arrival date shows as on hold.
> 6. Launch: reset only the mission (distance, route, milestones reached, the current vote round and the mission log) and set the real start date. Keep devices, pings, streaks, progress, credits, upgrades and patches.
>
> DO
> 1. Save this prompt in docs/prompts/ with the next number.
> 2. Update docs/plan.md (decisions 4, 5 and 6, and phase 9's "Fresh start"), docs/brief.md's open questions, and CLAUDE.md wherever they mention the old numbers.
> 3. Design the self-balancing thrust first, then STOP for my OK:
>    - Rules:
>      - Every tap still visibly counts. A player's own km, credits and prestige progress always count in full.
>      - More players always means arriving sooner, never later, but each extra player helps a bit less as the crowd grows. This replaces the current ceiling (full to 10 km/s, flattening towards 21).
>      - Coasting alone must never finish the mission.
>    - Targets:
>      - About 30 days with a small crowd (roughly 20–50 people playing a few minutes a day, plus their auto-thrust).
>      - No sooner than about 14 days, even with 10,000 people.
>    - Keep every balance number in shared/mission.ts (or one balance file).
>    - Write `npm run sim`, printing the days to arrival for 1, 10, 50, 200, 1,000 and 10,000 daily players at typical tap rates and upgrade levels.
>    - Check whether the other hour-based numbers still fit a 30-day trip, and suggest new values for my OK:
>      - the safe-mode setback (10 hours per quiet hour, capped at 7 days, which is nearly a quarter of the trip);
>      - the vote effects (6–24 hours);
>      - the 48-hour signal window.
>    - Show me the formula, the sim table and your suggestions, and WAIT.
> 4. After my OK, build it. The arrival estimate, "your taps got us there X sooner", "+N km/s from crew", welcome back's "arrival moved" and /admin must all use the new balance.
> 5. Build the idle pause:
>    - A Durable Object alarm that survives restarts.
>    - The milestone alarm and the arrival estimate must respect the pause, so no milestone fires while the probe is paused.
>    - Log a "probe idle" and a "probe woken" entry, and show who woke it.
>    - Moving the /admin clock past 8 hours with no activity must pause it.
> 6. Add a "Reset mission (keep players)" action to /admin. It does exactly what decision 6 describes, so the launch reset can be tested now. Ask me before running it against live data.
> 7. When it's done: add a changelog line, update the "As built" notes in docs/plan.md, commit and push. Then stop and give me any migration and deploy commands and the test list.
>
> DON'T
> - Change upgrade prices, tap power or the prestige threshold without asking.
> - Wipe or reset live data, except through /admin when I ask.
> - Add libraries without asking.
> - Deploy. I'll run it.
>
> DONE WHEN
> - The sim table shows about 30 days for a small crew and at least about 14 days for 10,000 players, and I've OK'd it.
> - 8 hours with no activity (via /admin) puts the probe on hold, and one tap wakes it.
> - "Reset mission (keep players)" works locally and keeps progress, pings and streaks.
> - The build passes with no TypeScript errors, and everything is pushed.
