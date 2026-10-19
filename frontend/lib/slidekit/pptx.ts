// PowerPoint export. Reads the same elements as the HTML renderer, so what the
// teacher sees is what lands in the file; every text, box and diagram node is a
// native, editable PowerPoint object. Meme images are embedded as pictures.
// Runs in the browser (download) or in Node (tests, via the `write` option).
import pptxgen from "pptxgenjs";
import type { DiagramGeom, DiaFill, DiaStroke } from "./diagram";
import type { El, Placement } from "./matcher";
import { BOLD_ROLES, CANVAS, DECK_FONT, LINE_HEIGHT } from "./tokens";
import { THEME, type DeckTheme } from "./render";

let T: DeckTheme = THEME;      // set per export; the helpers below read it
const IN = 144;                     // 1920 px ↔ 13.333 in
const PT = (px: number) => px * 0.5; // 1 px = 0.5 pt at this canvas size
const hex = (c: string) => c.replace("#", "");
const ink = (t?: string) => hex(t === "accent" ? T.accent : t === "positive" ? T.positive : t === "negative" ? T.negative : t === "muted" ? T.muted : t === "inverse" ? "#FFFFFF" : T.ink);
const bg = (t?: string) => hex(t === "accent" ? T.accentBg : t === "positive" ? T.positiveBg : t === "negative" ? T.negativeBg : T.card);

const diaFill = (f: DiaFill) => f === "card" ? hex(T.card) : f === "accent" ? hex(T.accentBg) : f === "positive" ? hex(T.positiveBg)
  : f === "header" ? hex(T.header) : null;
const diaLine = (s: DiaStroke) => s === "none" ? null : s === "neutral" ? hex(T.line) : ink(s);

/**
 * Native PowerPoint shapes — ellipse, roundRect, line, text — not a picture.
 * The teacher can move a node, retype a label or recolour a circle, and it stays
 * crisp at any zoom. That editability is the whole point of drawing this natively.
 */
function diagramShapes(pres: pptxgen, s: pptxgen.Slide, gm: DiagramGeom) {
  const at = (x: number, y: number, w: number, h: number) => ({ x: x / IN, y: y / IN, w: w / IN, h: h / IN });
  for (const sp of gm.shapes) {
    if (sp.s === "line") {
      s.addShape(pres.ShapeType.line, {
        ...at(Math.min(sp.x1, sp.x2), Math.min(sp.y1, sp.y2), Math.abs(sp.x2 - sp.x1) || 0.15, Math.abs(sp.y2 - sp.y1) || 0.15),
        flipH: sp.x2 < sp.x1, flipV: sp.y2 < sp.y1,
        line: { color: hex(T.muted), width: 1.5, dashType: sp.dash ? "dash" : "solid", endArrowType: sp.arrow ? "triangle" : undefined },
      });
      continue;
    }
    const fill = diaFill(sp.fill), stroke = diaLine(sp.stroke);
    s.addShape(sp.s === "ellipse" ? pres.ShapeType.ellipse : sp.s === "diamond" ? pres.ShapeType.diamond : pres.ShapeType.roundRect, {
      ...at(sp.x, sp.y, sp.w, sp.h),
      ...(sp.s === "rect" ? { rectRadius: 0.12 } : {}),
      fill: fill ? { color: fill, ...(sp.s !== "diamond" && sp.transparency ? { transparency: sp.transparency } : {}) } : { type: "none" },
      line: stroke ? { color: stroke, width: 1.5 } : { type: "none" },
    });
  }
  for (const l of gm.labels)
    s.addText(l.lines.join("\n"), {
      ...at(l.x, l.y, l.w, l.h), fontFace: DECK_FONT, fontSize: PT(l.size), bold: BOLD_ROLES.has(l.role), color: ink(l.tone),
      align: l.align === "center" ? "center" : "left", valign: "top", margin: 0, lineSpacingMultiple: LINE_HEIGHT * 0.87, fit: "none", wrap: true,
    });
}

/** Natural size of an image in the browser, so a meme keeps its proportions inside its box. Null elsewhere. */
async function browserImageSize(src: string): Promise<{ w: number; h: number } | null> {
  if (typeof Image === "undefined") return null;
  return new Promise(res => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res(null);
    im.src = src;
  });
}

/** Largest rectangle with the image's aspect ratio that fits the box, centred. */
function contain(box: { x: number; y: number; w: number; h: number }, img: { w: number; h: number }) {
  const k = Math.min(box.w / img.w, box.h / img.h);
  const w = img.w * k, h = img.h * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * Build the deck in the given theme. With `file`, saves it (a download in the
 * browser); without, returns the bytes, which is what the tests use.
 */
export async function exportPptx(slides: Placement[], title: string, theme: DeckTheme = THEME, file?: string): Promise<ArrayBuffer | void> {
  // Sizes first (async), then everything below is synchronous, so `T` can't change under it.
  const sizes = new Map<string, { w: number; h: number }>();
  for (const p of slides) for (const e of p.elements)
    if (e.t === "picture" && e.src && !sizes.has(e.src)) { const z = await browserImageSize(e.src); if (z) sizes.set(e.src, z); }
  T = theme;
  const pres = new pptxgen();
  pres.defineLayout({ name: "HD", width: CANVAS.w / IN, height: CANVAS.h / IN });
  pres.layout = "HD";
  pres.title = title;
  for (const p of slides) {
    const s = pres.addSlide();
    s.background = { color: hex(T.bg) };
    const cards = p.elements.filter(e => e.t === "box" && e.style === "card" && e.tone && e.tone !== "inverse") as Extract<El, { t: "box" }>[];
    const toneAt = (e: Extract<El, { t: "text" }>) => e.path === "label" ? undefined : cards.find(c => e.x >= c.x && e.y >= c.y && e.x + e.w <= c.x + c.w + 1 && e.y + e.h <= c.y + c.h + 1)?.tone;
    const pos = (e: { x: number; y: number; w: number; h: number }) => ({ x: e.x / IN, y: e.y / IN, w: e.w / IN, h: e.h / IN });
    for (const e of p.elements) {
      switch (e.t) {
        case "box":
          if (e.tone === "inverse") { s.addShape(pres.ShapeType.rect, { ...pos(e), fill: { color: "0A1220", transparency: 30 }, line: { type: "none" } }); break; }
          s.addShape(pres.ShapeType.roundRect, { ...pos(e), rectRadius: e.style === "chip" ? 0.3 : e.style === "card" ? 0.12 : 0.05,
            fill: { color: e.style === "cell" ? hex(T.bg) : e.style === "header" ? hex(T.header) : e.style === "chip" ? hex(T.chip) : bg(e.tone) },
            line: e.style === "cell" ? { color: hex(T.line), width: 1 } : e.tone && e.tone !== "muted" && e.style === "card" ? { color: ink(e.tone), width: 1.5 } : { type: "none" } });
          break;
        case "text":
          s.addText(e.text, { ...pos(e), fontFace: DECK_FONT, fontSize: PT(e.size), bold: BOLD_ROLES.has(e.role), color: ink(e.tone ?? toneAt(e)),
            align: e.align === "center" ? "center" : "left", valign: "top", margin: 0, lineSpacingMultiple: LINE_HEIGHT * 0.87, fit: "none", wrap: true, strike: e.strike ? "sngStrike" : undefined });
          break;
        case "marker":
          s.addText(e.label, { x: e.x / IN, y: e.y / IN, w: e.d / IN, h: e.d / IN, shape: pres.ShapeType.ellipse, fill: { color: hex(T.ink) }, color: "FFFFFF",
            fontFace: DECK_FONT, fontSize: PT(e.d * 0.55), bold: true, align: "center", valign: "middle", margin: 0 });
          break;
        case "connector":
          s.addShape(pres.ShapeType.line, { x: Math.min(e.x1, e.x2) / IN, y: Math.min(e.y1, e.y2) / IN, w: Math.abs(e.x2 - e.x1) / IN || 0.001, h: Math.abs(e.y2 - e.y1) / IN || 0.001,
            flipH: e.x2 < e.x1, flipV: e.y2 < e.y1, line: { color: hex(T.muted), width: 2, dashType: e.arrow ? "solid" : "dash", endArrowType: e.arrow ? "triangle" : undefined } });
          break;
        case "image":
          s.addText(`Photo: ${e.query}`, { ...pos(e), fill: { color: "E4EAF2" }, color: hex(T.muted), fontFace: DECK_FONT, fontSize: 10, valign: "bottom", margin: 8 });
          break;
        case "picture": {
          const size = e.src ? sizes.get(e.src) : undefined;
          if (e.src && size) {
            const href = typeof location !== "undefined" ? new URL(e.src, location.origin).href : e.src;
            s.addImage({ path: href, altText: e.alt, ...contain(pos(e), size) });
          } else {
            s.addText(`Meme: ${e.lines.join(" / ")}`, { ...pos(e), fill: { color: hex(T.card) }, color: hex(T.muted), fontFace: DECK_FONT, fontSize: 14, align: "center", valign: "middle" });
          }
          break;
        }
        case "icon":
          s.addText(e.name, { ...pos(e), shape: pres.ShapeType.ellipse, fill: { color: bg("accent") }, color: hex(T.muted), fontSize: 10, align: "center" });
          break;
        case "formula":
          s.addText(e.latex, { ...pos(e), fontFace: "Times New Roman", italic: true, fontSize: 22, color: ink("accent"), align: "center", valign: "middle", fit: "shrink" });
          break;
        case "code":
          s.addText(e.code, { ...pos(e), fill: { color: hex(T.code) }, color: hex(T.codeInk), fontFace: "Courier New", fontSize: PT(e.size),
            valign: "top", margin: 20 / IN * 72, lineSpacingMultiple: LINE_HEIGHT * 0.87, fit: "none" });
          break;
        case "diagram":
          if (e.geom) diagramShapes(pres, s, e.geom);
          else s.addText(`${e.kind} diagram · could not be drawn`, { ...pos(e), line: { color: hex(T.line), width: 1.5, dashType: "dash" }, color: hex(T.muted), fontSize: 12, align: "center" });
          break;
      }
    }
    if (p.notes.length) s.addNotes(p.notes.join("\n"));
  }
  if (file) { await pres.writeFile({ fileName: file }); return; }
  return (await pres.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}
