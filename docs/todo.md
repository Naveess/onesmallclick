# To do

Loose ends that aren't a phase yet. Tick them off or move them into docs/plan.md.

## Done 18 Nov 2026
- [x] Sprite set chosen: the full PixelLab export (5/9/5/7 frames). `public/sprites/` now holds it, and the placeholder page uses the 5-frame thruster sheet.
- [x] Milestone flag and signal badges (blue, orange, red) made and approved.
- [x] The design's 10 UI icons exported as SVGs (`design/icons/`, `public/icons/`).
- [x] Signal badge cut-offs agreed: blue = more than 6 hours left, orange = under 6 hours, red = the final 60 seconds.
- [x] Deployed `bf10eaf` (Nav ran it) and checked: every file in public/ matches the commit.
- [x] The design's two star layers and its small Earth exported as PNGs (`stars-far.png`, `stars-near.png`, `earth-small.png`).

## Done 19 Nov 2026
- [x] Phases 5 (signal, Ping, safe mode), 6 (idle upgrades) and 7a (daily vote, mission log) deployed and approved.
- [x] Phase 7b (milestones, fact pages, How to play) built and pushed (`31172c3`).
- [x] Backup: everything on GitHub; the five sprites made since 18 Nov (`mars-32`, `mars-rotating-64-sheet`, `earth-small`, `stars-far`, `stars-near`) added to Drive (OneSmallClick › Sprites).

## Next
- [x] **Deploy 7b** (Nav, 19 Nov; the live bundle matches 31172c3 and migration 0005 is applied): `npx wrangler d1 migrations apply onesmallclick --remote` (migration 0005), then `npm run deploy`, then the four checks in the 7b handover.

## Before phase 8
- [ ] **The retune** (prompts 27-28): built and pushed 19 Nov; migration 0006 applied and deployed from c132a88 (Claude ran both at Nav's request; the live bundle matches the build). Nav: run the checks, then approve. 8a starts once it's approved.
- [ ] **Buy onesmallclick.io and add it to Cloudflare** (Nav, next payday Friday). Then switch on Workers Paid for Email Service.
- [ ] **A Google OAuth client** (Nav, before 8a is tested): I'll list the steps when 8a starts.

### Before 8b (badges)

### Make with PixelLab (once the generations refresh)
- [ ] **Profile badge sprites**, 32×32, matching the signal badge's round medal style:
  - First Ping
  - Night Shift
  - Voter ×30
  - Halfway Crew
  - Mission Patch
  - Signal Keeper I, II, III, IV (ping streaks; one design that gets grander at each level)
  - Cheapest route: one `create_image_pro` call at 32×32 costs 10 generations and returns 64 candidates. Give it the signal badge as the style reference, pick the best one for each badge, then tidy them in the free workbench. Back up the masters to Drive (OneSmallClick › Sprites).

## Before launch
- [x] **Approve the six milestones** (`content/milestones.json`): names, distances, the moment's fact and sub-line, the fact pages' text, and the sources. Approved 19 Nov.
- [x] **Approve the vote pool** (`content/vote-options.json`): wording, effects, and each detour's fact against its source link. Approved 19 Nov.

## At the end
- [ ] **Privacy page (phase 9) must mention Cloudflare Turnstile**, which runs on Ping, and the device cookie (`osc_device`, HttpOnly, 400 days).
- [ ] **Signal Keeper badge names (phase 8).** The signal card still shows the design's "Signal Keeper III · 4 days to IV"; only the streak number is real. Set the I–IV streak thresholds with the badges.
- [ ] **Add onesmallclick.io to the Turnstile widget's hostnames** when the domain is connected, or Ping will fail there.
- [ ] **Postcard photos.** Pick a real space photo for each of the six milestones, check each licence (prefer public-domain NASA/JPL) and note the credit line. Decide whether to keep them as photos or convert them to pixel art (open question in the brief).
