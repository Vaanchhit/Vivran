# Browser audit: loads every slide in Chromium and measures real text overflow.
import json, sys
from playwright.sync_api import sync_playwright
JS = """() => {
  const out = { checked: 0, overflows: [], ratios: [] };
  for (const s of document.querySelectorAll('.slide')) for (const t of s.querySelectorAll('.t')) {
    out.checked++;
    const size = +t.dataset.size || 0;
    const over = t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1;
    if (size && !t.classList.contains('code')) {
      const est = Math.round(t.clientHeight / (size * 1.25)), real = Math.round(t.scrollHeight / (size * 1.25));
      out.ratios.push(real / Math.max(est, 1));
    }
    if (over) out.overflows.push({ slide: s.dataset.label, layout: s.dataset.layout, path: t.dataset.path, size,
      text: t.textContent.slice(0, 90), sh: t.scrollHeight, ch: t.clientHeight, sw: t.scrollWidth, cw: t.clientWidth });
  }
  return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    pg.goto("file://" + sys.argv[1]); pg.wait_for_timeout(300)
    r = pg.evaluate(JS)
    fonts = pg.evaluate("() => { const t = document.querySelector('.slide .t'); return getComputedStyle(t).fontFamily }")
    b.close()
ratios = r.pop("ratios")
r["font"] = fonts
r["lines_real_over_estimated_max"] = max(ratios) if ratios else None
json.dump(r, open(sys.argv[2], "w"), indent=1)
print(f"checked {r['checked']} text boxes, {len(r['overflows'])} overflow(s)")
for o in r["overflows"][:25]: print(" ✗", o)
