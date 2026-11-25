Claude Design export and pixel-art sprites for OneSmallClick.

- `OneSmallClick.dc.html`: the design (screens 1a–1o, updated 2026-11-19). Open through a local server: `python -m http.server 8000` in this folder.
- `assets/`: the sprites the design file uses. Added 2026-11-19 from PixelLab: `probe-europa-lander.png` (64×64), `probe-ganymede-orbiter.png` (64×64), `jupiter.png` (96×96), `saturn.png` (128×80), `europa.png` (64×64). They're in `sprites/stills/` too, and in Drive (`onesmallclick-stills-2026-11-19.zip`, 25 Nov). Other new art in the design is drawn in code or left as placeholders (see docs/todo.md).
- `sprites/`: the full PixelLab export (frames, sheets, stills). Master copies also live in Google Drive (OneSmallClick folder).
- `support.js`, `image-slot.js`, `_ds/`: Claude Design runtime, only needed to open the design file. Don't ship.
- `scratch/`, `uploads/`: leftover working files from the design process.
