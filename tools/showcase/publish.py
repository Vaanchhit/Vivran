"""Copy rendered decks to the website: frontend/public/landing/decks/<id>/ (slides, thumbs, .pptx) + decks.json."""
import json, os, shutil, glob
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "..", "..", "frontend", "public", "landing", "decks")
IMAGES = {  # which photos each deck uses, for its credits line
    "photosynthesis": ["leaf", "chloroplasts", "paddy"], "french-revolution": ["bastille", "oath", "declaration"],
    "mitosis-meiosis": ["onion_mitosis"], "demand-supply": ["veg_vendor", "market", "onions"], "python-loops": ["lab"],
}
credits = json.load(open(os.path.join(HERE, "img", "credits.json")))
manifest = json.load(open(os.path.join(HERE, "out", "manifest.json")))
shutil.rmtree(DEST, ignore_errors=True); os.makedirs(DEST)
for d in manifest:
    src = os.path.join(HERE, "out", "png", d["id"]); out = os.path.join(DEST, d["id"]); os.makedirs(out)
    pngs = sorted(glob.glob(src + "/*.png"))
    for i, f in enumerate(pngs, 1):
        im = Image.open(f).convert("RGB")
        im.resize((1600, 900), Image.LANCZOS).save(f"{out}/{i:02d}.jpg", quality=80, optimize=True, progressive=True)
        im.resize((384, 216), Image.LANCZOS).save(f"{out}/t{i:02d}.jpg", quality=72, optimize=True)
    shutil.copy(os.path.join(HERE, "out", d["id"] + ".pptx"), os.path.join(DEST, d["id"] + ".pptx"))
    d["slides"] = len(pngs)
    d["credits"] = [{"author": credits[k]["author"].split(",")[0].strip()[:60], "license": credits[k]["license"], "source": credits[k]["source"]} for k in IMAGES[d["id"]]]
json.dump(manifest, open(os.path.join(DEST, "decks.json"), "w"), indent=1, ensure_ascii=False)
total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(DEST) for f in fs)
print(f"published {len(manifest)} decks, {total/1e6:.1f} MB")
