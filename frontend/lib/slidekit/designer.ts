// ─────────────────────────────────────────────────────────────
// Designer PowerPoint export. The five showcase lessons (tools/showcase) are
// the templates: same palettes, same compositions (photo-free cover, icon rows,
// step cards, comparison tables, timeline, quiz grid, recap, code panels).
// Every Vivran block maps to one of them, so a generated deck downloads as a
// classroom-designed, fully editable .pptx.
//
// Runs in the browser (download) or in Node (tests). Icons are drawn to PNG
// through a canvas in the browser; in Node they fall back to plain shapes.
// ─────────────────────────────────────────────────────────────
import pptxgen from "pptxgenjs";
import type { Block } from "./blocks";
import type { Placement } from "./matcher";

const W = 13.333, H = 7.5, M = 0.6;

export interface Design {
  id: string; name: string; head: string; body: string;
  bg: string; ink: string; muted: string; primary: string; accent: string; accentInk: string; tint: string; line: string;
  dark: string; darkCard: string; second: string; secondTint: string; codeBg: string; codeInk: string;
}

/** The showcase decks' palettes, by name. */
export const DESIGNS: Record<string, Design> = {
  forest: { id: "forest", name: "Forest", head: "Arial", body: "Calibri", bg: "FFFFFF", ink: "17301F", muted: "51645A", primary: "2E7D4F", accent: "F2C14E", accentInk: "B8860B", tint: "E7F3EA", line: "D5E6DA", dark: "0F2A1B", darkCard: "1B3D2A", second: "B8860B", secondTint: "FFF6DC", codeBg: "0F2A1B", codeInk: "E7F3EA" },
  revolution: { id: "revolution", name: "Revolution", head: "Cambria", body: "Calibri", bg: "FFFFFF", ink: "1B1F3B", muted: "5A5F78", primary: "9E2A2B", accent: "D4AF37", accentInk: "9E2A2B", tint: "F4EAEA", line: "E6D3D3", dark: "14172E", darkCard: "232848", second: "1B1F3B", secondTint: "ECEDF3", codeBg: "14172E", codeInk: "FFFFFF" },
  cells: { id: "cells", name: "Cells", head: "Arial", body: "Calibri", bg: "FFFFFF", ink: "13293D", muted: "52657A", primary: "0F8B8D", accent: "7FD6D0", accentInk: "0F8B8D", tint: "E3F4F4", line: "CFE8E8", dark: "0E2433", darkCard: "18374B", second: "6A4C9C", secondTint: "EEE8F6", codeBg: "0E2433", codeInk: "FFFFFF" },
  market: { id: "market", name: "Market", head: "Arial", body: "Calibri", bg: "FFFFFF", ink: "1F2A55", muted: "58618A", primary: "E2574C", accent: "F5C451", accentInk: "C0392B", tint: "FDECEA", line: "F3D3CF", dark: "1F2A55", darkCard: "2D3A70", second: "2F5DA8", secondTint: "E8EEF8", codeBg: "1F2A55", codeInk: "FFFFFF" },
  code: { id: "code", name: "Code", head: "Arial", body: "Calibri", bg: "FFFFFF", ink: "0D1B2A", muted: "4F5D6E", primary: "2F6DB5", accent: "FFD43B", accentInk: "2F6DB5", tint: "E8F0FA", line: "D3E0F0", dark: "0D1117", darkCard: "1A2230", second: "1A7F5A", secondTint: "E6F4EC", codeBg: "0D1117", codeInk: "E6EDF3" },
};

/** Pick the showcase design that fits a subject (the teacher can switch it). */
export function designFor(subject: string): Design {
  const s = subject.toLowerCase();
  if (/(computer|computing|program|python|code)/.test(s)) return DESIGNS.code;
  if (/(bio|medic|health|psych)/.test(s)) return DESIGNS.cells;
  if (/(econ|commerce|account|business|finance|math|physics|engineer|statistic)/.test(s)) return DESIGNS.market;
  if (/(history|civics|polit|geograph|law|literature|english|language|philosoph|sociolog|art|music|media)/.test(s)) return DESIGNS.revolution;
  return DESIGNS.forest; // science, chemistry, general
}

// ── text helpers ────────────────────────────────────────────
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
/** Font size that keeps long text inside its box: start at `base`, step down with length, never below `min`. */
const fit = (t: string, base: number, min: number, room: number) => Math.max(min, Math.min(base, Math.round(base * Math.sqrt(room / Math.max(room, t.length)))));
type S = pptxgen.Slide;
type TextOpts = pptxgen.TextPropsOptions;
const txt = (s: S, t: string | pptxgen.TextProps[], o: TextOpts) => s.addText(t as never, { isTextBox: true, margin: 0, valign: "top", ...o });
const shadow = (): pptxgen.ShadowProps => ({ type: "outer", color: "000000", opacity: 0.12, blur: 8, offset: 2, angle: 90 });

/** LaTeX to readable Unicode for an editable text box (PowerPoint has no LaTeX). */
export function latexToText(l: string): string {
  const SYM: Record<string, string> = { Rightarrow: "⇒", rightarrow: "→", to: "→", leftarrow: "←", times: "×", cdot: "·", div: "÷", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠", approx: "≈",
    infty: "∞", sum: "Σ", int: "∫", partial: "∂", Delta: "Δ", delta: "δ", alpha: "α", beta: "β", gamma: "γ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", omega: "ω", Omega: "Ω", phi: "φ", epsilon: "ε", quad: "  ", ",": " " };
  const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "+": "⁺", n: "ⁿ" };
  const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", m: "ₘ", n: "ₙ", o: "ₒ", r: "ᵣ", t: "ₜ", x: "ₓ" };
  let t = l;
  t = t.replace(/\\(bar|overline)\{([^{}]*)\}/g, (m, c, v) => v + "\u0304").replace(/\\hat\{([^{}]*)\}/g, (m, v) => v + "\u0302");
  // innermost first: each pass resolves commands whose arguments hold no braces
  for (let k = 0; k < 4; k++) t = t.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)").replace(/\\(?:d|t)?frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  t = t.replace(/\\(text|mathrm|operatorname|mathbf)\{([^{}]*)\}/g, "$2").replace(/\\(left|right|displaystyle)/g, "");
  t = t.replace(/\\([a-zA-Z]+|,)/g, (m, n) => SYM[n] ?? "");
  t = t.replace(/\^\{([^{}]*)\}|\^(.)/g, (m, a, b) => [...(a ?? b)].map((c: string) => SUP[c] ?? c).join(""));
  t = t.replace(/_\{([^{}]*)\}|_(.)/g, (m, a, b) => [...(a ?? b)].map((c: string) => SUB[c] ?? c).join(""));
  return t.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

// ── icons (browser: canvas → PNG; elsewhere: none) ──────────
type IconFn = (name: string, color: string) => Promise<string | null>;
const ICON_PATHS: Record<string, string> = {
  // 24×24 stroke paths (lucide geometry), enough to signal each slide's job
  target: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 4a6 6 0 1 0 0 12 6 6 0 1 0 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 1 0 0-4z",
  check: "M20 6 9 17l-5-5",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM20 17v5H6.5A2.5 2.5 0 0 1 4 19.5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  x: "M18 6 6 18M6 6l12 12",
  people: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM12 6v6l4 2",
};
const browserIcon: IconFn = async (name, color) => {
  if (typeof document === "undefined" || !ICON_PATHS[name]) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" fill="none" stroke="#${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[name]}"/></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise((r) => { img.onload = r; img.onerror = r; });
  const c = document.createElement("canvas"); c.width = c.height = 256;
  c.getContext("2d")?.drawImage(img, 0, 0, 256, 256);
  return c.toDataURL("image/png").replace(/^data:/, "");
};

// ── the builder ─────────────────────────────────────────────
class Builder {
  constructor(public pres: pptxgen, public D: Design, public icon: IconFn, public meta: { title: string; level: string; subject: string }) {}

  content(title: string) {
    const s = this.pres.addSlide({ masterName: "Content" });
    s.addText(title, { placeholder: "title" });
    return s;
  }
  dark(title?: string) {
    const s = this.pres.addSlide({ masterName: "Dark" });
    if (title) s.addText(title, { placeholder: "title" });
    return s;
  }
  async iconAt(s: S, name: string, x: number, y: number, d: number, fill: string, color = "FFFFFF") {
    s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" } });
    const png = await this.icon(name, color);
    if (png) s.addImage({ data: png, x: x + d * 0.25, y: y + d * 0.25, w: d * 0.5, h: d * 0.5 });
  }

  cover(title: string, subtitle?: string) {
    const D = this.D, s = this.pres.addSlide({ masterName: "Blank" });
    s.background = { color: D.dark };
    // the showcase covers' depth, without a photo: two soft discs
    s.addShape("ellipse", { x: W - 5.6, y: -1.6, w: 7, h: 7, fill: { color: D.darkCard }, line: { type: "none" } });
    s.addShape("ellipse", { x: W - 3.2, y: 3.9, w: 4.4, h: 4.4, fill: { color: D.primary, transparency: 55 }, line: { type: "none" } });
    txt(s, `${this.meta.level} · ${this.meta.subject}`.toUpperCase(), { x: M + 0.1, y: 2.2, w: 7.5, h: 0.4, fontSize: 14, bold: true, color: D.accent, charSpacing: 3, fontFace: D.body });
    txt(s, title, { x: M + 0.1, y: 2.65, w: 8.4, h: 1.9, fontSize: fit(title, 54, 34, 28), bold: true, color: "FFFFFF", fontFace: D.head, valign: "bottom" });
    if (subtitle) txt(s, subtitle, { x: M + 0.1, y: 4.7, w: 7.6, h: 1.0, fontSize: 20, color: "E9ECEF", fontFace: D.body });
    return s;
  }

  async rows(title: string, rows: { head: string; body?: string; icon?: string }[]) {
    const D = this.D, s = this.content(title);
    const n = rows.length, gap = 0.15, top = 1.65, rowH = Math.min(1.35, (H - top - 0.8 - gap * (n - 1)) / n);
    for (const [i, r] of rows.entries()) {
      const y = top + i * (rowH + gap), d = Math.min(0.9, rowH - 0.2);
      if (r.icon) await this.iconAt(s, r.icon, M, y + 0.08, d, D.tint, D.primary);
      else {
        s.addShape("ellipse", { x: M, y: y + 0.08, w: d, h: d, fill: { color: D.tint }, line: { type: "none" } });
        txt(s, String(i + 1), { x: M, y: y + 0.08, w: d, h: d, fontSize: 20, bold: true, color: D.primary, align: "center", valign: "middle", fontFace: D.head });
      }
      txt(s, r.head, { x: M + d + 0.35, y: y + 0.05, w: W - 2 * M - d - 0.35, h: r.body ? rowH * 0.45 : rowH - 0.1, fontSize: fit(r.head, r.body ? 21 : 20, 15, 70), bold: !!r.body, color: D.ink, fontFace: r.body ? D.head : D.body, valign: r.body ? "top" : "middle" });
      if (r.body) txt(s, r.body, { x: M + d + 0.35, y: y + rowH * 0.45, w: W - 2 * M - d - 0.35, h: rowH * 0.55, fontSize: fit(r.body, 16, 13, 110), color: D.muted, fontFace: D.body });
    }
    return s;
  }

  async steps(title: string, steps: { head: string; body?: string }[], foot?: string) {
    const D = this.D, s = this.content(title);
    const n = Math.min(steps.length, 6), gap = 0.3, cw = (W - 2 * M - gap * (n - 1)) / n, y = 1.75, ch = 3.6;
    for (const [i, st] of steps.slice(0, 6).entries()) {
      const x = M + i * (cw + gap);
      s.addShape("roundRect", { x, y, w: cw, h: ch, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: D.line, width: 1 }, shadow: shadow() });
      s.addShape("ellipse", { x: x + 0.28, y: y + 0.28, w: 0.75, h: 0.75, fill: { color: D.primary }, line: { type: "none" } });
      txt(s, String(i + 1), { x: x + 0.28, y: y + 0.28, w: 0.75, h: 0.75, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: D.head });
      txt(s, st.head, { x: x + 0.28, y: y + 1.25, w: cw - 0.5, h: 1.0, fontSize: fit(st.head, n > 4 ? 16 : 18, 12, 30), bold: true, color: D.ink, fontFace: D.head });
      if (st.body) txt(s, st.body, { x: x + 0.28, y: y + 2.25, w: cw - 0.5, h: 1.25, fontSize: fit(st.body, 13, 10, 70), color: D.muted, fontFace: D.body });
      if (i < n - 1) s.addShape("rightArrow", { x: x + cw + 0.04, y: y + ch / 2 - 0.13, w: 0.22, h: 0.26, fill: { color: D.primary }, line: { type: "none" } });
    }
    if (foot) txt(s, foot, { x: M, y: y + ch + 0.3, w: W - 2 * M, h: 0.5, fontSize: 15, italic: true, color: D.muted, fontFace: D.body });
    return s;
  }

  async columns(title: string, cols: { head: string; sub?: string; items: string[]; color?: string; fill?: string; icon?: string; center?: boolean }[], foot?: string) {
    const D = this.D, s = this.content(title);
    const n = cols.length, gap = 0.35, cw = (W - 2 * M - gap * (n - 1)) / n, y = 1.7;
    const need = Math.max(...cols.map((c) => c.items.reduce((a, t) => a + (t.length > (n > 2 ? 34 : 52) ? 0.78 : 0.48), 0)));
    const ch = Math.min(4.6, Math.max(2.6, 1.6 + need + 0.3));
    for (const [i, c] of cols.entries()) {
      const x = M + i * (cw + gap), col = c.color ?? D.primary;
      s.addShape("roundRect", { x, y, w: cw, h: ch, rectRadius: 0.1, fill: { color: c.fill ?? D.tint }, line: { type: "none" } });
      if (c.center) { // a single statement in the middle of the card (the event in cause → event → effects)
        txt(s, c.head, { x: x + 0.3, y, w: cw - 0.6, h: ch, fontSize: fit(c.head, 24, 16, 40), bold: true, color: col, align: "center", valign: "middle", fontFace: D.head });
        continue;
      }
      let tx = x + 0.32;
      if (c.icon) { await this.iconAt(s, c.icon, x + 0.32, y + 0.32, 0.75, col); tx = x + 1.25; }
      txt(s, c.head, { x: tx, y: y + 0.32, w: x + cw - tx - 0.25, h: 0.55, fontSize: fit(c.head, 21, 15, 22), bold: true, color: col, fontFace: D.head });
      if (c.sub) txt(s, c.sub, { x: tx, y: y + 0.82, w: x + cw - tx - 0.25, h: 0.4, fontSize: 13, color: D.muted, fontFace: D.body });
      const total = c.items.join(" ").length;
      txt(s, c.items.map((t, k) => ({ text: t, options: { bullet: { indent: 15 }, breakLine: k < c.items.length - 1 } })),
        { x: x + 0.32, y: y + 1.35, w: cw - 0.64, h: ch - 1.5, fontSize: fit(c.items.join(" "), 16, 11, n > 2 ? 150 : 230) - (total > 300 ? 1 : 0), color: D.ink, fontFace: D.body, paraSpaceAfter: 8 });
    }
    if (foot) txt(s, foot, { x: M, y: y + ch + 0.25, w: W - 2 * M, h: 0.6, fontSize: fit(foot, 15, 12, 140), italic: true, color: D.muted, fontFace: D.body });
    return s;
  }

  table(title: string, header: string[], rows: string[][], foot?: string) {
    const D = this.D, s = this.content(title);
    const long = rows.flat().join("").length > 500;
    const head = header.map((h, i) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: i === 0 ? D.ink : i % 2 ? D.primary : D.second }, fontSize: long ? 14 : 16, fontFace: D.head } }));
    const body = rows.map((r, ri) => r.map((c, i) => ({ text: c, options: { bold: i === 0, color: D.ink, fontSize: long ? 12 : 14, fontFace: D.body, fill: { color: ri % 2 ? "FFFFFF" : D.tint } } })));
    const first = 3.0, rest = (W - 2 * M - first) / Math.max(1, header.length - 1);
    s.addTable([head, ...body] as never, { x: M, y: 1.65, w: W - 2 * M, colW: [first, ...Array(header.length - 1).fill(rest)], border: { type: "solid", color: "FFFFFF", pt: 2 }, valign: "middle", margin: 0.1 });
    if (foot) txt(s, foot, { x: M, y: 6.5, w: W - 2 * M, h: 0.4, fontSize: 13, italic: true, color: D.muted, fontFace: D.body });
    return s;
  }

  bigIdea(kicker: string, big: string, body?: string) {
    const D = this.D, s = this.dark();
    txt(s, kicker.toUpperCase(), { x: M, y: 1.3, w: W - 2 * M, h: 0.4, fontSize: 14, bold: true, color: D.accent, charSpacing: 3, fontFace: D.body });
    txt(s, big, { x: M, y: 1.8, w: W - 2 * M - 0.8, h: 2.3, fontSize: fit(big, 42, 26, 70), bold: true, color: "FFFFFF", fontFace: D.head });
    if (body) {
      s.addShape("rect", { x: M, y: 4.3, w: 0.9, h: 0.06, fill: { color: D.accent }, line: { type: "none" } });
      txt(s, body, { x: M, y: 4.6, w: 9.6, h: 1.9, fontSize: fit(body, 19, 13, 220), color: "D7DCE3", fontFace: D.body });
    }
    return s;
  }

  timeline(title: string, events: { date: string; label: string }[]) {
    const D = this.D, s = this.content(title);
    const y0 = 4.05, x0 = M + 0.9, x1 = W - M - 0.9, n = events.length, step = (x1 - x0) / Math.max(1, n - 1), cw = Math.min(2.2, step * 1.9);
    s.addShape("line", { x: x0, y: y0, w: x1 - x0, h: 0, line: { color: D.ink, width: 2 } });
    events.forEach((e, i) => {
      const x = n === 1 ? (x0 + x1) / 2 : x0 + i * step, up = i % 2 === 0;
      s.addShape("ellipse", { x: x - 0.13, y: y0 - 0.13, w: 0.26, h: 0.26, fill: { color: "FFFFFF" }, line: { color: D.primary, width: 2.5 } });
      s.addShape("line", { x, y: up ? y0 - 0.75 : y0 + 0.13, w: 0, h: 0.62, line: { color: D.line, width: 1.25 } });
      const ty = up ? y0 - 2.35 : y0 + 0.8;
      txt(s, e.date, { x: x - cw / 2, y: ty, w: cw, h: 0.4, fontSize: 15, bold: true, color: D.primary, align: "center", fontFace: D.head });
      txt(s, e.label, { x: x - cw / 2, y: ty + 0.4, w: cw, h: 1.2, fontSize: fit(e.label, 13.5, 10.5, 40), color: D.ink, align: "center", fontFace: D.body });
    });
    return s;
  }

  quiz(q: string, options: string[], answer: number, why: string) {
    const D = this.D, s = this.content("Quick check");
    txt(s, q, { x: M, y: 1.45, w: W - 2 * M, h: 1.2, fontSize: fit(q, 26, 18, 90), color: D.ink, fontFace: D.head, valign: "middle" });
    const gw = (W - 2 * M - 0.4) / 2, gh = 1.4;
    options.forEach((o, i) => {
      const x = M + (i % 2) * (gw + 0.4), y = 2.9 + Math.floor(i / 2) * (gh + 0.3);
      s.addShape("roundRect", { x, y, w: gw, h: gh, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: D.line, width: 1.25 }, shadow: shadow() });
      s.addShape("ellipse", { x: x + 0.3, y: y + 0.37, w: 0.66, h: 0.66, fill: { color: D.primary }, line: { type: "none" } });
      txt(s, "ABCD"[i], { x: x + 0.3, y: y + 0.37, w: 0.66, h: 0.66, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: D.body });
      txt(s, o, { x: x + 1.2, y: y + 0.2, w: gw - 1.45, h: gh - 0.4, fontSize: fit(o, 20, 13, 40), color: D.ink, valign: "middle", fontFace: D.body });
    });
    s.addNotes(`Answer: ${"ABCD"[answer]}. ${options[answer]}. ${why}`);
    return s;
  }

  recap(title: string, items: string[]) {
    const D = this.D, s = this.dark(title);
    const n = Math.min(items.length, 5), gap = 0.3, cw = (W - 2 * M - gap * (n - 1)) / n;
    items.slice(0, 5).forEach((t, i) => {
      const x = M + i * (cw + gap);
      s.addShape("roundRect", { x, y: 1.85, w: cw, h: 3.0, rectRadius: 0.1, fill: { color: D.darkCard }, line: { type: "none" } });
      txt(s, String(i + 1), { x: x + 0.32, y: 2.1, w: 1, h: 0.8, fontSize: 40, bold: true, color: D.accent, fontFace: D.head });
      txt(s, t, { x: x + 0.32, y: 3.0, w: cw - 0.6, h: 1.75, fontSize: fit(t, 18, 12, 55), color: "FFFFFF", fontFace: D.body });
    });
    return s;
  }

  code(title: string, code: string, caption?: string, notes?: string[]) {
    const D = this.D, s = this.content(title);
    const lines = code.split("\n").slice(0, 16), cw = notes?.length ? 7.4 : W - 2 * M, h = Math.min(4.9, 0.6 + lines.length * 0.32);
    s.addShape("roundRect", { x: M, y: 1.65, w: cw, h, rectRadius: 0.08, fill: { color: D.codeBg }, line: { type: "none" } });
    txt(s, lines.join("\n"), { x: M + 0.3, y: 1.9, w: cw - 0.6, h: h - 0.4, fontSize: lines.length > 12 ? 14 : 17, color: D.codeInk, fontFace: "Courier New" });
    if (caption) txt(s, caption, { x: M, y: 1.65 + h + 0.2, w: cw, h: 0.6, fontSize: 15, color: D.muted, fontFace: D.body });
    let y = 1.7;
    for (const n of notes ?? []) {
      s.addShape("roundRect", { x: M + cw + 0.35, y, w: W - 2 * M - cw - 0.35, h: 1.1, rectRadius: 0.08, fill: { color: D.tint }, line: { type: "none" } });
      txt(s, n, { x: M + cw + 0.55, y: y + 0.12, w: W - 2 * M - cw - 0.75, h: 0.9, fontSize: fit(n, 14, 11, 90), color: D.ink, fontFace: D.body, valign: "middle" });
      y += 1.25;
    }
    return s;
  }

  async picture(title: string, src: string | undefined, takeaway: string) {
    const D = this.D, s = this.content(title);
    if (src) {
      try {
        const href = typeof location !== "undefined" ? new URL(src, location.origin).href : src;
        const blob = await (await fetch(href)).blob();
        const data = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(blob); });
        s.addImage({ data: data.replace(/^data:/, ""), x: M, y: 1.6, w: 7.6, h: 4.9, sizing: { type: "contain", w: 7.6, h: 4.9 } });
      } catch { /* the takeaway still carries the slide */ }
    }
    s.addShape("roundRect", { x: M + 8.0, y: 2.2, w: W - 2 * M - 8.0, h: 3.2, rectRadius: 0.1, fill: { color: D.tint }, line: { type: "none" } });
    txt(s, "THE IDEA", { x: M + 8.3, y: 2.45, w: 3.5, h: 0.3, fontSize: 12, bold: true, color: D.primary, charSpacing: 3 });
    txt(s, takeaway, { x: M + 8.3, y: 2.85, w: W - 2 * M - 8.6, h: 2.4, fontSize: fit(takeaway, 20, 14, 90), color: D.ink, fontFace: D.head });
    return s;
  }
}

/** One Vivran block → one designed slide. */
async function blockSlide(B: Builder, b: Block, picture?: string): Promise<S> {
  const D = B.D, x = b as unknown as Record<string, unknown>;
  const arr = <T = string>(k: string) => (Array.isArray(x[k]) ? (x[k] as T[]) : []);
  switch (b.type) {
    case "title": return B.cover(str(x.title), str(x.subtitle) || undefined);
    case "section": return B.bigIdea(str(x.kicker) || "Next", str(x.title));
    case "objectives": return B.rows(str(x.heading), arr("items").map((t, i) => ({ head: t, icon: ["target", "check", "bulb", "book", "arrow"][i % 5] })));
    case "definition": return B.columns(str(x.term), [{ head: "What it means", items: [str(x.meaning)], icon: "book" }, ...(x.example ? [{ head: "For example", items: [str(x.example)], icon: "bulb", color: D.second, fill: D.secondTint }] : [])]);
    case "vocabulary": return B.table(str(x.heading), ["Word", "What it means"], arr<{ term: string; meaning: string }>("terms").map((t) => [t.term, t.meaning]));
    case "explanation": return B.rows(str(x.heading), arr("points").map((t) => ({ head: t })));
    case "process": {
      const st = arr<{ label: string; detail?: string }>("steps");
      return st.length <= 6 ? B.steps(str(x.heading), st.map((s) => ({ head: s.label, body: s.detail })), x.isCycle ? "…and then the cycle repeats." : undefined)
        : B.rows(str(x.heading), st.map((s) => ({ head: s.label, body: s.detail })));
    }
    case "comparison": {
      const subj = arr("subjects"), rows = arr<{ attribute: string; values: string[] }>("rows");
      return B.table(str(x.heading), ["", ...subj], rows.map((r) => [r.attribute, ...r.values]), arr("similarities").length ? `In common: ${arr("similarities").join("; ")}` : undefined);
    }
    case "cause_effect": return B.columns(str(x.heading), [
      { head: "Causes", items: arr("causes"), icon: "layers" },
      { head: str(x.event), items: [], color: "FFFFFF", fill: D.primary, center: true },
      { head: "Effects", items: arr("effects"), icon: "arrow", color: D.second, fill: D.secondTint },
    ]);
    case "timeline": return B.timeline(str(x.heading), arr<{ date: string; label: string }>("events"));
    case "hierarchy": return B.columns(`${str(x.heading)}`, arr<{ label: string; items?: string[] }>("children").slice(0, 4).map((c, i) => ({ head: c.label, items: c.items?.length ? c.items : [str(x.root)], color: i % 2 ? D.second : D.primary, fill: i % 2 ? D.secondTint : D.tint })), `All part of: ${str(x.root)}`);
    case "formula": {
      const s = B.content(str(x.heading));
      s.addShape("roundRect", { x: M, y: 1.65, w: W - 2 * M, h: 1.5, rectRadius: 0.1, fill: { color: D.tint }, line: { type: "none" } });
      txt(s, latexToText(str(x.latex)), { x: M + 0.3, y: 1.65, w: W - 2 * M - 0.6, h: 1.5, fontSize: 32, color: D.ink, fontFace: "Cambria", italic: true, align: "center", valign: "middle" });
      const vars = arr<{ symbol: string; meaning: string; unit?: string }>("variables");
      s.addTable([[{ text: "Symbol", options: { bold: true, color: "FFFFFF", fill: { color: D.primary } } }, { text: "Means", options: { bold: true, color: "FFFFFF", fill: { color: D.primary } } }, { text: "Unit", options: { bold: true, color: "FFFFFF", fill: { color: D.primary } } }],
        ...vars.map((v, i) => [v.symbol, v.meaning, v.unit ?? ""].map((t) => ({ text: t, options: { color: D.ink, fill: { color: i % 2 ? "FFFFFF" : D.tint } } })))] as never,
        { x: M, y: 3.45, w: W - 2 * M, colW: [2.2, 7.5, W - 2 * M - 9.7], fontSize: 14, fontFace: D.body, border: { type: "solid", color: "FFFFFF", pt: 2 }, margin: 0.1 });
      if (x.note) txt(s, str(x.note), { x: M, y: 6.45, w: W - 2 * M, h: 0.45, fontSize: 14, italic: true, color: D.muted, fontFace: D.body });
      return s;
    }
    case "worked_example": return B.columns(str(x.heading), [
      { head: "Problem", items: [str(x.problem)], icon: "bulb" },
      { head: "Steps", items: arr("steps"), color: D.ink, fill: "F6F7F9" },
      { head: "Answer", items: [str(x.answer)], icon: "check", color: D.second, fill: D.secondTint },
    ]);
    case "key_fact": return B.bigIdea("Did you know?", x.value ? `${str(x.value)}: ${str(x.statement)}` : str(x.statement), str(x.context) || undefined);
    case "misconception": return B.columns("A common mix-up", [
      { head: "Not quite", items: [str(x.myth)], icon: "x", color: "C0392B", fill: "FBEAEA" },
      { head: "Actually", items: [str(x.fact)], icon: "check", color: "1A7F5A", fill: "E6F4EC" },
    ], str(x.why));
    case "real_world": return B.columns(str(x.concept), [
      { head: "In real life", items: [str(x.example)], icon: "globe" },
      { head: "Why it connects", items: [str(x.connection)], icon: "arrow", color: D.second, fill: D.secondTint },
    ]);
    case "quiz_mcq": return B.quiz(str(x.question), arr("options"), Number(x.answer) || 0, str(x.explanation));
    case "activity": return B.steps(str(x.title), arr("instructions").map((t, i) => ({ head: `Step ${i + 1}`, body: t })), `${x.minutes} minutes · ${str(x.grouping)}`);
    case "discussion": return B.bigIdea("Discuss", arr("questions")[0] ?? str(x.heading), arr("questions").slice(1).join("  ·  ") || undefined);
    case "recap": return B.recap(str(x.heading), arr("points"));
    case "code_example": return B.code(str(x.heading), str(x.code), str(x.caption) || undefined, arr("annotations"));
    case "concept_map": return B.rows(`${str(x.heading)}: ${str(x.center)}`, arr<{ label: string; relation: string }>("nodes").map((n) => ({ head: n.label, body: n.relation })));
    case "flowchart": return B.steps(str(x.heading), [...arr("steps").map((t) => ({ head: t })), { head: str(x.question), body: `Yes → ${str(x.yes)}\nNo → ${str(x.no)}` }]);
    case "meme": return B.picture("A light moment", picture, str(x.takeaway));
  }
  return B.rows(str(x.heading) || "", []);
}

/**
 * Export a Vivran deck in a showcase design. Placements are the source of truth
 * (they carry split parts and the teacher's own additions); each part becomes one slide.
 */
export async function exportDesigned(
  placements: Placement[], meta: { title: string; level: string; subject: string }, design: Design = designFor(meta.subject),
  opts: { file?: string; icon?: IconFn } = {},
): Promise<ArrayBuffer | void> {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = meta.title;
  pres.author = "Vivran";
  pres.theme = { headFontFace: design.head, bodyFontFace: design.body };
  const footer = `${meta.title} · ${meta.level} ${meta.subject}`.slice(0, 90);
  pres.defineSlideMaster({
    title: "Content", background: { color: design.bg },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.45, w: W - 2 * M, h: 0.9, fontFace: design.head, fontSize: 32, bold: true, color: design.ink, valign: "middle", align: "left", margin: 0 }, text: "" } },
      { text: { text: footer, options: { x: M, y: H - 0.42, w: 9, h: 0.3, fontFace: design.body, fontSize: 10, color: design.muted, margin: 0 } } },
    ],
    slideNumber: { x: W - M - 0.6, y: H - 0.42, w: 0.6, h: 0.3, fontFace: design.body, fontSize: 10, color: design.muted, align: "right" },
  });
  pres.defineSlideMaster({ title: "Dark", background: { color: design.dark },
    objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.45, w: W - 2 * M, h: 0.9, fontFace: design.head, fontSize: 32, bold: true, color: "FFFFFF", valign: "middle", align: "left", margin: 0 }, text: "" } }],
    slideNumber: { x: W - M - 0.6, y: H - 0.42, w: 0.6, h: 0.3, fontFace: design.body, fontSize: 10, color: "BFC6D1", align: "right" },
  });
  pres.defineSlideMaster({ title: "Blank", background: { color: design.bg } });

  const B = new Builder(pres, design, opts.icon ?? browserIcon, meta);
  for (const p of placements) {
    const pic = p.elements.find((e) => e.t === "picture") as { src?: string } | undefined;
    const s = await blockSlide(B, p.block, pic?.src);
    const notes = [...p.notes, p.part ? `Part ${p.part.index} of ${p.part.of}.` : ""].filter(Boolean);
    if (notes.length && p.block.type !== "quiz_mcq") s.addNotes(notes.join("\n"));
  }
  if (opts.file) { await pres.writeFile({ fileName: opts.file }); return; }
  return (await pres.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}
