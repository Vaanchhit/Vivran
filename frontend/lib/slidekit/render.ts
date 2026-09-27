// ─────────────────────────────────────────────────────────────
// Renderer: placements → absolutely positioned HTML. It draws only
// what the matcher decided; it makes no layout decisions of its own.
// The PPTX exporter reads the same elements.
// ─────────────────────────────────────────────────────────────
import type { DiagramGeom, DiaFill, DiaStroke } from "./diagram";
import type { El, Placement } from "./matcher";
import { BOLD_ROLES, CANVAS, DECK_FONT, LINE_HEIGHT } from "./tokens";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Vivran's paper-and-ink palette (frontend/app/globals.css), tuned for a
// projected 16:9 slide and for print: warm paper, near-black ink, one accent.
export const THEME = {
  bg: "#FBF8F3", ink: "#1D1813", muted: "#6B6258", line: "#E2DBCF",
  card: "#F3EEE5", accent: "#B8461F", accentBg: "#F7E6DD",
  positive: "#1A7F5A", positiveBg: "#E3F1EA", negative: "#B3341A", negativeBg: "#F8E4DF",
  header: "#EDE6DA", chip: "#F0EAE0", code: "#1E1A16", codeInk: "#EDE6DA",
};

const toneInk = (t?: string) => t === "accent" ? THEME.accent : t === "positive" ? THEME.positive : t === "negative" ? THEME.negative
  : t === "muted" ? THEME.muted : t === "inverse" ? "#FFFFFF" : THEME.ink;
const toneBg = (t?: string) => t === "accent" ? THEME.accentBg : t === "positive" ? THEME.positiveBg : t === "negative" ? THEME.negativeBg
  : t === "muted" ? THEME.card : THEME.card;

const diaFill = (f: DiaFill) => f === "card" ? THEME.card : f === "accent" ? THEME.accentBg : f === "positive" ? THEME.positiveBg
  : f === "header" ? THEME.header : "none";
const diaStroke = (s: DiaStroke) => s === "none" ? "none" : s === "neutral" ? THEME.line : toneInk(s);

/**
 * Real <svg> with real <text>: print-to-PDF keeps every word selectable and
 * searchable. The lines were wrapped by diagram.ts, because SVG text does not wrap.
 */
function diagramSVG(gm: DiagramGeom, box: { x: number; y: number; w: number; h: number }): string {
  const body = gm.shapes.map(s => {
    if (s.s === "line")
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${THEME.muted}" stroke-width="3" stroke-linecap="round"${s.dash ? ' stroke-dasharray="6 10"' : ""}${s.arrow ? ' marker-end="url(#dah)"' : ""}/>`;
    const fill = diaFill(s.fill), stroke = diaStroke(s.stroke);
    const paint = `fill="${fill}"${fill !== "none" && s.transparency ? ` fill-opacity="${(100 - s.transparency) / 100}"` : ""}`
      + (stroke === "none" ? "" : ` stroke="${stroke}" stroke-width="3"`);
    return s.s === "ellipse"
      ? `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" ${paint}/>`
      : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" ${paint}/>`;
  }).join("");
  const text = gm.labels.map(l => {
    const lh = l.size * LINE_HEIGHT;
    const x = l.align === "center" ? l.x + l.w / 2 : l.x;
    const spans = l.lines.map((ln, i) =>
      `<tspan x="${x}" y="${(l.y + i * lh + lh / 2).toFixed(2)}">${esc(ln)}</tspan>`).join("");
    return `<text data-path="${esc(l.path)}" font-size="${l.size}" font-weight="${BOLD_ROLES.has(l.role) ? 700 : 400}" fill="${toneInk(l.tone)}" text-anchor="${l.align === "center" ? "middle" : "start"}" dominant-baseline="central">${spans}</text>`;
  }).join("");
  return `<svg class="dg" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">`
    + `<defs><marker id="dah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${THEME.muted}"/></marker></defs>`
    + `${body}${text}</svg>`;
}

function el(e: El, cardTone: string | undefined): string {
  const pos = (x: number, y: number, w: number, h: number) => `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  switch (e.t) {
    case "text": {
      const ink = toneInk(e.tone ?? cardTone);
      return `<div class="t" data-path="${esc(e.path)}" data-size="${e.size}" style="${pos(e.x, e.y, e.w, e.h)};font-size:${e.size}px;line-height:${LINE_HEIGHT};font-weight:${BOLD_ROLES.has(e.role) ? 700 : 400};color:${ink};text-align:${e.align === "center" ? "center" : "left"}${e.strike ? ";text-decoration:line-through" : ""}">${esc(e.text)}</div>`;
    }
    case "box": {
      if (e.tone === "inverse") return `<div class="b" style="${pos(e.x, e.y, e.w, e.h)};background:linear-gradient(90deg,rgba(29,24,19,.84),rgba(29,24,19,.34))"></div>`;
      const st = e.style === "card" ? `background:${toneBg(e.tone)};border-radius:18px${e.tone && e.tone !== "muted" && e.tone !== "neutral" ? `;border:3px solid ${toneInk(e.tone)}` : ""}`
        : e.style === "header" ? `background:${THEME.header};border-radius:8px`
        : e.style === "chip" ? `background:${THEME.chip};border-radius:999px`
        : `background:${THEME.bg};border:2px solid ${THEME.line};border-radius:8px`;
      return `<div class="b" style="${pos(e.x, e.y, e.w, e.h)};${st}"></div>`;
    }
    case "marker":
      return `<div class="m" style="${pos(e.x, e.y, e.d, e.d)};font-size:${Math.round(e.d * 0.55)}px">${esc(e.label)}</div>`;
    case "image":
      return `<div class="img" style="${pos(e.x, e.y, e.w, e.h)}${e.bg ? ";border-radius:0" : ""}"><span>Photo: ${esc(e.query)}</span></div>`;
    case "icon":
      return `<div class="ico" style="${pos(e.x, e.y, e.w, e.h)}"><span>${esc(e.name)}</span></div>`;
    case "formula":
      return `<div class="fx" data-latex="${esc(e.latex)}" style="${pos(e.x, e.y, e.w, e.h)}"><span>${esc(e.latex)}</span></div>`;
    case "code":
      return `<pre class="code t" data-path="code" style="${pos(e.x, e.y, e.w, e.h)};font-size:${e.size}px;line-height:${LINE_HEIGHT}">${esc(e.code)}</pre>`;
    case "diagram": {
      if (e.geom) return diagramSVG(e.geom, e);
      const d = e.data as Record<string, any>;
      const n = Object.values(d).reduce((s: number, v: any) => s + (Array.isArray(v) ? v.length : v ? 1 : 0), 0);
      return `<div class="dia" style="${pos(e.x, e.y, e.w, e.h)}"><span>${esc(e.kind)} diagram · ${n} nodes · could not be drawn</span></div>`;
    }
    case "connector": return "";
  }
}

export function slideHTML(p: Placement, label = ""): string {
  const lines = p.elements.filter(e => e.t === "connector") as Extract<El, { t: "connector" }>[];
  const svg = lines.length ? `<svg class="cn" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${THEME.muted}"/></marker></defs>${lines.map(c => `<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="${THEME.muted}" stroke-width="4" ${c.arrow ? 'marker-end="url(#ah)"' : 'stroke-dasharray="6 10"'}/>`).join("")}</svg>` : "";
  // text inside a toned card inherits the card's ink
  const cards = p.elements.filter(e => e.t === "box" && e.style === "card" && e.tone && e.tone !== "inverse") as Extract<El, { t: "box" }>[];
  const toneAt = (e: El) => e.t === "text" && e.path !== "label"
    ? cards.find(c => e.x >= c.x && e.y >= c.y && e.x + e.w <= c.x + c.w + 1 && e.y + e.h <= c.y + c.h + 1)?.tone : undefined;
  const body = p.elements.map(e => el(e, toneAt(e))).join("");
  const part = p.part ? `<div class="part">${p.part.index}/${p.part.of}</div>` : "";
  return `<section class="slide" data-layout="${p.layoutId}" data-label="${esc(label)}">${svg}${body}${part}</section>`;
}

export const SLIDE_CSS = `
.slide{position:relative;width:${CANVAS.w}px;height:${CANVAS.h}px;background:${THEME.bg};overflow:hidden;font-family:${DECK_FONT},"Liberation Sans",Helvetica,sans-serif;color:${THEME.ink}}
.slide>*{position:absolute;box-sizing:border-box;margin:0}
.slide .t{overflow:hidden;white-space:normal;overflow-wrap:normal;word-break:normal}
.slide .cn{left:0;top:0;width:100%;height:100%}
.slide .m{display:flex;align-items:center;justify-content:center;border-radius:50%;background:${THEME.ink};color:#fff;font-weight:700}
.slide .img{background:repeating-linear-gradient(135deg,#F0EAE0 0 18px,#E8E0D3 18px 36px);border-radius:18px;display:flex;align-items:flex-end}
.slide .img span,.slide .ico span,.slide .dia span{font-size:20px;color:${THEME.muted};padding:14px 18px}
.slide .ico{border-radius:50%;background:${THEME.accentBg};display:flex;align-items:center;justify-content:center}
.slide .fx{display:flex;align-items:center;justify-content:center;font-size:44px;color:${THEME.accent};overflow:hidden}
.slide .fx span{font-family:"Times New Roman","Liberation Serif",serif;font-style:italic;padding:0}
.slide .dia{border:3px dashed ${THEME.line};border-radius:18px;display:flex;align-items:center;justify-content:center}
.slide .dg{overflow:visible}
.slide .code{background:${THEME.code};color:${THEME.codeInk};border-radius:18px;padding:20px;font-family:"Courier New","Liberation Mono",monospace;white-space:pre;overflow:hidden}
.slide .part{right:${96}px;bottom:28px;font-size:20px;color:${THEME.muted}}
`;
