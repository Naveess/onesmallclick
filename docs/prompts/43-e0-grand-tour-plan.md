# 43 · E0: plan the Grand Tour

Date: 2026-11-20

> prompt for E0
>
> GOAL
> Plan the build of the expansion beyond Mars (the Grand Tour) in phases, from the updated design and the decisions below. This is planning and content drafting only, with no app code. Run it after 8b and before 8c, so 8c's destination vote is built the campaign way from the start.
>
> READ FIRST
> - CLAUDE.md
> - docs/plan.md (phase 8c especially), docs/brief.md and docs/design-brief.md
> - shared/mission.ts (the 30-day self-balancing thrust), shared/upgrades.ts and shared/votes.ts
> - content/milestones.json and content/vote-options.json, for the format and fact-checking standard
> - The updated design file in design/: screens 1m, 1n and 1o, and the updated 1a/1b, 1j, 1k and Art kit
> - docs/todo.md ("Expansion: the Grand Tour" and the art list)
>
> AGREED (Nav, 19 Nov 2026). The design file already shows all of this: screens 1m (campaign map), 1n (new probe reveal), 1o (landing burn), and the updates to 1a/1b, 1j and 1k.
> - A campaign map (star chart) of the whole journey. At each stop the crew votes between two branches. Each mission has its own probe, with a new sprite and its own upgrade names (same systems and numbers).
> - Route: Earth → Mars → Ceres or Vesta → Jupiter → Europa or Ganymede → Saturn → Titan or Enceladus → Uranus → Miranda or Titania → Neptune → Pluto or Arrokoth → the heliopause → interstellar (an endless last leg).
> - Each leg targets about 30 days, using the same self-balancing thrust, whatever its real distance.
> - Arrival medals: Gold by day 25, Silver by day 30, Bronze after that. The colours are approved and on the Art kit screen.
> - Planet tech: each stop unlocks a small, permanent, crew-wide perk with Gold/Silver/Bronze strengths. It's shown on the branch vote and the map. It affects personal credits and upgrades only, never trip speed.
> - For everyone who helped that leg: a passport stamp in the medal's colour and a cosmetic unlock (skies, THRUST trails, probe paint).
> - The landing burn: 2,000,000 km in the final hour. Success gives a gold-framed postcard. A miss still arrives ("Rough landing, but we made it"), so it's never a punishment.
> - Fun facts: about 30 per destination, one a day on the Destination file card, shareable, shown on the map, and collected on one plain HTML page per destination.
> - Nothing is ever linked to ads (AdSense rules).
>
> DO
> 1. Save this prompt in docs/prompts/ with the next number.
> 2. Write docs/expansion.md covering:
>    - The campaign as a graph: stops, branches, and how the branches meet up again (as agreed above; flag any science problem rather than changing it).
>    - Real distances for each leg, from the previous stop (with sources), and how the 30-day self-balancing target applies to legs of very different lengths.
>    - What players carry from mission to mission. My starting view: credits, upgrades, patches, badges and streaks all carry over, and upgrades are renamed for the new probe rather than reset. Tell me if the balance says otherwise.
>    - What the map shows. My starting view: the whole chart from day one, future stops dimmed, the next two branches teased, and branches not taken marked "not taken" (they could return in a later season).
>    - The endless interstellar leg: what keeps it interesting (e.g. distance records, monthly country trophies) and whether it ends a "season".
>    - Per-probe upgrade feel: for each probe, new names and one-line descriptions for the five upgrades, and at most one small signature perk (or none). Flag anything that changes balance.
>    - What each new leg needs before it can launch: probe sprite and thruster sheet, upgrade names, 4–6 milestones with checked facts, a vote pool, postcard photos, and the next two branches.
>    - Social sharing: a shareable map card ("The crew chose Europa"), and the arrival and branch results as share text.
>    - The rewards:
>      - how the agreed medal days (25 / 30) work with the self-balancing maths;
>      - a planet tech perk for every stop, with its Gold/Silver/Bronze strengths, and a sim of the stacked totals across the whole tour (keep them small);
>      - who counts as "helped";
>      - the cosmetics list per stop;
>      - the landing burn (2,000,000 km in one hour): whether that's reachable with a small crew, and whether it should scale with people here;
>      - the data needed (e.g. medals, perks, stamps, cosmetics owned and in use).
>    - Fun facts: the destination file card, the daily rotation, and the destination pages (e.g. /destinations/<slug>).
> 3. Draft content/campaign.json: stops, branches, distances, probe names, each probe's upgrade names and descriptions, each stop's planet tech, medal days and cosmetics. Also draft content/facts/mars.json with 30 fun facts about Mars, each with a source, as the template for the other destinations. Check the fun facts already shown in the design against sources, and list any that are wrong. Facts and sources go only where you've checked them; mark everything else TODO. It's a draft for my approval.
> 4. Update phase 8c in docs/plan.md: the next-destination vote becomes a two-way branch read from content/campaign.json, instead of Europa, Psyche or a Venus flyby. The Venus flyby can become a detour option in the daily vote pool instead.
> 5. Add expansion phases to docs/plan.md after phase 9, each with a goal, what gets built, data changes, tests and risks:
>    - E1: the campaign map screen;
>    - E2: per-mission probes and upgrade names;
>    - E3: a content pipeline for each new leg;
>    - E4: sharing, fun facts and destination pages;
>    - E4b: collective rewards: medals, planet tech, passport stamps, cosmetics and the landing burn (say whether medals and the facts card should come before launch, since the Mars leg is the first one players see);
>    - E5: later ideas from the brief (streamer mode, monthly country trophies, chiptune sound, achievements, rewarded ads).
> 6. List the decisions still open, with your recommendation for each, and check the art list in docs/todo.md against the design. Add anything missing.
> 7. Add a changelog line, then commit and push. Stop and give me a short summary.
>
> DON'T
> - Write app code or change game rules.
> - Create Cloudflare resources.
> - Mark any fact as checked unless you've checked it against a source.
>
> DONE WHEN
> - docs/expansion.md and the content/campaign.json draft exist.
> - Phase 8c and phases E1–E5 are in docs/plan.md.
> - You've shown me the route, the decisions and the asset list.
