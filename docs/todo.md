# To do

Loose ends that aren't a phase yet. Tick them off or move them into docs/plan.md.

## Tomorrow (19 Nov 2026)

### Decisions for Nav
- [ ] **Which sprite set ships?** Choose `design/sprites/` (5/9/5/7 frames, matches the brief) or `design/assets/` (4/8/4/6, what the design file uses). `public/sprites/` holds `design/assets/` for now. See the comparison in design/sprites/README.md.
- [ ] **Signal badge tiers.** Three badges are made: blue, orange and red. Decide which timer level gets which colour (e.g. blue = more than half the window left, orange = under an hour, red = the last 60 seconds). This goes with the open "signal window at launch" question in the brief.
- [ ] **Look over the new sprites.** `milestone-flag.png` and `signal-badge-{blue,orange,red}.png` in `design/sprites/stills/`. Redraw anything that doesn't feel right.
- [ ] **PixelLab generations.** The trial is used up (0 left). Top up if more AI sprites are wanted, e.g. a waving flag animation or badge art beyond the signal badge.

### Still missing from the design
- [ ] **Export the 9×9 UI icons** from `buildIcons()` in `design/OneSmallClick.dc.html` as static PNG or SVG files: up, bolt, trophy, log, user, signal, clock, check, star and mail. Each comes in dark-theme colours (blue, orange, white, muted) and light-theme colours. Their exact grids and hex values are in the file, so this is a mechanical export, not new art.
- [ ] **Export the star layers** from `buildSprites()` (two parallax layers) as static files, or decide to use `design/sprites/stills/starfield.png` instead.
- [ ] **Badge art for the other profile badges** (First Ping, Night Shift, Voter ×30, Halfway Crew, Mission Patch, Signal Keeper I–IV), if they should get proper sprites rather than 9×9 icons.
- [ ] **Postcard photos.** Pick a real space photo for each of the six milestones, check each licence (prefer public-domain NASA/JPL) and note the credit line. Decide whether to keep them as photos or convert them to pixel art (open question in the brief).

### Then
- [ ] Propose the full phase plan (docs/plan.md "Next").
