GOAL
Plan the OneSmallClick build in phases. Plan only: no code.

READ FIRST
- CLAUDE.md
- docs/brief.md
- docs/prompts/02-design-handoff.md
- design/ (the Claude Design export) and design/sprites/README.md (the pixel-art sprites)

DO
1. Propose a phase plan where every phase can be deployed and tested on workers.dev. Start from this order and change it if you see a better one:
   a. The game screen from the design, using the sprites and fake data
   b. Shared counter in a Durable Object: batched clicks, live arrival date, people-here count
   c. Signal timer and daily ping, safe mode, signal badges
   d. Idle upgrades: auto-thrusters, prestige, offline thrust capped at 8 hours and checked by the server
   e. Daily crew vote, mission log, milestones, fact pages and postcards
   f. Accounts (email link and Google), player and country leaderboards, mission credits
   g. Anti-cheat (Turnstile, per-network cap), ad slots, privacy and terms pages, launch checks
2. For each phase give: the goal, what gets built, data changes (D1 tables, Durable Object state), how I test it, and the main risks.
3. List the decisions I need to make before each phase, taken from the brief's open questions.
4. Recommend an email service for magic-link sign-in that works well with Cloudflare Workers, with the free tier and costs.
5. Save the plan as docs/plan.md and this prompt as docs/prompts/03-plan.md.

DON'T
- Write any app code.
- Create Cloudflare resources.
- Change the design.

DONE WHEN
- docs/plan.md exists.
- You've shown me a short summary of the phases and the first decisions I need to make.
