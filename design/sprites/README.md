# Sprites

The full PixelLab export for OneSmallClick. Every file is a PNG at actual size. On the site, scale them only by whole numbers (2×, 3×, 4×) with `image-rendering: pixelated`. Master copies live in Google Drive (OneSmallClick folder).

- `stills/`: single images.
- `frames/`: each animation as separate numbered frames (`name_0.png`, `name_1.png`, …).
- `sheets/`: the same animations as one horizontal row of equal-sized frames, in the same order as `frames/`. Frame *n* starts at x = *n* × frame width.

Sizes are width × height in pixels, read from the files on 2026-11-18. The files are unchanged from the export.

## Stills

| File | Size | What it's for |
|---|---|---|
| `stills/probe.png` | 64×40 | The probe OSC-1, engine off. The design uses the still probe on the Safe mode screen (probe gone quiet). |
| `stills/earth.png` | 64×64 | Earth, where the route starts. The design uses the still on the Safe mode screen. |
| `stills/mars.png` | 128×128 | Mars, the destination. The design uses the still on the Milestone moment card and the Safe mode screen. |
| `stills/moon.png` | 32×32 | The Moon. The design places it near Earth on the desktop game home and on How to play. |
| `stills/firework.png` | 64×64 | One full firework. Not used in the design. Could stand in for the burst when reduced motion is on. |
| `stills/starfield.png` | 256×256 | Nebula and starfield background tile. Not shipped: the design's sky is `nebula-tile.png` with `stars-far.png` and `stars-near.png` on top. |
| `stills/stars-far.png` | 128×128 | Added 2026-11-18. The design's far star layer, exported exactly from `buildSprites()` (`stars(7, 90, 0)`). Tile at 2× (256px) over the nebula and drift it slowly (140s loop in the design). |
| `stills/stars-near.png` | 128×128 | Added 2026-11-18. The design's near star layer, with brighter cross-shaped stars (`stars(19, 14, 5)`). Tile at 2× and drift it twice as fast (70s) for parallax. |
| `stills/earth-small.png` | 16×16 | Added 2026-11-18. The small Earth on the "Mission" tab in the bottom bar, exported exactly from `buildSprites()` (`planet(7, 'earth', 1.3)`). The design shows it at 18px. Show it at 16px or 32px to keep whole-number scaling. |

| `stills/milestone-flag.png` | 32×32 | Added 2026-11-18. An orange pennant with a white star, planted in a Moon rock. Marks each of the six milestones on the route and goes on milestone cards and log entries. |
| `stills/signal-badge-blue.png` | 32×32 | Added 2026-11-18. Ping badge, calm tier: pinged with more than 6 hours left on the signal timer. |
| `stills/signal-badge-orange.png` | 32×32 | Added 2026-11-18. Ping badge, low tier: pinged with under 6 hours left. |
| `stills/signal-badge-red.png` | 32×32 | Added 2026-11-18. Ping badge, critical tier: pinged in the final 60 seconds, while the countdown pulses. |

The four sprites added on 2026-11-18 use only colours from the design and the existing sprites:
- The flag's cloth is the design's orange ramp (`#ffd27a`, `#ffb37a`, `#e8894a`), its star is `#eef3ff`, and its pole and rock use the Moon sprite's greys. The pole and rock started as a PixelLab Pixen generation. The cloth was redrawn by hand in the PixelLab workbench.
- The badges were drawn in the PixelLab workbench. Each one is the design's 9×9 signal icon at 2× on a `#13285a` face, with a 2px rim and a `#050817` outline. The tier colours are the design's blue ramp (`#b9e2ff` to `#2d6fbc`), its orange ramp (`#ffd27a` to `#a8582a`) and the Mars sprite's reds (`#f85a35` to `#5b102a`).
- Tier cut-offs (decided 2026-11-18): blue = more than 6 hours left, orange = under 6 hours, red = the final 60 seconds.
- Master copies are in Google Drive, OneSmallClick › Sprites.

The stills are not copies of frame 0 of the matching animation. They are separate exports.

## Animations

| Animation | Sheet | Sheet size | Frames | Frame size | What it's for |
|---|---|---|---|---|---|
| Thruster | `sheets/thruster-sheet.png` | 320×40 | 5 | 64×40 | The probe flying: the engine flame flickers and the solar panels tilt. Game home (phone and desktop), Welcome back, Sign in, and Arrival (in orbit). |
| Rotating Earth | `sheets/earth-rotating-sheet.png` | 576×64 | 9 | 64×64 | Earth turning on the game home journey (phone and desktop). |
| Rotating Mars | `sheets/mars-rotating-sheet.png` | 640×128 | 5 | 128×128 | Mars turning on the Arrival & credits screen. |
| Rotating Mars, 64px | `sheets/mars-rotating-64-sheet.png` | 320×64 | 5 | 64×64 | Mars on the game home track (phone and desktop). Made 2026-11-18 from the 128px sheet: each 2×2 block became its most common colour (ties go to the darker one, so the outline and the shadow side survive), with mostly see-through blocks left see-through. Replaces the design's half-scaling, since sprites only scale by whole numbers. |
| Firework burst | `sheets/firework-burst-sheet.png` | 448×64 | 7 | 64×64 | Pixel confetti for celebrations. In the design it plays once when a milestone is reached (the Milestone moment screen). Not looped. |

The separate frames match the sheets frame for frame:

| Folder | Files | Frame size |
|---|---|---|
| `frames/thruster/` | `thruster_0.png` … `thruster_4.png` (5) | 64×40 |
| `frames/earth-rotating/` | `earth-rotating_0.png` … `earth-rotating_8.png` (9) | 64×64 |
| `frames/mars-rotating/` | `mars-rotating_0.png` … `mars-rotating_4.png` (5) | 128×128 |
| `frames/firework-burst/` | `firework-burst_0.png` … `firework-burst_6.png` (7) | 64×64 |

## How this set differs from `../assets/`

**Decided 2026-11-18: this set ships** (5/9/5/7 frames). `public/sprites/` now holds it. `assets/` stays only so the design file still opens.

The Claude Design file (`../OneSmallClick.dc.html`) loads its sprites from `../assets/`, not from here. The frame sizes match, but the frame counts don't:

| Animation | Here (`sprites/`, matches docs/brief.md) | Design file (`assets/`) |
|---|---|---|
| Probe / thruster | 5 frames, `thruster-sheet.png` 320×40 | 4 frames, `probe-sheet.png` 256×40 |
| Earth | 9 frames, 576×64 | 8 frames, `earth-sheet.png` 512×64 |
| Mars | 5 frames, 640×128 | 4 frames, `mars-sheet.png` 512×128 |
| Firework burst | 7 frames, 448×64 | 6 frames, `burst-sheet.png` 384×64 |

`assets/` also has `nebula-tile.png` (512×512), which the design uses as the sky on every screen. `nebula-tile.png` ships too, copied into `public/sprites/`.

## Not here yet

The milestone flag and signal badge were made on 2026-11-18 (see Stills). Still missing:

- **Other profile badges.** First Ping, Night Shift, Voter ×30, Halfway Crew, Mission Patch and Signal Keeper I–IV still use the design's code-drawn 9×9 icons.
- **Postcard photos.** The design leaves image slots for real space photos (e.g. `postcard-04`). They aren't sprites, but they're still to find and licence-check.
