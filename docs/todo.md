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
- [x] **The retune** (prompts 27-28): deployed from c132a88 with migration 0006, approved by Nav 19 Nov.
- [x] **A Google OAuth client** (Nav, 19 Nov): made, with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Cloudflare dashboard.
- [x] **Deploy 8a**: migration 0007 applied and 02849c8 deployed 19 Nov (Claude ran both at Nav's request).
- [x] **The 8a checks** (Nav, 19 Nov: all fine, approved): Google on phone and laptop (one account, merged), once-per-account ping, sign out, email says "opens soon", read /privacy.

### 19 Nov evening (mostly done)
- [ ] **The 8a checks** (above).
- [x] **Flight view phase** (docs/plan.md): deployed by Nav with migration 0008; checks passed (prompt 33). New colours approved.
- [ ] **Flight view follow-up** (prompts 33–35): deployed 2026-11-20 (prompt 36). It covers 1f safe mode using the flight view, the idle chip in the design file, the click bar counting all-time clicks, and "Back to the mission" near the top of the account page. Nav: check it live. Also still to confirm: the counts survive a reload on live.
- [ ] **Friends testing (prompt 34):** if the Google OAuth consent screen's publishing status is "Testing", only listed test users can sign in. Nav adds them or publishes the app. Email sign-in stays off until the domain is set up.
- [ ] **After the flight view is approved:** delete `src/components/JourneyTrack.tsx` and `JourneyTrack.css`.
- [ ] **8b planning**, if there's time.

### Before 8b (badges)
- [x] **Signal Keeper I–IV thresholds and what "Night Shift" means**: decided in prompt 38 (3 / 7 / 21 / 30 days; taps between 02:00 and 04:59 local time).
- [ ] **Countries board: signed-in only, later** (prompt 38). It counts everyone (guests by device country) for now.

### Make with PixelLab (once 10 generations are banked, or after the PixelLab upgrade)
- [ ] **Profile badge sprites**, 32×32, matching the signal badge's round medal style:
  - First Ping
  - Night Shift
  - Voter ×30
  - Halfway Crew
  - Mission Patch
  - Signal Keeper I, II, III, IV (ping streaks; one design that gets grander at each level)
  - Steady Finger, Iron Thumb, Ten Thousand Club (click badges: 1,500 / 5,000 / 10,000 clicks; added 19 Nov)
  - Crew Recruiter I, II, III (recruit badges: 1 / 5 / 25 recruits; added 20 Nov with phase S)
  - Cheapest route: one `create_image_pro` call at 32×32 costs 10 generations and returns 64 candidates. Give it the signal badge as the style reference, pick the best one for each badge, then tidy them in the free workbench. Back up the masters to Drive (OneSmallClick › Sprites).

## Payday: domain, Email Service and Workers Paid (moved here 20 Nov)
Email sign-in and 8d (crew emails) can't fully work until all three setup steps are done, so both wait for payday. Everything else carries on meanwhile.

### 1. Setup (Nav, on payday)
- [ ] **Buy onesmallclick.io and add it to Cloudflare** (.com is taken and .co.uk reads as UK-only, so .io it is).
- [ ] **Turn on Email Service for onesmallclick.io** (onboard the domain; its DNS records are added in Cloudflare).
- [ ] **Switch on Workers Paid** ($5/month). Email Service needs it, and so does launch traffic.

### 2. Email sign-in goes live (Claude Code, after step 1)
- [ ] Add the `send_email` binding and `EMAIL_FROM` (see wrangler.jsonc), deploy, and test an email link on Nav's phone.
- [ ] **privacy@onesmallclick.io**: set up where it forwards (Cloudflare Email Routing). Then switch the privacy, terms and contact pages from naveessharma@gmail.com to it (`CONTACT_EMAIL` in scripts/build-pages.mjs; prompt 54).

### 3. 8d: Crew emails (added 20 Nov; after step 1, before launch)
- [ ] **Set up the crew sender** (e.g. `crew@onesmallclick.io`), separate from the sign-in sender.
- [ ] **Approve the decisions** in docs/plan.md (22–25): sender, top 10 named, existing accounts asked once.
- [ ] **Build 8d** (docs/plan.md): the opt-in box and toggle, one-click unsubscribe, the halfway and arrival emails, batched sending, /admin previews and test sends.
- [ ] **Check the opt-in and email wording** against UK rules (PECR and GDPR) before launch. Claude isn't a lawyer.
- [ ] **Privacy page:** add crew emails and how to stop them (with 8d).

## Phase S: Sharing and invites (added 20 Nov; after 9a, before E1)

**Start here (new chat, 22 Nov).** Phase 9a is live and checked; a full backup was taken (git tag `pre-S`, live D1 export `Documents\onesmallclick-backups\d1-onesmallclick-2026-11-22-pre-S.sql`). Claude proposed this approach in prompt 60; Nav hasn't answered yet:
1. Split S into **S1** (one share kit everywhere, personal crew links `/c/<code>` with the invite banner, link previews with pixel images made by script from the existing sprites, the share moments, the Wordle-style result line, share counts) and **S2** (recruits, recruiter badges, "your recruits have pushed X km", the K-factor panel in /admin, the privacy line). Recommended: yes.
2. Decision 26, what counts as a recruit: a new device through your link that makes 50 credited taps or a Ping; never your own devices; at most 10 a day per recruiter. Recommended: as written.
3. Decision 27, recruiter badges: Crew Recruiter I / II / III at 1, 5 and 25. Recommended: as written.
4. Decision 28, share buttons: the phone's share sheet first, then WhatsApp, X, Facebook, Reddit, Telegram and Copy link; no share SDKs. Recommended: as written.
5. Preview images (1200×630, about 20) composed by a script from the existing sprites and committed to the project. Recommended: yes.
6. Links built from the site's own address, so they switch to onesmallclick.io when the domain is connected. Recommended: yes.
7. The 12px labels (pushed, not live): deploy now or with S1.
Next free migration number: 0012.
- [ ] **Approve decisions 26–28** in docs/plan.md: what counts as a recruit, the recruiter badges, and which share buttons.
- [ ] **Build phase S** (docs/plan.md): the share kit, crew links, link previews, share moments, the invite landing, recruits and the K-factor panel in /admin.
- [ ] **Preview images** (1200×630) for each moment, milestone and destination. Claude Code composes them from the existing sprites; PixelLab only if a moment needs new art.
- [ ] **After the domain is live:** check crew-link previews in the Facebook and X link debuggers.
- [ ] **Privacy page:** a line on crew links and recruit counts.

## Expansion: the Grand Tour (planned 19 Nov 2026)

The idea: a visible campaign beyond Mars, so players always have a "what's next".
- **A star-chart map** of the whole route: Mars, the asteroid belt, Jupiter's moons, Saturn, the ice giants, the Kuiper belt, the heliopause, then an endless interstellar leg.
- **A two-way crew vote** at each stop.
- **A new probe per mission**: a new PixelLab sprite and new upgrade names, with the same systems and numbers.
- **About 30 days per leg**, using the self-balancing thrust.
- **Collective rewards for reaching each planet:**
  - arrival medals (Gold / Silver / Bronze by arrival day);
  - planet tech, a small permanent crew-wide perk that never touches trip speed;
  - a passport stamp and a cosmetic for everyone who helped that leg;
  - a one-hour "landing burn" finale.
- **Fun facts:** a daily "Destination file" fact about where we're heading, which is shareable, shown on the map, and collected on a page per destination.

Agreed route (19 Nov): Earth → Mars → Ceres or Vesta → Jupiter → Europa or Ganymede → Saturn → Titan or Enceladus → Uranus → Miranda or Titania → Neptune → Pluto or Arrokoth → the heliopause → interstellar.

Agreed rules (19 Nov):
- Medals: Gold by day 25, Silver by day 30, Bronze after that. The six medal colours are approved (Art kit).
- Planet tech: one perk per stop, with Gold/Silver/Bronze strengths.
- Passport stamps in the medal's colour for legs you helped with.
- Cosmetic unlocks: skies, THRUST trails and probe paint.
- Landing burn: 2,000,000 km in one hour, never a punishment.

### Design handoff (done 19 Nov)
- [x] **Copy the updated design file into design/** (4569032, 19 Nov). It adds 1m Campaign map, 1n New probe reveal and 1o Landing burn, and updates 1a/1b, 1j, 1k and the Art kit. Light and dark are done across every screen.
- [x] **Add the five new PixelLab sprites to design/sprites/stills/** (Europa Lander, Ganymede Orbiter, Jupiter, Saturn, Europa), with rows in design/sprites/README.md (19 Nov).
- [ ] **Back up the five new sprites to Drive** (Nav; OneSmallClick › Sprites).
- [x] **Add the medal colours to docs/tokens.css** as an agreed exception (`--medal-*`, 19 Nov; CLAUDE.md updated). They go into src/styles/theme.css with the first phase that uses them.
- [x] **Check the design's fun facts against sources** (E0, 2026-11-20): 13 true, 8 need rewording, 2 wrong (Jupiter's 1,300 Earths, Titan's lakes), 1 unsupported (Miranda's cliff), and Olympus Mons is wrong by NASA's figures. See docs/expansion.md, section 10.
- [x] **The live Olympus Mons vote fact** (reworded 2026-11-20, prompt 44; live after the next deploy) (content/vote-options.json, approved 19 Nov) says 22 km and 2.5× Everest, but its NASA source now says more than 40 km from base to summit. Nav: approve the reworded fact (docs/expansion.md, section 10).

### E0: plan the campaign (after 8b, before 8c)
- [x] **Run the expansion planning prompt** (prompt 43, 2026-11-20): docs/expansion.md, content/campaign.json and content/facts/mars.json drafted; 8c and E1–E5 added to docs/plan.md. Was: (plan only, from Nav's build hub). It plans the new screens into build phases, writes docs/expansion.md, drafts content/campaign.json and content/facts/mars.json (30 facts with sources), switches **8c's next-destination vote to a two-way branch (Mars → Ceres or Vesta) read from content/campaign.json** (instead of Europa / Psyche / a Venus flyby, which moves into the daily vote pool as a detour), and adds the expansion phases to docs/plan.md.
- [x] **Nav approves** (the 14 decisions in docs/expansion.md, section 11; all as recommended, 2026-11-20, prompt 44):
  - each stop's planet tech, with a sim of the stacked totals;
  - what carries between missions (suggested: everything, with upgrades renamed rather than reset);
  - who counts as "helped";
  - whether the landing burn suits a small crew;
  - the 30 Mars facts;
  - whether medals and the facts card come before launch.

### E1: design (done 19 Nov)
- [x] The campaign map (1m), the new probe reveal (1n), the landing burn (1o), the arrival rewards and two-branch vote (1k), the passport and cosmetics (1j), the medal pace line and Destination file card (1a/1b), and the medal colours on the Art kit.

### E2: PixelLab art for the expansion
The design (E1) has settled the probes and map art, so the list below replaces the earlier draft. The current probe is the style reference. Made 19 Nov: Europa Lander, Ganymede Orbiter, Jupiter, Saturn and Europa.
- [ ] **First needed:** the OSC-2 pair (Ceres Hopper and Vesta Surveyor), for the first branch vote about 30 days after launch. Make them, and the profile badges, once 10 generations are banked.

### Art the design draws in code or leaves as placeholders (added 19 Nov)
Cheapest route: `create_1_direction_object` with `item_descriptions` makes a whole set in one call for 10 generations (64 items at 42px or smaller, 16 items at 43–64px). Back up the masters to Drive (OneSmallClick › Sprites).

- [ ] **Probes, 64×64 (placeholder boxes in the design), one 16-item call:**
  - OSC-2 Ceres Hopper (also replaces the OSC-1 stand-in on the map's probe line)
  - OSC-2 Vesta Surveyor
  - OSC-4 Titan Glider
  - OSC-4 Plume Diver
  - OSC-5 Cliff Climber
  - OSC-5 Titania Lander
  - OSC-6 Heart Lander
  - OSC-6 Snowman Flyby
  - OSC-7 Long Voyager
- [ ] **Gold foil probe paint**, 64×40, OSC-1 repainted (placeholder box; cosmetic unlocked by Gold at Mars).
- [ ] **Campaign-map moons and planets (drawn in code), one 64-item call at 42px, scale up the bigger ones:**
  - Ceres 38×38
  - Vesta 34×29
  - Ganymede 54×54
  - Titan 50×50
  - Enceladus 34×34
  - Uranus 54×54
  - Miranda 30×30
  - Titania 36×36
  - Neptune 54×54
  - Pluto 38×38
  - Arrokoth 46×28
- [ ] **Small planet icons, 16×16 (drawn in code), for passport stamps and the Destination file card:**
  - Mars (or reuse `mars-32.png`, which is the design's 2× size)
  - Ceres
  - Jupiter
  - Saturn
  - Uranus
  - Neptune
  - heliopause
  - a "branch not chosen yet" icon
- [ ] **Medals, 10×15: Gold, Silver, Bronze** (drawn in code). Colours approved; in use on the game home's pace line since E4b part 1 (`src/game/rewardArt.ts`). Tidy by hand in the free workbench, then swap them in there.
- [ ] **Map extras (drawn in code):**
  - heliopause ring 58×58
  - probe-position ring 36×36 (shown at 2×)
  - asteroid-belt strip 256×26
  - Kuiper-belt strip 256×26
- [ ] **Europa Lander thruster flame**, 3 frames of 10×12 (drawn in code), for the New probe reveal (1n).
- [ ] **THRUST trail particles**, 32×8: blue sparks (default) and red dust (drawn in code).
- [ ] **Cosmetic skies:** Mars-dust and Salt-glow versions of `nebula-tile.png` (512×512). The design only shows them as colour gradients.
- [ ] **Flight view art (drawn in code for now, added 19 Nov evening; all in `src/game/flightArt.ts`, swap the sprites in there):**
  - horizontal exhaust flame, 3 frames of 12×6
  - comet, 18×5
  - speed lines
  - Mars and Earth at growing sizes (a few fixed whole-number sizes)
  - the Sun, 20×20
  - small Vesta, 16×14
- [ ] **Stamp icons for the branch moons, 16×16** (added in E0; the list above has the planets only): Vesta, Europa, Ganymede, Titan, Enceladus, Miranda, Titania, Pluto, Arrokoth.
- [ ] **Thruster sheets for every new probe** (added in E0): 5 frames each, like `thruster-sheet.png`, for the flight view.
- [ ] **Gold postcard frame** for a successful landing burn (1o), and the postcard art for each stop (added in E0).
- [ ] **The map share card**, 1080×1080 (added in E0).
- [ ] **Cosmetic art for each stop** (added in E0; the list is in docs/expansion.md, section 9): skies as nebula tiles, THRUST trails as 32×8 particle strips, paints as 64×40 repaints of each probe.
- [ ] **UI icons, 9×9: map, flag, share, close** (drawn in code). Export to SVG like the other ten in `design/icons/`; not PixelLab.
- [ ] **Whole-number scaling:** the campaign map and the desktop arrival (1k) show `mars.png` at half size. Use the 64px Mars instead.

### Before each new leg (monthly, about a week before arrival)
- [ ] Both branches' probes, thruster sheets and map icons.
- [ ] Upgrade names and descriptions for both probes.
- [ ] Planet tech, medal days and cosmetics for both branches.
- [ ] 4–6 milestones per branch, with checked facts.
- [ ] 30 checked fun facts per branch.
- [ ] A daily vote pool per branch.
- [ ] Passport stamps and cosmetic sprites.
- [ ] Postcard photos with licences and credits.
- [ ] A social post: "Next stop: the crew decides".

## Before launch
- [x] **Approve the six milestones** (`content/milestones.json`): names, distances, the moment's fact and sub-line, the fact pages' text, and the sources. Approved 19 Nov.
- [x] **Approve the vote pool** (`content/vote-options.json`): wording, effects, and each detour's fact against its source link. Approved 19 Nov.

## At the end
- [ ] **Privacy page (phase 9) must mention Cloudflare Turnstile**, which runs on Ping, and the device cookie (`osc_device`, HttpOnly, 400 days).
- [x] **Signal Keeper badge names (phase 8).** Done in 8b: the signal card shows your real level and the days to the next.
- [ ] **Add onesmallclick.io to the Turnstile widget's hostnames** when the domain is connected, or Ping will fail there.
- [ ] **Crew emails before launch:** the opt-in box must be live before real players sign up, so nobody has to be asked later (8d).
- [ ] **Postcard photos.** Pick a real space photo for each of the six milestones, check each licence (prefer public-domain NASA/JPL) and note the credit line. Decide whether to keep them as photos or convert them to pixel art (open question in the brief).
