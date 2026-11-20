# The Grand Tour: expansion plan (E0)

Draft for Nav's approval, written 2026-11-20 (prompt 43). It plans the campaign beyond Mars as build phases (E1–E5 in docs/plan.md). It's a plan only: no app code, and no game rule changes until you approve them.

The drafts that go with it:
- `content/campaign.json`: stops, branches, distances, probes, upgrade names, planet tech and cosmetics.
- `content/facts/mars.json`: 30 checked Mars facts, the template for every destination.

Agreed on 19 November (your list in prompt 43) and already in the design (1m, 1n, 1o, and the updates to 1a/1b, 1j and 1k):
- a campaign map with a two-way crew vote at each stop;
- a new probe per mission, with renamed upgrades;
- about 30 days per leg;
- medals (Gold by day 25, Silver by day 30);
- planet tech, passport stamps and cosmetics;
- the landing burn;
- 30 fun facts per destination;
- nothing ever linked to ads.

This document fills in how each of these works, and flags where the numbers or the science push back.

---

## 1. The campaign as a graph

```
Earth ─► Mars ─┬─► Ceres ─┐            ┌─► Europa ───┐            ┌─► Titan ─────┐
               └─► Vesta ─┴─► Jupiter ─┴─► Ganymede ─┴─► Saturn ─┴─► Enceladus ─┴─► Uranus ─┐
                                                                                            │
   ┌────────────────────────────────────────────────────────────────────────────────────────┘
   └─┬─► Miranda ─┐             ┌─► Pluto ────┐
     └─► Titania ─┴─► Neptune ─┴─► Arrokoth ─┴─► Heliopause ─► Interstellar (endless)
```

- **The vote happens at each planet**, on arrival: Mars (Ceres or Vesta), Jupiter (Europa or Ganymede), Saturn (Titan or Enceladus), Uranus (Miranda or Titania) and Neptune (Pluto or Arrokoth).
- **Both branches lead on to the same next stop.** So the paths meet up again straight away, and the map never splits for good.
- **A mission is a probe.** Following the design (1m and 1n), each probe flies two legs: its branch, then the next planet. For example, OSC-2 flies Mars → Ceres → Jupiter.

| Mission | Legs | Probe (by branch) |
|---|---|---|
| 1 | Earth → Mars | OSC-1 Pathfinder |
| 2 | Mars → Ceres or Vesta → Jupiter | OSC-2 Ceres Hopper or Vesta Surveyor |
| 3 | Jupiter → Europa or Ganymede → Saturn | OSC-3 Europa Lander or Ganymede Orbiter |
| 4 | Saturn → Titan or Enceladus → Uranus | OSC-4 Titan Glider or Plume Diver |
| 5 | Uranus → Miranda or Titania → Neptune | OSC-5 Cliff Climber or Titania Lander |
| 6 | Neptune → Pluto or Arrokoth | OSC-6 Heart Lander or Snowman Flyby |
| 7 | → Heliopause → interstellar | OSC-7 Long Voyager |

That's 11 legs to the heliopause, then the endless one. At about 30 days a leg, the tour takes about 11 months.

**Science flags:**
1. **The distances use two different methods.** Earth → Mars is the game's 480 million km, which is the probe's travel path. Every other leg in the design is the gap between average distances from the Sun. That gap is far shorter than a real flight path (Earth to Mars is only about 78 million km by that measure), and real distances also change as the planets move. I've kept 480M km for Mars (it's live and approved) and used the gap for the rest, labelled as approximate. The alternative is to scale every leg up to path lengths, which have no single checkable source.
2. **The moon legs are tiny.** Jupiter → Europa is 671,100 km, Uranus → Miranda 129,900 km, a few hundred times shorter than the planet legs. With 30 days each, the probe's shown speed on a moon leg would be a crawl. See section 2.
3. **The design gets two distances wrong.** It says Mars → Ceres is about 265M km and Mars → Vesta about 200M km. By the sources, they're about 186M km and 125M km (below). The other planet legs in the design match the sources.
4. **The heliopause has no checked distance yet.** None of the NASA pages I read gives it. The design's "~11B km from the Kuiper belt" is unchecked and marked TODO. NASA's own pages also disagree on the date Voyager 2 crossed it (5 November 2018 in JPL's release, 25 November 2018 on the mission page).
5. **Solar sails fade beyond Jupiter, where sunlight is weak.** The probes past the asteroid belt rename the "sail" upgrade to a "power core" (flavour only; the numbers don't change).

## 2. Real distances, and the 30-day target

Each distance is the gap between average distances from the Sun, or a moon's distance from its planet. The sources are NASA's planetary and satellite fact sheets (NSSDC), JPL's Small-Body Database for Ceres, Vesta and Arrokoth, and JPL's value of the astronomical unit (links in `content/campaign.json`, `distanceSources`).

| Leg | Distance | Design said |
|---|---|---|
| Earth → Mars | 480,000,000 km (game route) | 480M |
| Mars → Ceres | about 186,400,000 km | ~265M (wrong) |
| Mars → Vesta | about 125,100,000 km | ~200M (wrong) |
| Ceres → Jupiter | about 364,100,000 km | ~365M |
| Vesta → Jupiter | about 425,400,000 km | (not given) |
| Jupiter → Europa | 671,100 km | 671,000 |
| Jupiter → Ganymede | 1,070,400 km | 1.07M |
| Europa or Ganymede → Saturn | about 653,500,000 km | ~650M |
| Saturn → Titan | 1,221,870 km | 1.22M |
| Saturn → Enceladus | 238,020 km | 238,000 |
| Titan or Enceladus → Uranus | about 1,435,000,000 km | ~1.4B |
| Uranus → Miranda | 129,900 km | 130,000 |
| Uranus → Titania | 436,300 km | 436,000 |
| Miranda or Titania → Neptune | about 1,648,000,000 km | ~1.6B |
| Neptune → Pluto | about 1,391,400,000 km | ~1.4B |
| Neptune → Arrokoth | about 2,082,300,000 km | ~2.1B |
| → Heliopause | TODO | ~11B (unchecked) |

**How 30 days works on any length.** The self-balancing thrust (`shared/balance.ts`) already separates two things:
- the km you push, which pays your credits and counts on the leaderboards;
- how far that push moves the shared probe (`crewFactor`).

For each leg, coasting and the crew's top speed scale with the leg's length (leg km ÷ 480M). The probe then covers any leg in the same time for the same crowd. Your km per tap, your credits, the leaderboards and the upgrades don't change at all. Only the probe's progress per km does.

**The catch is the moon legs.** Scaled down 400–3,700 times, coasting on Jupiter → Europa would be 0.03 km/s. Two options:
- **A (recommended): keep 30 days for every leg, as agreed.** On moon legs, the flight view and arrival estimate lead with "% of the way" and km to go, and the speed reads in km/h. The rewards timings (25/30 days) stay the same everywhere.
- **B: make moon legs shorter**, for example about 10 days, since they're tiny. It's more variety, but medals, planet tech and stamps would then come twice as fast on alternate legs. It would also need different medal days.

## 3. What players carry from mission to mission

Your starting view: credits, upgrades, patches, badges and streaks all carry over, and upgrades are renamed rather than reset. I agree, and so does the design (1n: "Your upgrades have new names"). **But the balance needs one change to keep legs near 30 days.**

`npm run sim` already shows the effect. The same 35 typical players, five missions in a row, take 29.8, 24.6, 23.7, 23.1 and 22.9 days. Over the whole tour (a sim of 11 legs, run on 2026-11-20 with the real `shared/` rules):

| Crew | Same balance every leg | Recalibrated each leg |
|---|---|---|
| 35 typical players | 30.0 24.6 23.7 23.1 23.0 22.7 22.5 22.3 22.0 22.1 22.0 | 30.0 24.6 27.1 27.4 27.8 27.9 27.9 28.1 27.8 28.0 28.3 |
| 35, plus 20% new players each leg | 28.0 22.1 20.5 19.4 18.6 18.1 17.6 17.2 16.9 16.6 16.4 | 28.0 22.1 23.5 23.7 23.6 23.6 23.5 23.4 23.4 23.3 23.3 |
| 10 typical players | 54.3 45.8 44.0 43.0 41.7 41.2 41.0 41.3 40.5 40.8 40.5 | 54.3 45.8 50.7 51.6 51.6 51.8 52.1 52.5 52.2 52.7 52.3 |
| 200 typical players | 19.1 17.0 16.7 16.7 16.7 16.5 16.5 16.4 16.4 16.4 16.4 | 19.1 17.0 17.6 17.8 17.9 17.8 17.9 17.8 17.9 17.9 17.9 |

- **Without a change**, carried upgrades make every later leg about 22 days. Gold (by day 25) would become automatic for a steady crew, and the medals would stop meaning anything.
- **Recalibrating**: at the start of each leg, the crew balance (`CREW_HALF_KM_S`) scales with how hard the crew pushed on the previous leg. A steady crew then settles at about 28 days (Silver). A growing crew gets Gold, and a shrinking one Bronze. Your upgrades still matter to you (credits, leaderboards); they just stop making the shared trip shorter forever.
- **This is a game rule change** to `shared/balance.ts` and needs your OK (built in E2).

## 4. What the map shows

I agree with your starting view, with small additions:
- **The whole chart from day one.** Future stops are dimmed and show their name, distance and planet tech.
- **The next two branches are teased:** both options, with probe, distance, planet tech and one fact, from the moment the crew sets off for the planet before them.
- **Branches not taken are marked "not taken"** (the design's "skip" style), so they can return in a later season.
- **Visited stops show their medal and arrival date**, and the stamp if you helped.
- **The probe's position on the current leg is live.** It's the same progress as the game home.
- **Today's fact** for the current destination, and one fact for every other stop.

## 5. The endless interstellar leg

After the heliopause, OSC-7 keeps going with no arrival. What keeps it interesting:
- **Distance records as milestones**, for example passing 100 au, passing Voyager 2 and Voyager 1, and one light-day from the Sun. These need checked figures: the Voyagers' distances change daily, so a sourced snapshot date is needed (TODO).
- **Monthly country trophies** (from the brief's later ideas) and a monthly "deep space crew" leaderboard.
- **No medals or planet tech**, but stamps for each record the crew passes.

**Recommendation: reaching the heliopause ends Season 1.** Credits roll for the whole tour (8c's credits, tour-sized). Interstellar then runs as the open "between seasons" leg. Season 2 can be a new route, or a return trip through the branches not taken.

## 6. Per-probe upgrade feel

The five upgrades keep their effects and prices (`shared/upgrades.ts`); only the names and flavour lines change. The full list is in `content/campaign.json` (`probes`). For example:

| Probe | cold | ion | sail | hands | chant |
|---|---|---|---|---|---|
| OSC-1 Pathfinder | Cold-gas jets | Ion drive | Solar sail | Steady hands | Crew chant |
| OSC-2 Ceres Hopper | Hop jets | Brine-cooled ion drive | Salt-shine sail | Steady hop hands | Hop-hop chant |
| OSC-2 Vesta Surveyor | Survey thrusters | Mapping ion drive | Basalt-shine sail | Steady survey hands | Rheasilvia chant |
| OSC-3 Europa Lander (design) | Ice-skate thrusters | Radiation-proof ion drive | Plutonium power core | Steady drill hands | Ocean song |
| OSC-3 Ganymede Orbiter | Aurora jets | Magnet-guided ion drive | Jupiter-shine core | Steady orbiter hands | Biggest-moon chant |
| OSC-4 Titan Glider | Haze gliders | Methane-proof ion drive | Orange-sky wing | Steady pilot hands | Dune song |
| OSC-4 Plume Diver | Plume puffers | Geyser-proof ion drive | Ring-light core | Steady diver hands | Tiger-stripe chant |
| OSC-5 Cliff Climber | Rope-line jets | Clifftop ion drive | Long-night core | Steady climber hands | Echo chant |
| OSC-5 Titania Lander | Fairy jets | Moonlight ion drive | Queen's core | Steady lander hands | Midsummer chant |
| OSC-6 Heart Lander | Nitrogen puffers | Cold-heart ion drive | Deep-dark core | Steady heart hands | Heartbeat chant |
| OSC-6 Snowman Flyby | Snowball thrusters | Kuiper ion drive | Faint-Sun core | Steady flyby hands | Snowman song |
| OSC-7 Long Voyager | Attitude jets | Long-haul ion drive | Long-life power core | Steady voyager hands | Golden-record chant |

**Signature perk: I recommend none.** Any number change per probe would make one branch better than the other, and the branch vote should be about curiosity, not maths. If you want a signature, make it cosmetic, for example each probe's own default THRUST trail colour. Nothing here changes balance.

## 7. What each new leg needs before it can launch

This applies to both branches, about a week before arrival (it matches docs/todo.md, "Before each new leg"):
- **Probe art:** sprite (64×64 like the Europa Lander, or 64×40 like OSC-1), thruster sheet (5 frames, like `thruster-sheet.png`), map icon, and a 16×16 stamp icon.
- **Upgrade names and lines** (above).
- **4–6 milestones** with checked facts and a fact page each (like `content/milestones.json`), at real km on that leg.
- **A daily vote pool** for the leg (like `content/vote-options.json`), with checked facts on the detours.
- **30 fun facts** (`content/facts/<stop>.json`), each with a source.
- **Postcard photos** with licences and credits.
- **The next two branches** for the map teaser.
- **A social post** ("Next stop: the crew decides").

E3 builds a checker that refuses a leg with anything missing.

## 8. Social sharing

Everything is text or a self-made image, with no tracking and no ad links:
- **The map card:** a 1080×1080 PNG made in the browser, like the design's fact share card. The star chart is cropped around the probe, with "The crew chose Europa" and the date.
- **Branch result text:** "OneSmallClick · The crew chose Europa (61% of 12,481 votes) · Next stop: Saturn · onesmallclick.io".
- **Arrival text:** "OneSmallClick · Mars reached on day 24 · Gold · Planet tech: Martian dust filters · I helped" (the last part only if you did).
- **The daily fact:** the design's share card (1a), "Save image" and "Copy link", linking to the destination page.

## 9. The rewards

### Medals, and the self-balancing maths
- A leg's day count runs from the leg's start to arrival, in real time. Safe-mode setbacks and idle pauses count, so a quiet crew earns Bronze honestly.
- Gold if day ≤ 25, Silver if ≤ 30, Bronze after that.
- **The Mars leg** has no previous leg to calibrate from, so its medal depends on the launch crowd (`npm run sim`):
  - 35 typical players take 29.7 days (Silver);
  - 50 take 26.1 (Silver);
  - about 60 or more get Gold (60 take 24.7 days; 200 take 19.1);
  - about 33 or fewer get Bronze (33 take 30.5; 25 take 34.4).
- **From leg 2**, recalibration (section 3) makes the medal reward crew growth and effort, not just time served.
- **The pace line on the game home** (1a: "Gold if we arrive by 14 Feb · on pace for Silver · 2.4 days to Gold") uses the arrival estimate the game already shows.

### Planet tech: smaller, credits-only, never trip speed
The design's perks are mostly tap power and auto-thrust. Those raise the km everyone pushes, so they'd speed the probe up, which breaks "never trip speed". The design's Ganymede perk (safe-mode setback halved) changes trip speed directly.

**I've redrafted every perk to act on credits or prices only, and smaller.** The km you push, and the probe, never change.

| Stop | Perk | Gold | Silver | Bronze |
|---|---|---|---|---|
| Mars | Martian dust filters: tap credits | +5% | +3% | +2% |
| Ceres | Salt-brine batteries: offline cap | +40 min | +30 min | +20 min |
| Vesta | Vesta ore smelter: upgrade prices | 5% cheaper | 3% cheaper | 2% cheaper |
| Jupiter | Gravity slingshot: auto-thrust credits | +5% | +3% | +2% |
| Europa | Europa ice drill: tap credits | +5% | +3% | +2% |
| Ganymede | Magnetic shield: auto-thrust credits keep paying in safe mode | 50% | 35% | 20% |
| Saturn | Ring-dust sails: auto-thrust credits | +5% | +3% | +2% |
| Titan | Methane fuel tanks: offline cap | +40 min | +30 min | +20 min |
| Enceladus | Geyser boost: credits a Ping | +300 | +200 | +100 |
| Uranus | Side-spin gyros: upgrade prices | 4% cheaper | 3% cheaper | 2% cheaper |
| Miranda | Cliff anchors: tap credits | +5% | +3% | +2% |
| Titania | Fairy lights: credits from taps between midnight and 6 am (your local time) | +15% | +10% | +5% |
| Neptune | Storm riders: auto-thrust credits | +5% | +3% | +2% |
| Pluto | Heart nitrogen tanks: offline cap | +40 min | +30 min | +20 min |
| Arrokoth | Snowman scanner: credits a milestone postcard | +600 | +400 | +200 |
| Heliopause | Interstellar wind sail: all credits | +3% | +2% | +1% |

**Stacked totals across the whole tour.** Perks of a kind add up; "all credits" multiplies; one branch per vote.

| Perk | All Gold, strongest branches | All Bronze |
|---|---|---|
| Tap credits | +15% (Mars, Europa, Miranda), ×1.03 = **+18.5%** | +6%, ×1.01 = **+7%** |
| Auto-thrust credits | +15% (Jupiter, Saturn, Neptune), ×1.03 = **+18.5%** | **+7%** |
| Upgrade prices | Vesta 5% and Uranus 4% = **8.8% cheaper** | **4% cheaper** |
| Offline cap (8 hours now) | Ceres, Titan and Pluto: **10 hours** | **9 hours** |
| Per-event credits | +300 a Ping (Enceladus) or +600 a postcard (Arrokoth) | +100 or +200 |

- A typical player ends the tour earning about **+15–20% credits** with all Gold, or about +7% with all Bronze.
- That's small next to one handover (3 patches = +30% tap power and auto-thrust).
- The design's numbers would have stacked to +35% tap power and +42% auto-thrust.
- Upgrade discounts and extra credits do let players buy upgrades sooner, which pushes slightly more km. The per-leg recalibration (section 3) absorbs that, so trip length doesn't drift.
- **These replace text on the design's screens** (1k, 1m: for example "Tap power +10%"). Changing them needs your OK.

### Who counts as "helped"
**At least one credited THRUST tap during that leg**, as the design says (1k: "Tap even once on the way… and you'll get a stamp and an unlock").
- Guests count too: stamps are kept per player, like badges, and merge on sign-in.
- Everyone gets the planet tech, helper or not.

### Cosmetics per stop
Three slots, as in the design (1j): sky, THRUST trail and probe paint. Helpers unlock that stop's item.

| Stop | Unlock |
|---|---|
| Mars | Mars-dust sky and Red dust trail (both in the design) |
| Ceres | Salt-glow sky (design) |
| Vesta | Basalt-grey paint |
| Jupiter | Storm-band sky |
| Europa | Ice-crack paint |
| Ganymede | Aurora trail |
| Saturn | Ring-dust trail |
| Titan | Orange-haze sky |
| Enceladus | Geyser-plume trail |
| Uranus | Side-spin teal paint |
| Miranda | Patchwork paint |
| Titania | Fairy-light trail |
| Neptune | Deep-blue storm sky |
| Pluto | Heart paint |
| Arrokoth | Snowman-red paint |
| Heliopause | Interstellar sky |
| First Gold (anywhere) | Gold foil paint (the design ties it to Gold at Mars) |

### The landing burn
- **It has to count km the crew pushes, not the probe's movement.** The probe's top speed is about 358 km/s with coasting (`shared/balance.ts`), which is at most about 1.3 million km in an hour. So "2,000,000 km in the final hour" can only mean the crew's pushed km: taps (double during the burn, as in 1o) plus connected auto-thrust.
- **How it runs (proposed).**
  - When the arrival is one hour away at today's pace, the burn starts.
  - The landing time is then fixed at the start plus 60 minutes, whatever happens.
  - The crew's pushed km fill the 2,000,000 bar, and the probe lands on time either way.
  - Success gives a gold-framed postcard. A miss gives "Rough landing, but we made it", and the postcard is still yours.
- **Is it reachable with a small crew?** Yes, once players have upgrades:
  - by the end of the Mars leg, a typical player taps about 168 km a tap and has about 4.7 km/s of auto-thrust;
  - so 5 minutes of tapping during the burn pushes about 500,000 km;
  - about **4 regulars** fill the bar, and one brand-new player alone can't (12,000 km in 5 minutes; at most 432,000 km tapping at the cap for the whole hour).
- **Should it scale with people here? Not yet (recommended).** A big crowd will fill it in minutes, which still feels like a celebration. A tiny crew at 3 am can miss, which is never a punishment. Revisit after launch with real numbers. If it needs to scale later: the target becomes 2,000,000 km or 50,000 km per person here, whichever is bigger.

### The data needed
- **Missions** (D1 `missions`): add the stop, the branch chosen, the leg's start, medal, days, the landing burn's km and whether it succeeded.
- **Branch votes:** the existing votes table with a "branch" round per mission, or a small `branch_votes` table. The 8c vote also needs the two options and the result.
- **Helpers and stamps:** `stamps (player_key, mission_id, stop, medal, earned_at)`, written at arrival from the leg's credited taps (`daily_km.taps` per day, plus the probe's own record for the first and last day).
- **Cosmetics:** `cosmetics_owned (player_key, item, earned_at)` and the three in use (columns on progress, or `cosmetics_in_use (player_key, slot, item)`).
- **Planet tech** is crew-wide, worked out from the missions' stops and medals, so no per-player table. The `Probe` applies it to credits, prices and the offline cap.
- **Campaign position:** the `Probe` keeps the current stop and leg length. `content/campaign.json` is the map.
- **Facts:** `content/facts/<stop>.json`, read by the game home card, the map and the destination pages.
- Merging on sign-in moves stamps and cosmetics like badges; deleting the account deletes them.

## 10. Fun facts

- **The Destination file card** (1a/1b) shows today's fact for the current destination: "DESTINATION FILE · MARS · Fact 12 of 30".
  - Fact n = (mission day − 1) mod 30 + 1, so it changes at 00:00 UTC with the vote.
  - "Share fact" makes the design's 1080×1080 card.
- **The map** shows the current destination's fact of the day, and one fact for each other stop.
- **Destination pages** `/destinations/<slug>` are plain HTML built at deploy time (like the milestone pages), with all 30 facts, each with its source. They're linked from the card and the map. They can carry ads like any content page, but no game reward is ever tied to an ad.
- **Every fact needs a source.** `content/facts/mars.json` has 30 Mars facts, each checked on 2026-11-20 against a NASA page, with the supporting quote. None repeats a milestone fact. It's the template for the other 15 stops.

### The design's facts, checked (2026-11-20, NASA pages)

| Stop | Design says | Verdict |
|---|---|---|
| Mars | A day is about 40 minutes longer than Earth's | True: 24.6 h vs 23.9 h |
| Mars | Two small moons, Phobos and Deimos | True |
| Mars | Sunsets look blue | True (NASA, Curiosity's sunset in Gale crater) |
| Mars | Olympus Mons is about 2.5× as tall as Everest | **Wrong by NASA's figures**: NASA says more than 40 km from base to summit, and Everest 8,848 m (about 4.5×). It gives no ratio. |
| Ceres | Only dwarf planet in the inner Solar System | True |
| Ceres | Bright spots in Occator are salt left by salty water | **Reword**: NASA says the bright spots are "deposits of carbonates and other salts", with Occator the brightest area. The pages read don't say salty water. |
| Ceres | Dawn orbited Ceres 2015–2018 | True (March 2015 to November 2018) |
| Vesta | South-pole crater's central peak about 22 km tall | **Reword**: NASA gives 12–16 miles (about 19–26 km) |
| Jupiter | More than 1,300 Earths would fit inside | **Wrong**: NASA says about 1,000 Earths ("if Jupiter was a hollow shell") |
| Jupiter | Great Red Spot is a storm wider than Earth | True |
| Jupiter | Shortest day of any planet, under 10 hours | True (about 9.9 hours) |
| Europa | Ocean holds about twice the water of Earth's oceans | **Reword**: NASA says "may contain twice as much water as Earth's global ocean" |
| Ganymede | Biggest moon, wider than Mercury | True |
| Saturn | Rings hundreds of thousands of km wide, mostly about 10 m thick | **Reword**: "extend up to about 282,000 km from Saturn; the main rings are typically about 10 m thick" |
| Titan | Rivers, lakes and rain, all liquid methane | **Wrong**: methane *and ethane* |
| Enceladus | South-pole geysers spray water ice | **Reword**: "water vapour and ice particles"; the south pole needs another source (TODO) |
| Uranus | Tipped over by about 98° | True (97.77°) |
| Miranda | Verona Rupes, about 20 km, may be the tallest cliff | **Not supported** by NASA's Miranda page (TODO: another source or drop it) |
| Titania | Biggest moon of Uranus, named after the fairy queen | True |
| Neptune | Fastest winds of any planet, over 2,000 km/h | True: "our solar system's windiest world", "more than 2,000 km/h" |
| Pluto | Heart-shaped plain partly frozen nitrogen | True (NASA New Horizons page: "a vast heart-shaped nitrogen glacier") |
| Arrokoth | Most distant object a spacecraft has flown past; a flat snowman | **Reword**: "the most distant object ever explored up close"; snowman-like, larger lobe flattened |
| Heliopause | Where the Sun's wind stops; Voyager 1 crossed it in 2012 | **Reword**: "the edge of the Sun's bubble of energetic particles and magnetic fields"; August 2012 is right |

**Already live:** the daily vote option "Zoom in on Olympus Mons" (`content/vote-options.json`, approved 19 Nov) says "about 22 km high: two and a half times the height of Mount Everest" and cites NASA's Mars facts page. That page (updated 10 July 2026) now says "more than 25 miles (… 40 kilometers) tall from base to summit". The 22 km figure is height above Mars' average surface level, which that page doesn't give. **Recommended fix:** "Olympus Mons on Mars is the biggest volcano in the Solar System: more than 40 km tall from base to summit." It needs your OK, because it changes approved content.

## 11. Decisions still open (with my recommendation)

1. **Recalibrate the crew balance each leg** (section 3). *Recommend yes.* Without it, carried upgrades make Gold automatic from leg 2.
2. **Moon legs:** 30 days with the speed shown in km/h (A), or shorter legs (B). *Recommend A.*
3. **Planet tech:** the smaller, credits-only perks above, replacing the design's numbers. *Recommend yes*; the design's screens need their perk text updated to match.
4. **Ganymede's perk:** the design's "safe-mode setback halved" changes trip speed. *Recommend* "auto-thrust credits keep paying in safe mode" instead.
5. **Titania's night window:** the design says 00:00–06:00 UTC. *Recommend* your local time, like Night Shift.
6. **Who helped:** one credited tap on the leg (the design's rule). *Recommend yes.*
7. **The landing burn:** counts the crew's pushed km (taps double), fixed 2,000,000 km for now, with the landing at a fixed time. *Recommend yes; revisit the target after launch.*
8. **Mars cosmetics:** two unlocks (sky and trail, as in the design), and Gold foil for the crew's first Gold anywhere. *Recommend yes.*
9. **Signature perks per probe:** none, or cosmetic only. *Recommend none.*
10. **Season 1 ends at the heliopause**, with interstellar as the open leg between seasons. *Recommend yes.*
11. **The two wrong design distances** (Ceres, Vesta) and the wrong or loose design facts (section 10): use the sourced versions. *Recommend yes*, and fix the design file's text when E1 is built.
12. **The live Olympus Mons vote fact:** reword to NASA's figure. *Recommend yes.*
13. **Medals, the pace line and the Destination file card before launch?** *Recommend yes:*
    - The Mars leg is the first players see, and both are cheap.
    - The full arrival rewards (planet tech, stamps, cosmetics, the landing burn) must be ready by the first arrival, about 25–30 days after launch, together with 8c's branch vote and the OSC-2 probes.
    - So E4b's first half ships before launch, and the rest within the first 3 weeks.
14. **The 30 Mars facts** (`content/facts/mars.json`): approve, or swap any.

## 12. Timeline against launch

The first leg is the only one that can't slip. Mars arrives about 25–30 days after launch (with the launch crowd unknown). Before that arrival:

| When | What |
|---|---|
| Before launch | 8c (arrival, credits, the Ceres-or-Vesta vote), phase 9, and E4b part 1 (medal pace line, Destination file card, /destinations/mars) |
| By launch + 3 weeks | E4b part 2 (planet tech, stamps, cosmetics, landing burn), E2 (OSC-2 probes art and names, per-leg recalibration), E3 content for Ceres and Vesta (milestones, vote pools, facts), E1 map |
| Monthly after that | E3's checklist for each next pair of branches |

## 13. Asset list check

I checked docs/todo.md's art list against the design (1a/1b, 1j, 1k, 1m, 1n, 1o and the Art kit). Missing, now added to the todo:
- **16×16 stamp icons for the branch moons:** Vesta, Europa, Ganymede, Titan, Enceladus, Miranda, Titania, Pluto, Arrokoth. The list only has the planets and a "not chosen yet" icon.
- **Thruster sheets for each new probe** (5 frames, like OSC-1), for the flight view.
- **A gold postcard frame** for a successful landing burn (1o), and the postcard art per stop.
- **The map share card layout** (1080×1080).
- **Cosmetic art per stop** (section 9):
  - skies as nebula tiles;
  - trails as 32×8 particle strips;
  - paints as 64×40 repaints of each probe.
- **New 9×9 icons** if the destination pages need them (none in the design).
