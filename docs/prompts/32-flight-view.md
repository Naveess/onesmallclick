# 32 · Flight view

Date: 2026-11-19

> GOAL
> Build the flight view phase from docs/plan.md ("Flight view (before 8b)"): the game home's flight view replaces JourneyTrack, and "You've clicked" under THRUST shows real per-player click counts from the server. Deploy-ready tonight.
>
> READ FIRST
> - CLAUDE.md
> - docs/plan.md ("Rules for every phase" and "Flight view")
> - docs/todo.md ("Tonight" and the flight view art)
> - The design file: game home 1a (phone) and 1b (desktop), from commits abc10c7, 1357c54 and fcb448c
> - src/components/JourneyTrack.tsx, ThrustButton.tsx, GameShell.tsx, src/game/store.ts and worker/probe.ts
>
> DO
> 1. Save this prompt in docs/prompts/ with the next number.
> 2. Pull main first. The plan and todo were updated on GitHub (393661b).
> 3. Explain your approach briefly (components, the click-count data, migration 0008), then go ahead without waiting unless something in the design is unclear or conflicts with the plan.
> 4. Build the flight view to match the design exactly:
>    - the probe flying right, Mars growing as the crew closes in, Earth shrinking behind;
>    - stars and speed lines streaming past;
>    - the THRUST boost with the "+km" pop;
>    - crew sparks driven by the live crew pace (no per-tap broadcast);
>    - the next-milestone beacon;
>    - the route strip with the Ceres/Vesta split and a tiny pixel probe;
>    - the probe travelling across the window with its trail and the dashed path ahead.
>    - States: final 60 seconds, safe mode, a small crew, the idle pause and reduced motion.
>    - Deep space in light mode too.
>    - The flight window needs `flex: none` on phones, or it squashes to a line.
> 5. Art: draw the new pieces in code for now (exhaust flame, comet, speed lines, Sun, small Vesta), as the design does, in one place so PixelLab sprites can replace them later. Mars and Earth grow in a few fixed whole-number sizes, never smooth or fractional scaling.
> 6. "You've clicked": today's clicks as an odometer, the all-time total, and a bar to the next click badge (Steady Finger 1,500, Iron Thumb 5,000, Ten Thousand Club 10,000). The badges themselves come in 8b.
> 7. Server: count credited taps only (capped taps don't count), per player key (the account when signed in, else the device), today's count (UTC) and all-time. Keep them in the Probe object and copy them to D1 with the other numbers (e.g. a `taps` column on `daily_km` in migration 0008). Merging a device into an account adds its counts.
> 8. Keep JourneyTrack's file until the flight view is approved, but stop using it.
> 9. Check it at 375, 390 and 1440 in both themes, with screenshots. Then add a changelog line, update the plan's "As built", commit and push. Stop and give me the migration and deploy commands and the test list.
>
> DON'T
> - Build badges, leaderboards or the profile (8b).
> - Change game rules, balance or upgrade numbers.
> - Add libraries without asking.
> - Deploy or run remote migrations. I'll run them.
>
> DONE WHEN
> - The game home matches the design at 375, 390 and 1440 in both themes, and the flight window keeps its height on phones.
> - Tapping THRUST boosts the probe, pops "+km" and counts up today's clicks, and the counts survive a reload.
> - The build passes with no TypeScript errors, and everything is pushed.
