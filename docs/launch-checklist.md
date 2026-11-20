# Launch checklist

Phase 9a (prompts 53–54). Run it before the launch reset, and again after anything big changes. Claude's automated
checks are at the bottom; the rest needs a real phone and a real person.

## On your own phone (Nav)

Use mobile data for one run and Wi-Fi for another.

1. **First visit.** Open the site in a private tab. The game loads, the probe is moving, and nothing jumps around as it loads.
2. **Tap THRUST** for 20 seconds. The km and "You've clicked" go up; the flight view boosts.
3. **Ping.** It works once; a second ping says you've already pinged.
4. **Vote.** It works once; the bar moves.
5. **Upgrades.** Open the sheet, buy one, close it with the grab bar and with a swipe-back.
6. **Share fact.** Save image gives a square picture; Copy link opens the fact.
7. **Sign in with Google.** Your name shows; the Profile icon opens your profile.
8. **Every tab:** Mission, Upgrades, Log, Ranks. Then How to play, Privacy, Terms and Contact from the footer.
9. **Light mode and dark mode** (the footer's toggle). Everything is readable in both.
10. **Turn the phone sideways** and back. Nothing breaks.
11. **Lock the phone for a minute**, then come back. The game reconnects by itself.
12. **Turn on reduced motion** (iPhone: Settings → Accessibility → Motion → Reduce Motion; Android: Remove animations). Nothing flashes or scrolls on its own.
13. **Larger text** (the phone's text size one or two steps up). Nothing overlaps.
14. **A broken address**, like /nothing-here. It says "Lost signal" with a way back.

## Before the launch reset (Claude, after payday: phase 9b)

- onesmallclick.io connected, Turnstile and Google sign-in updated for it, email sign-in working.
- Workers Paid on.
- AdSense in the slots with its consent message, and the privacy page updated for ads.
- The live load test (docs/load-test.md), if Nav OKs it.
- Then "Reset mission (keep players)" in /admin.

## Automated (Claude, phase 9a)

The results are in docs/plan.md ("Phase 9a as built").

- Lighthouse (`npx lighthouse`, not part of the project) on the game home, How to play, a milestone page, the Mars facts page and Privacy: phone and desktop.
- An accessibility pass: keyboard only (every control reachable, a visible focus ring, dialogs trap focus and Esc closes them), text contrast in both themes, labels on icon buttons, reduced motion.
- Screenshots at 375, 390 and 1440 in both themes.
- The scripted checks: sign-in, clicks, badges, arrival and the network cap.
