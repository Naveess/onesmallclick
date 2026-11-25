# The postcard photos (prompts 95-97): real NASA photos, cropped to the postcard's shape.
# Reads every `postcard` and `landingPostcard` in content/milestones/<stop>.json, downloads each original from NASA's
# Image and Video Library (images-api.nasa.gov) into a cache folder outside the repo, and writes
# public/postcards/<nasa id, lower case>.jpg at 596 x 368 (twice the 298 x 184 slot, for sharp phones).
#   python -I scripts/make-postcards.py [cache folder]      (default: ../onesmallclick-postcard-originals)
# Per photo: "fit": "contain" shows the whole picture on black (globes); "focusX"/"focusY" (0 to 1, default 0.5)
# move a "cover" crop. Needs Pillow. The credits and licences are in the content files; docs/postcard-photos.md.
import glob, json, os, sys, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), "onesmallclick-postcard-originals")
OUT = os.path.join(ROOT, "public", "postcards")
W, H = 596, 368
UA = {"User-Agent": "postcard-script/1.0"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()

def original(nasa_id):
    path = os.path.join(CACHE, nasa_id + ".jpg")
    if os.path.exists(path):
        return path
    items = json.loads(get("https://images-api.nasa.gov/asset/" + urllib.parse.quote(nasa_id)))["collection"]["items"]
    hrefs = [i["href"].replace("http://", "https://") for i in items]
    for suffix in ("~large.jpg", "~orig.jpg", "~medium.jpg"):
        pick = next((h for h in hrefs if h.lower().endswith(suffix)), None)
        if pick:
            break
    else:
        raise SystemExit(f"{nasa_id}: no JPEG among {hrefs}")
    os.makedirs(CACHE, exist_ok=True)
    data = get(pick.replace(" ", "%20"))
    with open(path, "wb") as f:
        f.write(data)
    return path

def crop(src, card):
    im = Image.open(src).convert("RGB")
    sw, sh = im.size
    if card.get("fit") == "contain":
        scale = min(W / sw, H / sh)
        small = im.resize((max(1, round(sw * scale)), max(1, round(sh * scale))), Image.LANCZOS)
        out = Image.new("RGB", (W, H), (0, 0, 0))
        out.paste(small, ((W - small.width) // 2, (H - small.height) // 2))
        return out
    r = W / H
    if sw / sh > r:
        cw = round(sh * r); x = round((sw - cw) * card.get("focusX", 0.5)); box = (x, 0, x + cw, sh)
    else:
        ch = round(sw / r); y = round((sh - ch) * card.get("focusY", 0.5)); box = (0, y, sw, y + ch)
    return im.crop(box).resize((W, H), Image.LANCZOS)

cards = {}
for f in sorted(glob.glob(os.path.join(ROOT, "content", "milestones", "*.json"))):
    data = json.load(open(f, encoding="utf-8"))
    for c in [m.get("postcard") for m in data["milestones"]] + [data.get("landingPostcard")]:
        if c:
            cards[c["nasaId"]] = c

os.makedirs(OUT, exist_ok=True)
for nasa_id, card in cards.items():
    want = "/postcards/" + nasa_id.lower() + ".jpg"
    if card["image"] != want:
        raise SystemExit(f"{nasa_id}: image should be {want}")
    out = crop(original(nasa_id), card)
    dest = os.path.join(OUT, nasa_id.lower() + ".jpg")
    out.save(dest, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{dest}  {os.path.getsize(dest) // 1024} KB")
print(f"{len(cards)} postcards")
