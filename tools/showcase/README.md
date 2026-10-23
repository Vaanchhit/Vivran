# Showcase decks

The example lessons on the landing page (`#decks`). Hand-written content, real
openly-licensed photos from Wikimedia Commons, built as editable PowerPoint.

```
npm install                 # pptxgenjs, sharp, react-icons (local to this folder)
python3 get_images.py       # downloads the photos and writes img/credits.json
PPTX_SKILL=<pptx skill dir> NODE_PATH=$PWD/node_modules node decks.js   # → out/*.pptx
./render.sh                 # Keynote → PDF → 1920px PNGs in out/png (macOS, for QA)
python3 publish.py          # → frontend/public/landing/decks (slides, thumbs, .pptx, decks.json)
```

`kit.js` holds the compositions (cover, icon rows, split photo, steps, columns, table,
big idea, quiz, recap, code); `decks.js` holds the five lessons. Photo licences are
listed per deck on the landing page and in `decks.json`.
