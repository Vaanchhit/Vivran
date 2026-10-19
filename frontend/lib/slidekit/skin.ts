// ─────────────────────────────────────────────────────────────
// Skins: the visual identity a template gives a deck, on top of the theme's
// colours. A skin only ever draws in the margins outside the safe area, or as
// soft tinted shapes BEHIND content in colours the theme already guarantees
// text contrast on (accentBg, card). So no skin can make text overlap or
// become unreadable, and the layout engine's fit guarantees stand untouched.
// Both renderers (HTML and PowerPoint) draw the same list of shapes.
// ─────────────────────────────────────────────────────────────
import type { Placement } from "./matcher";
import { CANVAS, SAFE } from "./tokens";

export const SKINS = ["classic", "band", "frame", "soft", "bold"] as const;
export type Skin = (typeof SKINS)[number];
export const SKIN_LABELS: Record<Skin, string> = { classic: "Classic", band: "Band", frame: "Frame", soft: "Soft", bold: "Bold" };

export type Paint = "accent" | "accentBg" | "card" | "line" | "muted" | "ink" | "bg";
export type Deco =
  | { k: "rect"; x: number; y: number; w: number; h: number; fill: Paint; r?: number; opacity?: number }
  | { k: "circle"; cx: number; cy: number; r: number; fill: Paint; opacity?: number }
  | { k: "text"; x: number; y: number; w: number; h: number; text: string; size: number; color: Paint; align: "left" | "right"; bold?: boolean };

export interface DecoCtx { index: number; total: number; deckTitle: string }
export interface Decorated { decos: Deco[]; /** Draw this slide on the inverted theme (dark cover). */ invert: boolean; /** The footer shows the split part, so the renderer need not. */ partShown: boolean }

const isCover = (p: Placement) => p.block.type === "title" || p.block.type === "section";

type TextEl = Extract<Placement["elements"][number], { t: "text" }>;
const textAt = (p: Placement, path: string) => p.elements.find(e => e.t === "text" && e.path === path) as TextEl | undefined;

/** A short accent rule under a heading, only when nothing else sits in that strip. */
function underline(p: Placement, el: TextEl | undefined, w = 96): Deco[] {
  if (!el) return [];
  const y = el.y + el.h + 12, h = 8;
  const x = el.align === "center" ? el.x + el.w / 2 - w / 2 : el.x;
  const clash = p.elements.some(e => e !== el && "w" in e && "h" in e &&
    e.y < y + h + 6 && e.y + e.h > y - 6 && e.x < x + w && e.x + e.w > x);
  return clash ? [] : [{ k: "rect", x, y, w, h, fill: "accent", r: 4 }];
}

function footer(p: Placement, c: DecoCtx, withTitle: boolean, pill = false): Deco[] {
  const y = SAFE.y + SAFE.h + 18, h = 34;
  const num = `${c.index + 1}${p.part ? ` · part ${p.part.index}/${p.part.of}` : ""}`;
  const out: Deco[] = [];
  if (pill) out.push({ k: "rect", x: SAFE.x + SAFE.w - 150, y: y - 4, w: 150, h: h + 6, fill: "card", r: 20 });
  out.push({ k: "text", x: SAFE.x + SAFE.w - (pill ? 138 : 300), y, w: pill ? 126 : 300, h, text: num, size: 20, color: "muted", align: "right" });
  if (withTitle && c.deckTitle) out.push({ k: "text", x: SAFE.x, y, w: 1100, h, text: c.deckTitle.slice(0, 80), size: 20, color: "muted", align: "left" });
  return out;
}

export function decorate(p: Placement, skin: Skin, c: DecoCtx): Decorated {
  const cover = isCover(p);
  const heading = textAt(p, "heading");
  const title = textAt(p, "title");
  const W = CANVAS.w, H = CANVAS.h;
  const d: Deco[] = [];
  let invert = false;

  switch (skin) {
    case "classic":
      if (cover) d.push(...underline(p, title, 140));
      else d.push(...underline(p, heading), ...footer(p, c, false));
      break;
    case "band":
      d.push({ k: "rect", x: 0, y: 0, w: W, h: 16, fill: "accent" });
      if (cover) d.push({ k: "rect", x: 0, y: 0, w: 40, h: H, fill: "accent" }, { k: "circle", cx: W - 140, cy: H - 60, r: 360, fill: "accentBg" }, ...underline(p, title, 140));
      else d.push(...underline(p, heading), ...footer(p, c, true));
      break;
    case "frame":
      if (cover) { invert = true; d.push({ k: "rect", x: 0, y: 0, w: 48, h: H, fill: "accent" }, { k: "rect", x: 0, y: H - 24, w: W, h: 24, fill: "accent" }); }
      else d.push({ k: "rect", x: 0, y: 0, w: 20, h: H, fill: "accent" }, { k: "rect", x: SAFE.x, y: SAFE.y + SAFE.h + 10, w: SAFE.w, h: 2, fill: "line" }, ...footer(p, c, true));
      break;
    case "soft":
      if (cover) d.push({ k: "circle", cx: W - 120, cy: 120, r: 420, fill: "accentBg" }, { k: "circle", cx: 120, cy: H - 60, r: 300, fill: "card" }, ...underline(p, title, 140));
      else d.push({ k: "circle", cx: W + 40, cy: -40, r: 260, fill: "accentBg" }, { k: "circle", cx: -60, cy: H + 60, r: 200, fill: "card" }, ...underline(p, heading), ...footer(p, c, false, true));
      break;
    case "bold":
      if (cover) { invert = true; d.push({ k: "rect", x: 0, y: H - 64, w: W, h: 64, fill: "accent" }, ...underline(p, title, 180)); }
      else {
        if (heading && heading.align !== "center" && heading.y < SAFE.y + 40) d.push({ k: "rect", x: SAFE.x - 56, y: heading.y + Math.max(0, (Math.min(heading.h, heading.size * 1.25) - 28) / 2), w: 28, h: 28, fill: "accent", r: 6 });
        d.push(...footer(p, c, false));
      }
      break;
  }
  return { decos: d, invert, partShown: !cover };
}
