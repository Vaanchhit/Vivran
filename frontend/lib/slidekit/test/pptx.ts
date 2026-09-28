// Exports placements to a real .pptx with pptxgenjs, reading the same elements as the HTML renderer.
import pptxgen from "pptxgenjs";
import type { DiagramGeom, DiaFill, DiaStroke } from "../diagram";
import type { El, Placement } from "../matcher";
import { BOLD_ROLES, CANVAS, DECK_FONT, LINE_HEIGHT } from "../tokens";
import { THEME } from "../render";

const IN = 144;                     // 1920 px ↔ 13.333 in
const PT = (px: number) => px * 0.5; // 1 px = 0.5 pt at this canvas size
const hex = (c: string) => c.replace("#", "");
const ink = (t?: string) => hex(t === "accent" ? THEME.accent : t === "positive" ? THEME.positive : t === "negative" ? THEME.negative : t === "muted" ? THEME.muted : t === "inverse" ? "#FFFFFF" : THEME.ink);
const bg = (t?: string) => hex(t === "accent" ? THEME.accentBg : t === "positive" ? THEME.positiveBg : t === "negative" ? THEME.negativeBg : THEME.card);

const diaFill = (f: DiaFill) => f === "card" ? hex(THEME.card) : f === "accent" ? hex(THEME.accentBg) : f === "positive" ? hex(THEME.positiveBg)
  : f === "header" ? hex(THEME.header) : null;
const diaLine = (s: DiaStroke) => s === "none" ? null : s === "neutral" ? hex(THEME.line) : ink(s);

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
        line: { color: hex(THEME.muted), width: 1.5, dashType: sp.dash ? "dash" : "solid", endArrowType: sp.arrow ? "triangle" : undefined },
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

export async function exportPptx(slides: Placement[], title: string, file: string) {
  const pres = new pptxgen();
  pres.defineLayout({ name: "HD", width: CANVAS.w / IN, height: CANVAS.h / IN });
  pres.layout = "HD";
  pres.title = title;
  for (const p of slides) {
    const s = pres.addSlide();
    s.background = { color: hex(THEME.bg) };
    const cards = p.elements.filter(e => e.t === "box" && e.style === "card" && e.tone && e.tone !== "inverse") as Extract<El, { t: "box" }>[];
    const toneAt = (e: Extract<El, { t: "text" }>) => e.path === "label" ? undefined : cards.find(c => e.x >= c.x && e.y >= c.y && e.x + e.w <= c.x + c.w + 1 && e.y + e.h <= c.y + c.h + 1)?.tone;
    const pos = (e: { x: number; y: number; w: number; h: number }) => ({ x: e.x / IN, y: e.y / IN, w: e.w / IN, h: e.h / IN });
    for (const e of p.elements) {
      switch (e.t) {
        case "box":
          if (e.tone === "inverse") { s.addShape(pres.ShapeType.rect, { ...pos(e), fill: { color: "0A1220", transparency: 30 }, line: { type: "none" } }); break; }
          s.addShape(pres.ShapeType.roundRect, { ...pos(e), rectRadius: e.style === "chip" ? 0.3 : e.style === "card" ? 0.12 : 0.05,
            fill: { color: e.style === "cell" ? hex(THEME.bg) : e.style === "header" ? hex(THEME.header) : e.style === "chip" ? hex(THEME.chip) : bg(e.tone) },
            line: e.style === "cell" ? { color: hex(THEME.line), width: 1 } : e.tone && e.tone !== "muted" && e.style === "card" ? { color: ink(e.tone), width: 1.5 } : { type: "none" } });
          break;
        case "text":
          s.addText(e.text, { ...pos(e), fontFace: DECK_FONT, fontSize: PT(e.size), bold: BOLD_ROLES.has(e.role), color: ink(e.tone ?? toneAt(e)),
            align: e.align === "center" ? "center" : "left", valign: "top", margin: 0, lineSpacingMultiple: LINE_HEIGHT * 0.87, fit: "none", wrap: true, strike: e.strike ? "sngStrike" : undefined });
          break;
        case "marker":
          s.addText(e.label, { x: e.x / IN, y: e.y / IN, w: e.d / IN, h: e.d / IN, shape: pres.ShapeType.ellipse, fill: { color: hex(THEME.ink) }, color: "FFFFFF",
            fontFace: DECK_FONT, fontSize: PT(e.d * 0.55), bold: true, align: "center", valign: "middle", margin: 0 });
          break;
        case "connector":
          s.addShape(pres.ShapeType.line, { x: Math.min(e.x1, e.x2) / IN, y: Math.min(e.y1, e.y2) / IN, w: Math.abs(e.x2 - e.x1) / IN || 0.001, h: Math.abs(e.y2 - e.y1) / IN || 0.001,
            flipH: e.x2 < e.x1, flipV: e.y2 < e.y1, line: { color: hex(THEME.muted), width: 2, dashType: e.arrow ? "solid" : "dash", endArrowType: e.arrow ? "triangle" : undefined } });
          break;
        case "image":
          s.addText(`Photo: ${e.query}`, { ...pos(e), fill: { color: "E4EAF2" }, color: hex(THEME.muted), fontFace: DECK_FONT, fontSize: 10, valign: "bottom", margin: 8 });
          break;
        case "icon":
          s.addText(e.name, { ...pos(e), shape: pres.ShapeType.ellipse, fill: { color: bg("accent") }, color: hex(THEME.muted), fontSize: 10, align: "center" });
          break;
        case "formula":
          s.addText(e.latex, { ...pos(e), fontFace: "Times New Roman", italic: true, fontSize: 22, color: ink("accent"), align: "center", valign: "middle", fit: "shrink" });
          break;
        case "code":
          s.addText(e.code, { ...pos(e), fill: { color: hex(THEME.code) }, color: hex(THEME.codeInk), fontFace: "Courier New", fontSize: PT(e.size),
            valign: "top", margin: 20 / IN * 72, lineSpacingMultiple: LINE_HEIGHT * 0.87, fit: "none" });
          break;
        case "diagram":
          if (e.geom) diagramShapes(pres, s, e.geom);
          else s.addText(`${e.kind} diagram · could not be drawn`, { ...pos(e), line: { color: hex(THEME.line), width: 1.5, dashType: "dash" }, color: hex(THEME.muted), fontSize: 12, align: "center" });
          break;
      }
    }
    if (p.notes.length) s.addNotes(p.notes.join("\n"));
  }
  await pres.writeFile({ fileName: file });
}
