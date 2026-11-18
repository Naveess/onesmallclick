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
| `stills/starfield.png` | 256×256 | Nebula and starfield background tile. Not used in the design, which tiles `../assets/nebula-tile.png` (512×512) and adds code-drawn star layers. |

The stills are not copies of frame 0 of the matching animation. They are separate exports.

## Animations

| Animation | Sheet | Sheet size | Frames | Frame size | What it's for |
|---|---|---|---|---|---|
| Thruster | `sheets/thruster-sheet.png` | 320×40 | 5 | 64×40 | The probe flying: the engine flame flickers and the solar panels tilt. Game home (phone and desktop), Welcome back, Sign in, and Arrival (in orbit). |
| Rotating Earth | `sheets/earth-rotating-sheet.png` | 576×64 | 9 | 64×64 | Earth turning on the game home journey (phone and desktop). |
| Rotating Mars | `sheets/mars-rotating-sheet.png` | 640×128 | 5 | 128×128 | Mars turning on the game home journey (phone and desktop) and the Arrival & credits screen. |
| Firework burst | `sheets/firework-burst-sheet.png` | 448×64 | 7 | 64×64 | Pixel confetti for celebrations. In the design it plays once when a milestone is reached (the Milestone moment screen). Not looped. |

The separate frames match the sheets frame for frame:

| Folder | Files | Frame size |
|---|---|---|
| `frames/thruster/` | `thruster_0.png` … `thruster_4.png` (5) | 64×40 |
| `frames/earth-rotating/` | `earth-rotating_0.png` … `earth-rotating_8.png` (9) | 64×64 |
| `frames/mars-rotating/` | `mars-rotating_0.png` … `mars-rotating_4.png` (5) | 128×128 |
| `frames/firework-burst/` | `firework-burst_0.png` … `firework-burst_6.png` (7) | 64×64 |

## How this set differs from `../assets/`

The Claude Design file (`../OneSmallClick.dc.html`) loads its sprites from `../assets/`, not from here. The frame sizes match, but the frame counts don't:

| Animation | Here (`sprites/`, matches docs/brief.md) | Design file (`assets/`) |
|---|---|---|
| Probe / thruster | 5 frames, `thruster-sheet.png` 320×40 | 4 frames, `probe-sheet.png` 256×40 |
| Earth | 9 frames, 576×64 | 8 frames, `earth-sheet.png` 512×64 |
| Mars | 5 frames, 640×128 | 4 frames, `mars-sheet.png` 512×128 |
| Firework burst | 7 frames, 448×64 | 6 frames, `burst-sheet.png` 384×64 |

`assets/` also has `nebula-tile.png` (512×512), which the design uses as the sky on every screen. Decide which set ships before building the sprite animations. `public/sprites/` currently holds copies of `assets/`.

## Not here yet

- **Milestone flag.** The brief lists it under "Still to make". In the design, milestones show the code-drawn 9×9 star icon.
- **Signal badge.** Also "Still to make". The brief wants it coloured by how low the timer was when you pinged. The design's badges use the code-drawn 9×9 signal, star, clock, check and trophy icons in fixed colours.
- **UI icons.** The design draws ten 9×9 icons in code (`buildIcons()`: up, bolt, trophy, log, user, signal, clock, check, star, mail), each in four colours plus a light-theme set. They need exporting as static PNG or SVG files.
- **Star layers.** The design generates two parallax star layers in code (`buildSprites()`). They need exporting as static files, or replacing with `stills/starfield.png`.
- **Postcard photos.** The design leaves image slots for real space photos (e.g. `postcard-04`). They aren't sprites, but they're still to find and licence-check.
