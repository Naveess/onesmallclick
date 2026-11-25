# Phase Q1b-2: the installed app's icons, made from the game's own sprites (the probe on the night sky), no new art.
#   python -I scripts/make-app-icons.py        (needs Pillow; writes public/app/, committed)
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "app")
os.makedirs(OUT, exist_ok=True)

stars = Image.open(os.path.join(ROOT, "design/sprites/stills/starfield.png")).convert("RGBA")  # 256 x 256, opaque
probe = Image.open(os.path.join(ROOT, "public/sprites/probe.png")).convert("RGBA")
probe = probe.crop(probe.getbbox())  # the art itself, 36 x 24


def icon(size, star_scale, probe_scale):
    """A square icon: the star tile at a whole-number scale, the probe at a whole-number scale in the middle."""
    tile = size // star_scale + 1
    sky = stars.crop((0, 0, min(256, tile), min(256, tile))).resize((min(256, tile) * star_scale,) * 2, Image.NEAREST)
    canvas = Image.new("RGBA", (size, size), (14, 26, 64, 255))  # --sky-1
    canvas.paste(sky, (0, 0))
    p = probe.resize((probe.width * probe_scale, probe.height * probe_scale), Image.NEAREST)
    canvas.alpha_composite(p, ((size - p.width) // 2, (size - p.height) // 2))
    return canvas.crop((0, 0, size, size))


icon(512, 2, 10).save(os.path.join(OUT, "app-512.png"))
icon(192, 2, 4).save(os.path.join(OUT, "app-192.png"))
# Maskable: the probe stays inside the middle 80% (Android may crop it to a circle).
icon(512, 2, 8).save(os.path.join(OUT, "app-maskable-512.png"))
icon(180, 2, 4).save(os.path.join(OUT, "apple-touch-180.png"))

# The small white badge Android shows in the status bar: just the probe's shape, on transparent.
badge = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
shape = Image.new("RGBA", probe.size, (255, 255, 255, 255))
mask = probe.split()[3].point(lambda a: 255 if a > 0 else 0)
shape.putalpha(mask)
shape = shape.resize((shape.width * 2, shape.height * 2), Image.NEAREST)
badge.alpha_composite(shape, ((96 - shape.width) // 2, (96 - shape.height) // 2))
badge.save(os.path.join(OUT, "badge-96.png"))
print("wrote", sorted(os.listdir(OUT)))
