# The Early Beta badge (prompts 82-83), drawn in code on the First Ping medal's ring: a white beta and an orange
# sparkle on the navy disc. Free (no PixelLab generations). Needs Pillow.
#   python scripts/make-beta-badge.py . public/sprites/badges/badge-early-beta.png preview.png
# then copy the badge to design/sprites/stills/badges/ too.
import math, sys
from PIL import Image
root = sys.argv[1]; out = sys.argv[2]; preview = sys.argv[3]
im = Image.open(f"{root}/public/sprites/badges/badge-first-ping.png").convert("RGBA")
K = (13, 28, 66, 255); J = (18, 28, 60, 255)
W = (255, 255, 255, 255); T = (211, 224, 236, 255); S = (105, 116, 132, 255)
O = (255, 179, 122, 255); OD = (234, 105, 48, 255)
cx = cy = 15.5
# Clear the inner disc (keep the ring and its dark inner edge).
for y in range(32):
    for x in range(32):
        d = math.hypot(x - cx, y - cy)
        if d <= 9.6:
            im.putpixel((x, y), J if (x + y) % 7 == 0 and d > 8 else K)
beta = [
    "..XXXX...",
    ".XXTTXX..",
    ".XX..XX..",
    ".XX..XX..",
    ".XX.XXT..",
    ".XXXXT...",
    ".XX.TXX..",
    ".XX..TXX.",
    ".XX...XX.",
    ".XX...XX.",
    ".XX..XXT.",
    ".XXXXXT..",
    ".XX.TT...",
    ".XX......",
    ".TT......",
]
ox, oy = 11, 9
for r, row in enumerate(beta):
    for c, ch in enumerate(row):
        if ch == "X": im.putpixel((ox + c, oy + r), W)
        elif ch == "T": im.putpixel((ox + c, oy + r), T)
        # a dark drop shadow one pixel down-right, like the other icons
for r, row in enumerate(beta):
    for c, ch in enumerate(row):
        if ch in "XT":
            x, y = ox + c + 1, oy + r + 1
            if im.getpixel((x, y)) in (K, J): im.putpixel((x, y), (8, 16, 40, 255))
# An orange four-point sparkle, top right.
sx, sy = 20, 9
for dx, dy, col in [(0,0,O),(0,-1,O),(0,1,O),(-1,0,O),(1,0,O),(0,-2,OD),(0,2,OD),(-2,0,OD),(2,0,OD)]:
    im.putpixel((sx + dx, sy + dy), col)
im.putpixel((22, 13), O); im.putpixel((17, 6), OD)
im.save(out)
big = Image.new("RGBA", (192 * 3, 192), (0, 0, 0, 0))
for i, n in enumerate(["first-ping", "patch"]):
    big.paste(Image.open(f"{root}/public/sprites/badges/badge-{n}.png").convert("RGBA").resize((192, 192), Image.NEAREST), ((i + 1) * 192, 0))
big.paste(im.resize((192, 192), Image.NEAREST), (0, 0))
bg = Image.new("RGBA", big.size, (20, 24, 48, 255)); bg.alpha_composite(big); bg.save(preview)
