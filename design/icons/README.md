# Icons

The ten 9×9 UI icons from the design, exported exactly from `buildIcons()` in `../OneSmallClick.dc.html` on 2026-11-18.

`up` · `bolt` · `trophy` · `log` · `user` · `signal` · `clock` · `check` · `star` · `mail`

Each file is a 9×9 SVG drawn with `fill="currentColor"` and `shape-rendering="crispEdges"`, so one file serves every colour and both themes. Set the colour with CSS `color`. This works when the SVG is inlined (e.g. as a React component); a plain `<img>` can't inherit `color`, so use it as a CSS `mask-image` instead. Show the icons at whole-number sizes only: 18px (2×), 27px (3×) or 36px (4×).

The design uses four colours per theme:

| Name in the design | Dark theme | Light theme | Used for |
|---|---|---|---|
| `b` blue | `#8ccfff` | `#1765b0` | Action, the probe's path, active tab |
| `o` orange | `#ffb37a` | `#a84a0c` | Signal, milestones, celebration |
| `w` white | `#eef3ff` | `#14244a` | Plain emphasis |
| `m` muted | `#8b98ba` | `#56648a` | Inactive tabs, locked badges |

Copies are in `public/icons/`.
