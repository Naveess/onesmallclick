# Postcard photos (prompts 95-97)

**Status (prompt 97): wired in, not deployed.** Every milestone on the Mars, Ceres and Vesta legs, and each stop's landing postcard, shows its photo with its credit line:
- on the milestone moment, the landing result, the mission log and the fact pages (which also link the photo's NASA page under Sources);
- the data is each milestone's `postcard` and the stop's `landingPostcard` in `content/milestones/<stop>.json` (NASA id, image, alt, credit, licence, source);
- the images are `public/postcards/<id>.jpg` (596 × 368), made by `python -I scripts/make-postcards.py` (originals cached in `../onesmallclick-postcard-originals/`);
- `npm run check-leg` fails a leg whose milestones or landing have no photo.

**To swap a photo:** change the `postcard` in the content file, run the script, then `npm run check-leg`. **When MSSS says yes:** Mars 5 becomes PIA19400 with the credit "NASA/JPL-Caltech/MSSS/Texas A&M Univ." and the licence "MSSS permission (date)". A new leg's photos follow the same rules.

Real NASA photos for the milestone and landing postcards (Nav, prompt 91). The slot is about 298 × 184 (landscape). Previews: NASA Image and Video Library (`https://images-api.nasa.gov/search?nasa_id=<id>`).

**Licences** (the site will carry ads, so this is commercial use):
- **Free to use with a credit line:** NASA, NASA/JPL(-Caltech), USGS and NASA photographers. JPL asks for "Courtesy NASA/JPL-Caltech" unless the caption says otherwise. Don't imply that NASA endorses anything, and no NASA logos.
- **HiRISE** (University of Arizona): "there is no copyright restriction"; their credit is "NASA/JPL/University of Arizona".
- **Webb from ESA** (esawebb.org): CC BY 4.0. Use the caption's credit unchanged and keep it visible next to the image.
- **Needs a check:** credits that name a company or other partner, such as MSSS, ASU, Texas A&M, Cornell or Goddard/ASU (LRO). JPL says partners restrict commercial use.

## Mars

**Nav's picks (prompt 96):** 1 as08-14-2383 Earthrise; 2 GSFC_20171208_Archive_e000422 the Webb primary mirror; 3 PIA23214 Goldstone; 4 GSFC_20171208_Archive_e002035 the Sun; 5 PIA19400 Curiosity's blue sunset, if MSSS says yes (fallback PIA23202, InSight). 6 and 7 still to confirm (proposed: PIA10368 HiRISE Phobos; PIA24428 the sky crane).

Candidates as shown:

| Postcard | Pick | Alternatives |
|---|---|---|
| 1 Past the Moon | as08-14-2383 Earthrise (NASA) | PIA00342 Galileo Earth & Moon (NASA/JPL/USGS); LRO Earthrise GSFC_20171208_Archive_e000496 (needs a check) |
| 2 Waving at Webb | carina_nebula, the Cosmic Cliffs (NASA, ESA, CSA, STScI; CC BY 4.0) | GSFC_20171208_Archive_e000422, the primary mirror (NASA/Chris Gunn) |
| 3 Mid-course burn | PIA25137, DSN dish DSS-53 at night (NASA/JPL-Caltech) | PIA23214 Goldstone; KSC-20200730-PH-FMX01_0036 Mars 2020 liftoff (NASA/Frank Michaux) |
| 4 Halfway | GSFC_20171208_Archive_e002035, the Sun (NASA/SDO) | PIA21260 Earth and Moon from Mars (HiRISE; low resolution) |
| 5 Three quarters | PIA19400, Curiosity's blue sunset (MSSS/Texas A&M: needs a check) | PIA23202 InSight sunset (NASA/JPL-Caltech, dark); PIA07997 Spirit sunset (needs a check) |
| 6 Phobos in view | PIA10368, HiRISE Phobos in colour | PIA17270 and PIA00997 (NASA only, but poor) |
| Landing | PIA24428, Perseverance lowered by the sky crane (NASA/JPL-Caltech) | PIA24430 first colour look; PIA00407 Viking globe; PIA22207 Curiosity selfie (needs a check) |

## Asking MSSS (for PIA19400)
MSSS publishes no image-use policy and lists no email. Ask through the "Request Info" form at msss.com/request-info, topic "Image/Data Use Rights". Nav sends it, with this draft text:

> Hello, I make OneSmallClick, a free browser game where players fly a probe together from Earth to Mars. At each milestone, players get a small postcard with a real space photo. I'd like to use PIA19400, "Sunset in Mars' Gale Crater" (Curiosity Mastcam, sol 956), on one of them. It would show at about 300 × 185 pixels with the credit "NASA/JPL-Caltech/MSSS/Texas A&M Univ." next to it, and nothing to suggest that NASA or MSSS endorse the game. The game is free to play but will carry ads, so I wanted to ask before using it. Would that be all right? Thank you.

## Asking the Dawn camera team (MPS/DLR)
Nav: use the Dawn photos now with their full credit, and ask anyway (prompt 97). The Framing Camera was built by the Max Planck Institute for Solar System Research (MPS) with DLR. Send it to the MPS press office; their address is on mps.mpg.de, under Contact or Press. Draft:

> **Subject:** Using Dawn Framing Camera images in a free browser game
>
> Hello, I make OneSmallClick, a free browser game where players fly a probe together from Earth to Mars and on to the asteroid belt. At each milestone, players get a small postcard with a real space photo. On the Ceres and Vesta legs I'm using these Dawn Framing Camera images from NASA's Photojournal: PIA20919 (Dawn at Ceres, illustration), PIA14778 (a full-frame view of Vesta), PIA19172 (Ceres sharper than ever), PIA21079 (Ceres in colour), PIA14117 (Dawn's first glimpse of Vesta) and PIA14894 (the surface of Vesta). Each shows at about 300 × 185 pixels with the full credit "NASA/JPL-Caltech/UCLA/MPS/DLR/IDA" on the image and a link to its NASA page, and nothing suggests that MPS, DLR or NASA endorse the game. The game is free to play but will carry ads, so I wanted to check that this is all right with you. Thank you.

## Picked (prompt 97)
- **Mars:** as08-14-2383, GSFC_20171208_Archive_e000422, PIA23214, GSFC_20171208_Archive_e002035, PIA23202 (until MSSS answers about PIA19400), PIA10368; landing PIA24430.
- **Ceres:** PIA00407, PIA18922, PIA20919, PIA14778, PIA19172; landing PIA21079.
- **Vesta:** PIA11826, PIA15605 (NASA/University of Tennessee; no copyright marked; used with credit), PIA18922, PIA14117; landing PIA14894.

## Ceres and Vesta (candidates, prompt 96)
Only NASA's Dawn has been to Ceres and Vesta, so the close-ups are Dawn Framing Camera images, credited NASA/JPL-Caltech/UCLA/MPS/DLR/IDA. Their captions mark no copyright. NASA's policy says its material may be reproduced "subject to any such copyright indications", but JPL says partner-owned images can carry commercial limits. Decide whether to use them with the full credit or to ask MPS/DLR first.

| Postcard | Pick | Alternatives |
|---|---|---|
| Ceres 1 A million km from Mars | PIA00407 Viking globe (free) | Hubble Mars GSFC_20171208_Archive_e000333 (needs a check) |
| Ceres 2 and Vesta 3, 2 AU (same text) | PIA18922 Dawn's blue glow, illustration (free) | KSC-07PD-2590 Dawn's launch (free) |
| Ceres 3 Halfway | PIA20919 Dawn at Ceres, illustration (Dawn credit) | KSC-07PD-2590 (free) |
| Ceres 4 Crossing Vesta's orbit | PIA14778 Vesta full frame (Dawn) | PIA15678 |
| Ceres 5 Ceres in sight | PIA19172 Ceres sharper than ever (Dawn, Jan 2015) | PIA19173 (a dot) |
| Ceres landing | PIA21079 Ceres in colour (Dawn) | PIA19889 Occator's bright spots |
| Vesta 1 Deimos | PIA11826 HiRISE Deimos (free) | none |
| Vesta 2 Halfway, Vesta formed early | PIA14284 possible piece of Vesta (free) | PIA15605 meteorites from Vesta (needs a check) |
| Vesta 4 Vesta in sight | PIA14117 Dawn's first glimpse (a dot; Dawn) | none |
| Vesta landing | PIA15678 full view of Vesta (Dawn) | PIA14894 |
