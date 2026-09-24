"""Print-ready HTML renderer for a generated slide deck.

WHY A FIXED TEMPLATE INSTEAD OF ASKING THE MODEL FOR HTML
---------------------------------------------------------
The tempting shortcut is to ask the generation model for styled HTML/CSS
directly. That is precisely where a cheap model fails worst, and it fails
*invisibly*: it will emit HTML that parses, so nothing errors, but the result
is a different design every run — inconsistent type scales, colours that clash,
text that overflows its box, the occasional unclosed tag. Quality then depends
on the model's taste and on how many tokens it felt like spending, neither of
which we control, and both of which get worse on the cheaper tier.

So the split is:
  * the model returns CONTENT ONLY — title, slide_number, bullet_points,
    speaker_notes (the shape it already returns; see SlidesResult in
    frontend/services/api.ts);
  * this module owns PRESENTATION — one hand-designed template, rendered
    identically every time.

Two things follow that are worth stating plainly, because they are the whole
argument for doing it this way:
  1. Deck quality stops being a model-quality problem. Moving to a cheaper
     model can make the *wording* worse; it can no longer make the *design*
     worse. Design defects become our bugs, fixable once, for every deck ever
     generated — including ones already produced, since this renders on demand.
  2. It costs no output tokens. HTML/CSS is by far the most token-expensive
     thing a model can be asked to produce, and every one of those tokens is
     spent re-deriving a layout we already know.

The remaining risk is content that doesn't FIT the design — twelve bullets, or
one 600-character bullet. That is handled before rendering, deterministically,
by app/ai/validators.py's slide guardrails; by the time a deck reaches this
module its shape is already inside the box the CSS was measured against.

PDF: there is no headless-browser dependency here on purpose. The teacher
prints with the browser's own "Print → Save as PDF", which already produces
excellent PDFs from print CSS, needs no extra service on Render, and adds no
per-export latency or cost.
"""
from __future__ import annotations

from html import escape
from typing import Any, Dict, List

from app.ai.validators import density_class
from app.media.visual_guardrails import PALETTE_HEX

# Standard 16:9 presentation page (13.333in x 7.5in) — the same geometry
# PowerPoint and Google Slides use, so the printed PDF matches what anyone
# expects a deck to look like and drops into existing projector setups without
# letterboxing. Margin 0 on @page; the padding lives inside .slide so the
# accent rule can bleed to the page edge.
PAGE_WIDTH_MM = 338.6
PAGE_HEIGHT_MM = 190.5

_CSS = """
:root {
  --bg: %(background)s;
  --primary: %(primary)s;
  --secondary: %(secondary)s;
  --accent: %(accent)s;
  --ink: %(ink)s;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: #E8EAEF;
  color: var(--ink);
  /* System stack only: no webfont fetch, so printing works offline and a slow
     font load can never produce a half-styled PDF. */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ---- Screen preview chrome (removed entirely when printing) ------------- */
.toolbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 16px;
  padding: 14px 24px;
  background: var(--ink); color: #fff;
  font-size: 14px;
}
.toolbar strong { font-weight: 600; }
.toolbar .hint { color: #B9BFCB; }
.toolbar button {
  margin-left: auto;
  background: var(--accent); color: var(--ink);
  border: 0; border-radius: 6px;
  padding: 8px 18px; font-size: 14px; font-weight: 600;
  cursor: pointer;
}
.deck { padding: 28px 0 60px; }

/* A 16:9 page is ~1280px wide at 96dpi, so it overflows most laptop windows.
   Scale the PREVIEW down to fit (screen only — print is untouched, and the
   PDF keeps its true page size). `zoom` rather than `transform: scale()`
   because zoom reflows the surrounding layout, so the page doesn't end up with
   a phantom scrollbar and a gap under the deck. */
@media screen and (max-width: 1400px) { .deck { zoom: 0.72; } }
@media screen and (max-width: 1040px) { .deck { zoom: 0.52; } }
@media screen and (max-width: 760px)  { .deck { zoom: 0.36; } }

/* ---- The slide itself --------------------------------------------------- */
.slide {
  position: relative;
  width: %(page_w)smm;
  height: %(page_h)smm;
  margin: 0 auto 28px;
  padding: 20mm 22mm 16mm;
  background: var(--bg);
  overflow: hidden;            /* a hard stop; the guardrails mean it never fires */
  display: flex;
  flex-direction: column;
  box-shadow: 0 6px 28px rgba(17, 24, 39, 0.18);
}

/* Full-bleed accent rule: the one piece of decoration, and the thing that
   makes consecutive slides read as one deck. */
.slide::before {
  content: "";
  position: absolute; top: 0; left: 0; right: 0;
  height: 6mm;
  background: var(--primary);
}
.slide::after {
  content: "";
  position: absolute; top: 0; left: 0;
  width: 46mm; height: 6mm;
  background: var(--accent);
}

.slide h2 {
  margin: 0 0 10mm;
  font-size: 30pt;
  line-height: 1.15;
  font-weight: 700;
  color: var(--primary);
  letter-spacing: -0.01em;
}

/* A single unbroken token longer than the content box — a URL, a long chemical
   name, an un-spaced compound — would otherwise run straight off the page edge
   and be clipped by .slide's overflow:hidden. The character budgets can't
   catch this because the string is within its length limit; only the layout
   can. */
.slide h2, .slide li, .slide.title-slide h1 { overflow-wrap: anywhere; }

.slide ul {
  margin: 0;
  padding: 0;
  list-style: none;
  flex: 1;
}
.slide li {
  position: relative;
  padding-left: 11mm;
  margin-bottom: 6mm;
  color: var(--ink);
}
.slide li::before {
  content: "";
  position: absolute;
  left: 0; top: 0.42em;
  width: 4.5mm; height: 4.5mm;
  border-radius: 1mm;
  background: var(--accent);
}

/* Two density tiers, chosen server-side from the slide's character count
   (app/ai/validators.density_class). Only two, so slides never look like they
   came from different decks. */
.slide.roomy li { font-size: 21pt; line-height: 1.45; }
.slide.dense li { font-size: 17pt; line-height: 1.42; margin-bottom: 4.5mm; }

.slide-footer {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 10pt;
  color: var(--secondary);
  border-top: 0.4mm solid #D8DCE4;
  padding-top: 4mm;
}

/* ---- Title slide -------------------------------------------------------- */
.slide.title-slide { justify-content: center; }
.slide.title-slide h1 {
  margin: 0 0 8mm;
  font-size: 46pt; line-height: 1.1; font-weight: 700;
  color: var(--primary); letter-spacing: -0.02em;
}
.slide.title-slide .meta { font-size: 16pt; color: var(--secondary); }
.slide.title-slide .rule {
  width: 60mm; height: 2.4mm; background: var(--accent); margin: 0 0 8mm;
}

/* ---- Speaker notes (screen only unless explicitly printed) -------------- */
.notes {
  width: %(page_w)smm;
  margin: -18px auto 28px;
  padding: 14px 18px;
  background: #FFFFFF;
  border-left: 4px solid var(--secondary);
  font-size: 13px; line-height: 1.55; color: var(--secondary);
}
.notes b { color: var(--ink); }

/* ---- Print -------------------------------------------------------------- */
@page {
  size: %(page_w)smm %(page_h)smm;
  margin: 0;
}

@media print {
  html, body { background: #fff; }
  .toolbar, .notes { display: none !important; }
  .deck { padding: 0; }
  .slide {
    margin: 0;
    box-shadow: none;
    /* One slide per printed page, and never split across two. */
    break-after: page;
    page-break-after: always;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .slide:last-of-type { break-after: auto; page-break-after: auto; }
  /* Orphan/widow control so a wrapped bullet never leaves one line stranded. */
  .slide li { orphans: 2; widows: 2; break-inside: avoid; page-break-inside: avoid; }
}

@media print {
  /* Opt-in: notes pages after the deck, enabled by rendering with notes=True. */
  body.with-notes .notes {
    display: block !important;
    width: auto;
    margin: 0;
    padding: 18mm 22mm;
    border-left: 0;
    font-size: 12pt;
    break-before: page;
    page-break-before: always;
  }
}
"""


def _esc(text: Any) -> str:
    """Everything the model produced is escaped before it reaches the page.

    Model output is untrusted input: a bullet containing ``<script>`` or a
    stray ``<`` would otherwise break the layout at best and execute at worst,
    since this HTML is served from our own origin.
    """
    return escape(str(text or ""), quote=True)


def _title_slide(deck: Dict[str, Any]) -> str:
    meta_parts = [str(deck.get(k)) for k in ("grade", "subject") if deck.get(k)]
    meta = " · ".join(meta_parts)
    return (
        '<section class="slide title-slide">'
        '<div class="rule"></div>'
        f"<h1>{_esc(deck.get('title') or 'Presentation')}</h1>"
        + (f'<div class="meta">{_esc(meta)}</div>' if meta else "")
        + "</section>"
    )


def _content_slide(slide: Dict[str, Any], index: int, total: int, deck_title: str) -> str:
    bullets: List[str] = [str(b) for b in (slide.get("bullet_points") or []) if str(b).strip()]
    items = "".join(f"<li>{_esc(b)}</li>" for b in bullets)
    return (
        f'<section class="slide {density_class(bullets)}">'
        f"<h2>{_esc(slide.get('title'))}</h2>"
        f"<ul>{items}</ul>"
        '<div class="slide-footer">'
        f"<span>{_esc(deck_title)}</span><span>{index} / {total}</span>"
        "</div>"
        "</section>"
    )


def _notes_block(slide: Dict[str, Any], index: int) -> str:
    notes = str(slide.get("speaker_notes") or "").strip()
    if not notes:
        return ""
    return f'<aside class="notes"><b>Slide {index} — speaker notes.</b> {_esc(notes)}</aside>'


def render_slides_html(deck: Dict[str, Any], *, include_notes_pages: bool = False) -> str:
    """Renders a validated deck as a standalone, print-ready HTML document.

    `deck` is the dict generate_slides returns: {"title", "slides": [...]}, plus
    optional "grade"/"subject" for the title slide. It should already have been
    through validate_slides/repair_slides — this function does no trimming, so
    that the layout stays a pure function of the content it is handed.

    `include_notes_pages=True` appends each slide's speaker notes as extra
    printed pages (a teacher's own copy); the default prints slides only, so
    the deck that goes on the projector has nothing on it the class shouldn't
    see.
    """
    slides = [s for s in (deck.get("slides") or []) if isinstance(s, dict)]
    deck_title = str(deck.get("title") or "Presentation")
    total = len(slides)

    body_parts = [_title_slide(deck)]
    for i, slide in enumerate(slides, start=1):
        body_parts.append(_content_slide(slide, i, total, deck_title))
        body_parts.append(_notes_block(slide, i))

    css = _CSS % {
        **PALETTE_HEX,
        "page_w": PAGE_WIDTH_MM,
        "page_h": PAGE_HEIGHT_MM,
    }

    return (
        "<!DOCTYPE html>\n"
        '<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{_esc(deck_title)}</title>"
        f"<style>{css}</style>"
        "</head>"
        f'<body class="{"with-notes" if include_notes_pages else ""}">'
        '<div class="toolbar">'
        f"<strong>{_esc(deck_title)}</strong>"
        f'<span class="hint">{total} slide{"s" if total != 1 else ""} · '
        "Print → Destination “Save as PDF” → Margins “None” → Background graphics on</span>"
        '<button onclick="window.print()">Print / Save as PDF</button>'
        "</div>"
        f'<div class="deck">{"".join(body_parts)}</div>'
        "</body></html>"
    )
