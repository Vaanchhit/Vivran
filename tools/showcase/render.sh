#!/bin/sh
# Render every deck through Keynote to PDF, then rasterise at 1920 px (QA + website images).
set -e
HERE=$(cd "$(dirname "$0")" && pwd); WORK=${WORK:-$HERE/work/render}; mkdir -p "$WORK"
for f in "$HERE"/out/*.pptx; do
  id=$(basename "$f" .pptx); cp "$f" "$WORK/$id.pptx"; rm -f "$WORK/$id.pdf"
  osascript -e "with timeout of 300 seconds
tell application \"Keynote\"
  set d to open (POSIX file \"$WORK/$id.pptx\")
  delay 2
  export d to (POSIX file \"$WORK/$id.pdf\") as PDF
  close d saving no
end tell
end timeout" >/dev/null
  "$HERE/.venv/bin/python" - "$WORK/$id.pdf" "$HERE/out/png/$id" <<'PY'
import pymupdf as fitz, sys, os
pdf, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
doc = fitz.open(pdf)
for i, page in enumerate(doc):
    z = 1920 / page.rect.width
    page.get_pixmap(matrix=fitz.Matrix(z, z)).save(f"{out}/{i+1:02d}.png")
print(out, len(doc))
PY
done
