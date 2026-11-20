# Pixel flags

`flags-16x12.png`: 256 country flags at 16×12 pixels, 16 to a row, in the order of `src/game/flagIndex.json` (two-letter code → position). The leaderboards show them at 2× (`src/components/Flag.tsx`). Added 2026-11-20 (prompts 40–41).

- **Made by** `node scripts/make-flags.mjs <flag-icons folder>`. Each flag is drawn from the [flag-icons](https://github.com/lipis/flag-icons) 4×3 SVG (version 7.2.3, MIT licence, © 2013 Panayiotis Lipiridis; see `LICENSE-flag-icons.txt`) at 64×48, then every 4×4 block becomes its most common colour.
- **Hand-tidied:** 54 flags whose emblem turned to noise when shrunk, set in `scripts/flags/overrides.json`. GB, the EU, Saint Helena, Belize, Guam and Eritrea are drawn pixel by pixel. The 18 flags with the Union Jack in the corner get a clean 8×6 Union Jack. The rest keep their stripes, and their emblem becomes a simple hand-made shape (a shield, disc, crest, crown and so on) in the emblem's colours.
- **Colours:** each flag keeps its real colours, an agreed exception to the locked palette (Nav, prompt 41).
- `public/sprites/flags-16x12.png` is the served copy, with the licence beside it.
