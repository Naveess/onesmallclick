GOAL
Build phase 2 from docs/plan.md: the Vite + React + TypeScript app shell and the pixel kit that every screen is built from. The /kit page shows every piece, and / becomes a "launching soon" page built in the new app.

READ FIRST
- CLAUDE.md
- docs/plan.md ("Rules for every phase", "Phase 2" and the decisions already made)
- docs/brief.md and docs/design-brief.md
- docs/tokens.css
- The design file in design/, especially the Art kit screen
- design/sprites/README.md and design/icons/

DO
1. Save this prompt in docs/prompts/ with the next number, named for phase 2.
2. Replace the placeholder page with Vite + React + TypeScript and the Cloudflare Vite plugin, so `npm run dev` runs the app and the Worker together and `npm run deploy` builds and deploys. Put the new commands in CLAUDE.md.
3. Themes: the colours from docs/tokens.css under readable names, dark and light. Follow the system setting by default, with a toggle whose choice is saved in the browser.
4. The sky: the stepped gradient, nebula-tile.png, and the two star layers drifting at the design's 140 s and 70 s.
5. Components:
   - Window: the double border
   - PixelButton: blue, outline and orange
   - Sprite: plays a horizontal sheet with CSS steps(), at whole-number scales only, with crisp pixel rendering
   - PixelIcon: from design/icons
6. Fonts: self-host Pixelify Sans and VT323 and preload them, so the page doesn't jump while they load. No Google Fonts request.
7. Retime the sprite animations. Our sheets have 5/9/5/7 frames where the design has 4/8/4/6, so set the durations to keep the design's speed.
8. Respect reduced motion: the stars and sprites stop.
9. Build /kit showing every piece in both themes, and the new "launching soon" page at /.
10. When it's done: add a changelog line, tick phase 2 in docs/plan.md, commit and push. Then stop and give me the deploy command and the test list from the plan.

DON'T
- Build the game home or any game features. That's phase 3.
- Add a Durable Object, D1 or any server state.
- Add libraries beyond React, Vite, the Cloudflare Vite plugin, Wrangler and TypeScript without asking me first.
- Resize, recolour or re-compress any sprite.
- Deploy. I'll run it.

DONE WHEN
- `npm run dev` shows /kit and / working in both themes.
- The build passes with no TypeScript errors.
- Everything is pushed, and you've given me the deploy command and the test list.
