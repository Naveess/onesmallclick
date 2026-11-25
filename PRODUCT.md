# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript, served as static assets by a Cloudflare Worker (chosen by the owner on 2026-11-18, overriding the site-starter template's vanilla default). Backend planned in the brief: one Durable Object for live shared state, D1 for persistent data, Turnstile for bot checks. None of these exist yet; the site is a placeholder page.

## Users

- **Primary:** casual browser players who like idle and clicker games, mostly on phones. They drop in during the day to add thrust, send the daily ping and cast the daily vote, then leave the idle game running. Their job is a short, satisfying daily visit that visibly moves something bigger than them.
- **Secondary:** space fans, who come for the real route, distances, milestones, fact cards and space-photo postcards.
- **Secondary:** streamers and their chat, playing together as one crew (a streamer mode is a later idea, not MVP).

## Product Purpose

The whole world flies one real probe, OSC-1, from Earth to Mars, one small click at a time, and when it arrives depends on everyone. Every click from every player is thrust for the same shared probe. Success means players come back daily because the shared mission needs them: the signal stays alive, votes get cast, and the arrival date moves because of what the crew did.

## Positioning

One shared probe on a real Earth–Mars route, flown by everyone at once. The headline is a live arrival date that moves with how much the world plays, and a daily "keep the signal alive" ping means any one player can be the one who saves it. A personal idle game sits on top, but the shared mission is the point.

## Operating Context

- Daily rituals: a ping (one per device, or per account when signed in) resets a shared signal timer; one crew vote a day changes the route or the date; milestones unlock fact cards and postcards.
- Play works without an account (anonymous device ID). Sign-in by email link or Google is optional and keeps progress across devices. Only accounts appear on leaderboards and in the credits.
- When the probe arrives: mission credits for everyone who helped, then a vote on the next destination.
- Sharing and invites (phase S): one-tap shares to the big apps at every big moment, personal crew links with rich previews, and recruiter badges for friends who play. Plain share links only: no share SDKs and no tracking scripts. Growth is measured with the K-factor (shares per player × the share who join) in /admin.
- Crew emails (from phase 8d, opt-in, accounts only): a halfway "help us make the push" and an arrival round-up with your contribution and the top contributors. At most two per leg, with one-click unsubscribe, and never tracking pixels.
- Content pages (mission log, milestone fact pages, leaderboards, how to play) carry most of the AdSense display ads.

## Capabilities and Constraints

- Planned MVP (docs/brief.md): shared global counter; real route with true distances and milestones; live arrival date; daily crew vote; mission log; postcards; signal timer, safe mode and ping badges; idle upgrades with auto-thrusters, offline progress and prestige; optional sign-in; player and country leaderboards; mission credits; "people here now" counter; next-destination vote.
- The server is the authority. Clicks are sent in batches every few seconds, offline thrust is capped at about 8 hours and checked by the server, pings and votes pass an invisible bot check, and each network has a generous daily cap. Never trust totals from the browser.
- Safe mode is a setback, never a wipe.
- Ads: never on or near the thrust button (at least 150px away), no anchor or floating ads on the game page, never rewarded or hinted at. A rewarded thrust boost is a later idea only, and never for pings.
- Terminology: probe OSC-1, THRUST, Ping, signal, safe mode, crew, mission log, milestone, postcard, mission credits, Mission Patches (prestige).
- Undecided (see the brief's Open questions): prestige reset rules, vote close time and number of options, safe-mode setback size, signal window at launch, email provider, how leaderboard country is set, display-name filtering, target first-mission length, whether postcards stay photographic or become pixel art, domain purchase. (Decided 2026-11-18: the palette is the design's colours in docs/tokens.css; fonts are self-hosted; content pages are plain HTML.)

## Brand Commitments

- Name: OneSmallClick. Domain onesmallclick.io (to be bought on payday, with Email Service and Workers Paid; onesmallclick.com is taken and .co.uk reads as UK-only).
- Binding visual commitment from the owner: 16-bit SNES-era pixel art, made with PixelLab against one locked palette, scaled only by whole numbers with crisp pixel rendering. The approved Claude Design file (design/OneSmallClick.dc.html) is the visual source of truth; CLAUDE.md holds its rules.
- Voice: hopeful and shared, like a mission control room run by the whole world.

## Evidence on Hand

- docs/brief.md (product brief), docs/design-brief.md (game rules and numbers from the design phase), design/OneSmallClick.dc.html (12 approved screens), docs/tokens.css (colours).
- Sprites in design/sprites/ and design/assets/ (probe, thruster, Earth, Mars, Moon, starfield, firework/burst). Still to make: milestone flag, signal badge.
- No players, traffic, testimonials, press, or licensed postcard photos yet. Don't invent player counts, crew names or quotes as if they were real; postcard images need a licence check for each one.

## Product Principles

1. The shared mission comes first. Personal progress serves the crew's probe, never competes with it.
2. Setbacks, never wipes. Losing the signal costs time, not everything the crew built. (The one exception is before launch: the early-access game is wiped once on launch day, which the banner says up front, and early players keep an Early Beta badge.)
3. The server is the truth. Anything that could be cheated is decided on the server.
4. Respect the visit. A daily drop-in should feel complete in a minute, and ads never get in the way of play or pay out for clicks.
5. Real space. Distances, milestones and facts are true; the fiction is only that everyone is flying it.

## Accessibility & Inclusion

Phone-first with tap targets of at least 44px; real buttons with labels; text contrast 4.5:1 or better in both themes; frame-based motion that respects prefers-reduced-motion.
