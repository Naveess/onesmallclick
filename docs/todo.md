# To do

Loose ends that aren't a phase yet. Tick them off or move them into docs/plan.md.

## Done 18 Nov 2026
- [x] Sprite set chosen: the full PixelLab export (5/9/5/7 frames). `public/sprites/` now holds it, and the placeholder page uses the 5-frame thruster sheet.
- [x] Milestone flag and signal badges (blue, orange, red) made and approved.
- [x] The design's 10 UI icons exported as SVGs (`design/icons/`, `public/icons/`).
- [x] Signal badge cut-offs agreed: blue = more than 6 hours left, orange = under 6 hours, red = the final 60 seconds.
- [x] Deployed `bf10eaf` (Nav ran it) and checked: every file in public/ matches the commit.
- [x] The design's two star layers and its small Earth exported as PNGs (`stars-far.png`, `stars-near.png`, `earth-small.png`).

## Tomorrow (19 Nov 2026)

### Make with PixelLab (once the generations refresh)
- [ ] **Profile badge sprites**, 32×32, matching the signal badge's round medal style:
  - First Ping
  - Night Shift
  - Voter ×30
  - Halfway Crew
  - Mission Patch
  - Signal Keeper I, II, III, IV (ping streaks; one design that gets grander at each level)
  - Cheapest route: one `create_image_pro` call at 32×32 costs 10 generations and returns 64 candidates. Give it the signal badge as the style reference, pick the best one for each badge, then tidy them in the free workbench. Back up the masters to Drive (OneSmallClick › Sprites).

### Then
- [x] Phase plan proposed in docs/plan.md (18 Nov). Next: answer the "Before phase 2" decisions there.

## At the end
- [ ] **Privacy page (phase 9) must mention Cloudflare Turnstile**, which runs on Ping, and the device cookie (`osc_device`, HttpOnly, 400 days).
- [ ] **Signal Keeper badge names (phase 8).** The signal card still shows the design's "Signal Keeper III · 4 days to IV"; only the streak number is real. Set the I–IV streak thresholds with the badges.
- [ ] **Add onesmallclick.io to the Turnstile widget's hostnames** when the domain is connected, or Ping will fail there.
- [ ] **Postcard photos.** Pick a real space photo for each of the six milestones, check each licence (prefer public-domain NASA/JPL) and note the credit line. Decide whether to keep them as photos or convert them to pixel art (open question in the brief).
