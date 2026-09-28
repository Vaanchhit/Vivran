// ─────────────────────────────────────────────────────────────
// Renderer: placements → absolutely positioned HTML. It draws only
// what the matcher decided; it makes no layout decisions of its own.
// The PPTX exporter reads the same elements.
// ─────────────────────────────────────────────────────────────
import type { DiagramGeom, DiaFill, DiaStroke } from "./diagram";
import type { El, Placement } from "./matcher";
import { BOLD_ROLES, CANVAS, DECK_FONT, LINE_HEIGHT } from "./tokens";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface DeckTheme {
  bg: string; ink: string; muted: string; line: string; card: string;
  accent: string; accentBg: string;
  positive: string; positiveBg: string; negative: string; negativeBg: string;
  header: string; chip: string; code: string; codeInk: string;
}

/** Preset themes. Chosen by the teacher, never by the model, and applied at
 *  render time, so switching theme never regenerates content. */
export const THEMES: Record<string, { name: string; dark: boolean; theme: DeckTheme }> = {
  paper: { name: "Vivran Paper", dark: false, theme: {
    bg: "#FBF8F3", ink: "#1D1813", muted: "#6B6258", line: "#E2DBCF", card: "#F3EEE5", accent: "#B8461F", accentBg: "#F7E6DD",
    positive: "#1A7F5A", positiveBg: "#E3F1EA", negative: "#B3341A", negativeBg: "#F8E4DF",
    header: "#EDE6DA", chip: "#F0EAE0", code: "#1E1A16", codeInk: "#EDE6DA" } },
  classic: { name: "Classic Blue", dark: false, theme: {
    bg: "#FFFFFF", ink: "#17233A", muted: "#5B6B80", line: "#D5DCE6", card: "#F3F6FA", accent: "#2F5BD3", accentBg: "#EAF0FD",
    positive: "#1F7A4D", positiveBg: "#E6F4EC", negative: "#B23A33", negativeBg: "#FBEAEA",
    header: "#E8EDF5", chip: "#EEF1F6", code: "#0F1B2D", codeInk: "#E3EAF5" } },
  chalkboard: { name: "Chalkboard", dark: true, theme: {
    bg: "#1F2B26", ink: "#F1EFE8", muted: "#A9B2AB", line: "#3A4A43", card: "#26352F", accent: "#F2A07B", accentBg: "#3B3129",
    positive: "#8FD6AE", positiveBg: "#24403A", negative: "#F3877B", negativeBg: "#43302E",
    header: "#2C3B35", chip: "#2C3B35", code: "#111915", codeInk: "#E8EFE9" } },
  forest: { name: "Forest", dark: false, theme: {
    bg: "#FAFBF7", ink: "#1A2A1F", muted: "#5E6B61", line: "#D8E0D6", card: "#EEF3EC", accent: "#2E7D4F", accentBg: "#E1F0E6",
    positive: "#2E7D4F", positiveBg: "#E1F0E6", negative: "#B3341A", negativeBg: "#F8E4DF",
    header: "#E4ECE2", chip: "#E9EFE7", code: "#13201A", codeInk: "#E3EDE6" } },
  ocean: { name: "Ocean", dark: false, theme: {
    bg: "#F7FBFC", ink: "#10263A", muted: "#56707F", line: "#D3E3EA", card: "#EAF4F7", accent: "#0E7C86", accentBg: "#DDF1F2",
    positive: "#1F7A4D", positiveBg: "#E3F2EA", negative: "#B23A33", negativeBg: "#FBEAEA",
    header: "#E1EEF2", chip: "#E6F1F4", code: "#0C1E2B", codeInk: "#DCEBF2" } },
  midnight: { name: "Midnight", dark: true, theme: {
    bg: "#121826", ink: "#EEF1F7", muted: "#9AA4B8", line: "#2A3348", card: "#1A2233", accent: "#F5B942", accentBg: "#3A3222",
    positive: "#6FD3A0", positiveBg: "#1F3A31", negative: "#F4877E", negativeBg: "#43282A",
    header: "#202A3D", chip: "#202A3D", code: "#0B1019", codeInk: "#E3E8F2" } },
};
export const DEFAULT_THEME_ID = "paper";
export const THEME: DeckTheme = THEMES[DEFAULT_THEME_ID].theme;

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** A teacher-picked accent on a light or dark base. Accent text appears on
 *  the background and on its own tint, so the accent is nudged toward the ink
 *  until both read (4.5:1 on the background, 3:1 on the tint). */
export function customTheme(accentHex: string, dark: boolean): DeckTheme {
  const base = THEMES[dark ? "midnight" : "paper"].theme;
  let accent = /^#[0-9a-f]{6}$/i.test(accentHex) ? accentHex.toUpperCase() : base.accent;
  const tint = (a: string) => mix(base.bg, a, dark ? 0.2 : 0.12);
  for (let i = 0; i < 20 && (contrast(accent, base.bg) < 4.5 || contrast(accent, tint(accent)) < 3); i++) accent = mix(accent, base.ink, 0.12);
  return { ...base, accent, accentBg: tint(accent) };
}

const toneInk = (T: DeckTheme, t?: string) => t === "accent" ? T.accent : t === "positive" ? T.positive : t === "negative" ? T.negative
  : t === "muted" ? T.muted : t === "inverse" ? "#FFFFFF" : T.ink;
const toneBg = (T: DeckTheme, t?: string) => t === "accent" ? T.accentBg : t === "positive" ? T.positiveBg : t === "negative" ? T.negativeBg
  : T.card;

const diaFill = (T: DeckTheme, f: DiaFill) => f === "card" ? T.card : f === "accent" ? T.accentBg : f === "positive" ? T.positiveBg
  : f === "header" ? T.header : "none";
const diaStroke = (T: DeckTheme, s: DiaStroke) => s === "none" ? "none" : s === "neutral" ? T.line : toneInk(T, s);

/**
 * Real <svg> with real <text>: print-to-PDF keeps every word selectable and
 * searchable. The lines were wrapped by diagram.ts, because SVG text does not wrap.
 */
function diagramSVG(T: DeckTheme, gm: DiagramGeom, box: { x: number; y: number; w: number; h: number }): string {
  const body = gm.shapes.map(s => {
    if (s.s === "line")
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${T.muted}" stroke-width="3" stroke-linecap="round"${s.dash ? ' stroke-dasharray="6 10"' : ""}${s.arrow ? ' marker-end="url(#dah)"' : ""}/>`;
    const fill = diaFill(T, s.fill), stroke = diaStroke(T, s.stroke);
    const paint = `fill="${fill}"${fill !== "none" && s.transparency ? ` fill-opacity="${(100 - s.transparency) / 100}"` : ""}`
      + (stroke === "none" ? "" : ` stroke="${stroke}" stroke-width="3"`);
    if (s.s === "diamond") {
      const mx = s.x + s.w / 2, my = s.y + s.h / 2;
      return `<polygon points="${mx},${s.y} ${s.x + s.w},${my} ${mx},${s.y + s.h} ${s.x},${my}" ${paint} stroke-linejoin="round"/>`;
    }
    return s.s === "ellipse"
      ? `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" ${paint}/>`
      : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" ${paint}/>`;
  }).join("");
  const text = gm.labels.map(l => {
    const lh = l.size * LINE_HEIGHT;
    const x = l.align === "center" ? l.x + l.w / 2 : l.x;
    const spans = l.lines.map((ln, i) =>
      `<tspan x="${x}" y="${(l.y + i * lh + lh / 2).toFixed(2)}">${esc(ln)}</tspan>`).join("");
    return `<text data-path="${esc(l.path)}" font-size="${l.size}" font-weight="${BOLD_ROLES.has(l.role) ? 700 : 400}" fill="${toneInk(T, l.tone)}" text-anchor="${l.align === "center" ? "middle" : "start"}" dominant-baseline="central">${spans}</text>`;
  }).join("");
  return `<svg class="dg" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">`
    + `<defs><marker id="dah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${T.muted}"/></marker></defs>`
    + `${body}${text}</svg>`;
}

function el(T: DeckTheme, e: El, cardTone: string | undefined): string {
  const pos = (x: number, y: number, w: number, h: number) => `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  switch (e.t) {
    case "text": {
      const ink = toneInk(T, e.tone ?? cardTone);
      return `<div class="t" data-path="${esc(e.path)}" data-size="${e.size}" style="${pos(e.x, e.y, e.w, e.h)};font-size:${e.size}px;line-height:${LINE_HEIGHT};font-weight:${BOLD_ROLES.has(e.role) ? 700 : 400};color:${ink};text-align:${e.align === "center" ? "center" : "left"}${e.strike ? ";text-decoration:line-through" : ""}">${esc(e.text)}</div>`;
    }
    case "box": {
      if (e.tone === "inverse") return `<div class="b" style="${pos(e.x, e.y, e.w, e.h)};background:linear-gradient(90deg,rgba(29,24,19,.84),rgba(29,24,19,.34))"></div>`;
      const st = e.style === "card" ? `background:${toneBg(T, e.tone)};border-radius:18px${e.tone && e.tone !== "muted" && e.tone !== "neutral" ? `;border:3px solid ${toneInk(T, e.tone)}` : ""}`
        : e.style === "header" ? `background:${T.header};border-radius:8px`
        : e.style === "chip" ? `background:${T.chip};border-radius:999px`
        : `background:${T.bg};border:2px solid ${T.line};border-radius:8px`;
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
      if (e.geom) return diagramSVG(T, e.geom, e);
      const d = e.data as Record<string, any>;
      const n = Object.values(d).reduce((s: number, v: any) => s + (Array.isArray(v) ? v.length : v ? 1 : 0), 0);
      return `<div class="dia" style="${pos(e.x, e.y, e.w, e.h)}"><span>${esc(e.kind)} diagram · ${n} nodes · could not be drawn</span></div>`;
    }
    case "connector": return "";
  }
}

export function slideHTML(p: Placement, label = "", T: DeckTheme = THEME): string {
  const lines = p.elements.filter(e => e.t === "connector") as Extract<El, { t: "connector" }>[];
  const svg = lines.length ? `<svg class="cn" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${T.muted}"/></marker></defs>${lines.map(c => `<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="${T.muted}" stroke-width="4" ${c.arrow ? 'marker-end="url(#ah)"' : 'stroke-dasharray="6 10"'}/>`).join("")}</svg>` : "";
  // text inside a toned card inherits the card's ink
  const cards = p.elements.filter(e => e.t === "box" && e.style === "card" && e.tone && e.tone !== "inverse") as Extract<El, { t: "box" }>[];
  const toneAt = (e: El) => e.t === "text" && e.path !== "label"
    ? cards.find(c => e.x >= c.x && e.y >= c.y && e.x + e.w <= c.x + c.w + 1 && e.y + e.h <= c.y + c.h + 1)?.tone : undefined;
  const body = p.elements.map(e => el(T, e, toneAt(e))).join("");
  const part = p.part ? `<div class="part">${p.part.index}/${p.part.of}</div>` : "";
  return `<section class="slide" data-layout="${p.layoutId}" data-label="${esc(label)}">${svg}${body}${part}</section>`;
}

export const slideCSS = (T: DeckTheme = THEME) => `
.slide{position:relative;width:${CANVAS.w}px;height:${CANVAS.h}px;background:${T.bg};overflow:hidden;font-family:${DECK_FONT},"Liberation Sans",Helvetica,sans-serif;color:${T.ink}}
.slide>*{position:absolute;box-sizing:border-box;margin:0}
.slide .t{overflow:hidden;white-space:normal;overflow-wrap:normal;word-break:normal}
.slide .cn{left:0;top:0;width:100%;height:100%}
.slide .m{display:flex;align-items:center;justify-content:center;border-radius:50%;background:${T.ink};color:${T.bg};font-weight:700}
.slide .img{background:repeating-linear-gradient(135deg,${T.card} 0 18px,${T.line} 18px 36px);border-radius:18px;display:flex;align-items:flex-end}
.slide .img span,.slide .ico span,.slide .dia span{font-size:20px;color:${T.muted};padding:14px 18px}
.slide .ico{border-radius:50%;background:${T.accentBg};display:flex;align-items:center;justify-content:center}
.slide .fx{display:flex;align-items:center;justify-content:center;font-size:44px;color:${T.accent};overflow:hidden}
.slide .fx span{font-family:"Times New Roman","Liberation Serif",serif;font-style:italic;padding:0}
.slide .dia{border:3px dashed ${T.line};border-radius:18px;display:flex;align-items:center;justify-content:center}
.slide .dg{overflow:visible}
.slide .code{background:${T.code};color:${T.codeInk};border-radius:18px;padding:20px;font-family:"Courier New","Liberation Mono",monospace;white-space:pre;overflow:hidden}
.slide .part{right:${96}px;bottom:28px;font-size:20px;color:${T.muted}}
`;

export const SLIDE_CSS = slideCSS();
