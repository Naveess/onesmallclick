What should / show? The plan puts the game home at /, which means anyone who finds the workers.dev address sees a game with made-up numbers.
My recommendation: put it at / anyway. The address isn't promoted, and it's what we'll test on.
The alternative: keep "launching soon" at / and put the game at /play until phase 4. > put it at anyway

THRUST colours. The design hard-codes THRUST so it looks the same in both themes. It uses eight colours that aren't in docs/tokens.css (#b9e2ff, #4a8fe0, #3474c4, #25599f, #1a427c, #11305c, #0c2448, #d6ecff). It also uses see-through glows of the palette's blue and orange.
My recommendation: add them as fixed --thrust-* colours that don't change with the theme, and allow see-through versions of existing palette colours.
The palette is locked, so this needs your OK. > you have my OK

Should upgrade purchases survive a reload in phase 3?
My recommendation: no, keep them for the current visit only, so nobody thinks their progress is saved before phase 6 makes it real.
The alternative: save them in the browser. > go with your recommendation, no.

Here is your OK, go for the build
