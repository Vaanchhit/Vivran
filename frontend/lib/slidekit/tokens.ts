// ─────────────────────────────────────────────────────────────
// Design tokens. Nothing downstream may use a size, colour or
// spacing value that isn't defined here.
// ─────────────────────────────────────────────────────────────

export const CANVAS = { w: 1920, h: 1080 } as const;

/** Safe area: every slot lives inside this box. */
export const SAFE = { x: 96, y: 72, w: 1728, h: 936 } as const;

/** 12 columns × 8 rows inside the safe area. */
export const GRID = { cols: 12, rows: 8, gutter: 32 } as const;

/** Gap between repeated items (cards, steps, options). */
export const ITEM_GAP = 24;
/** Inner padding of a card / item box. */
export const ITEM_PAD = 20;
export const LINE_HEIGHT = 1.25;
/** Deck font. Arial-metric, available in PowerPoint, Google Slides and browsers. */
export const DECK_FONT = "Arial";
/** Average glyph width as a fraction of font size, per role (bold roles are wider). Calibrated by the render audit. */
export const GLYPH: Record<"display" | "title" | "heading" | "body" | "caption" | "label" | "mono", number> = {
  display: 0.56, title: 0.56, heading: 0.56, label: 0.56, body: 0.5, caption: 0.5, mono: 0.6,
};
export const BOLD_ROLES = new Set(["display", "title", "heading", "label"]);
/** Spec-level checks assume word wrapping wastes this share of each line. */
export const WRAP_SLACK = 0.88;
/** …and at least this many average glyphs per line, whichever is larger. */
export const WRAP_WORD = 5;
/** Height of the small label strip above a labelled slot ("Myth", "Answer"). */
export const LABEL_H = 36;

/** The only font sizes that exist. */
export const TYPE_LADDER = [96, 72, 56, 44, 36, 30, 26, 22, 18] as const;
export type FontSize = (typeof TYPE_LADDER)[number];

export type TypeRole = "display" | "title" | "heading" | "body" | "caption" | "label" | "mono";

/** Allowed sizes per role, largest first. The fitter steps down this list. */
export const ROLE_SIZES: Record<TypeRole, FontSize[]> = {
  display: [96, 72, 56],
  title: [56, 44, 36],
  heading: [36, 30, 26, 22],
  body: [30, 26, 22, 18],
  caption: [22, 18],
  label: [26, 22, 18],
  mono: [26, 22, 18],
};

export type GradeBand = "primary" | "middle" | "secondary" | "college";
export type Density = "low" | "medium" | "high";

export interface GradeProfile {
  maxItems: number;        // max list items on one slide
  maxWordsPerItem: number;
  minFont: FontSize;       // text never renders below this
  fontScale: number;       // multiplier on preferred sizes
  image: "required" | "preferred" | "optional";
  maxDensity: Density;
}

export const GRADE_PROFILES: Record<GradeBand, GradeProfile> = {
  primary:   { maxItems: 3, maxWordsPerItem: 8,  minFont: 26, fontScale: 1.2, image: "required",  maxDensity: "low" },
  middle:    { maxItems: 4, maxWordsPerItem: 12, minFont: 22, fontScale: 1.1, image: "preferred", maxDensity: "medium" },
  secondary: { maxItems: 5, maxWordsPerItem: 16, minFont: 22, fontScale: 1.0, image: "optional",  maxDensity: "high" },
  college:   { maxItems: 6, maxWordsPerItem: 20, minFont: 18, fontScale: 0.9, image: "optional",  maxDensity: "high" },
};

export const DENSITY_RANK: Record<Density, number> = { low: 0, medium: 1, high: 2 };

// ── Geometry ─────────────────────────────────────────────────

/** Grid area: column, column-span, row, row-span (0-indexed). */
export interface Area { c: number; cs: number; r: number; rs: number }
export interface Box { x: number; y: number; w: number; h: number }

const COL_W = (SAFE.w - (GRID.cols - 1) * GRID.gutter) / GRID.cols;
const ROW_H = (SAFE.h - (GRID.rows - 1) * GRID.gutter) / GRID.rows;

export function areaToBox(a: Area): Box {
  return {
    x: SAFE.x + a.c * (COL_W + GRID.gutter),
    y: SAFE.y + a.r * (ROW_H + GRID.gutter),
    w: a.cs * COL_W + (a.cs - 1) * GRID.gutter,
    h: a.rs * ROW_H + (a.rs - 1) * GRID.gutter,
  };
}

export function areaInBounds(a: Area): boolean {
  return a.c >= 0 && a.r >= 0 && a.cs >= 1 && a.rs >= 1 &&
    a.c + a.cs <= GRID.cols && a.r + a.rs <= GRID.rows;
}

export function areasOverlap(a: Area, b: Area): boolean {
  return a.c < b.c + b.cs && b.c < a.c + a.cs && a.r < b.r + b.rs && b.r < a.r + a.rs;
}

export type Arrange = "row" | "column" | "grid" | "radial" | "axis-h" | "axis-v" | "table";

/**
 * Boxes for n repeated items inside a container, for each arrangement.
 * Shared by the renderer, the capacity checker and the gallery, so they
 * can never disagree about where an item goes.
 */
export function itemBoxes(box: Box, arrange: Arrange, n: number, cols = 2): Box[] {
  const g = ITEM_GAP;
  const out: Box[] = [];
  switch (arrange) {
    case "row": {
      const w = (box.w - g * (n - 1)) / n;
      for (let i = 0; i < n; i++) out.push({ x: box.x + i * (w + g), y: box.y, w, h: box.h });
      break;
    }
    case "column":
    case "axis-v": {
      const h = (box.h - g * (n - 1)) / n;
      for (let i = 0; i < n; i++) out.push({ x: box.x, y: box.y + i * (h + g), w: box.w, h });
      break;
    }
    case "axis-h": {
      // items alternate above/below a central axis
      const w = (box.w - g * (n - 1)) / n;
      const h = (box.h - g) / 2;
      for (let i = 0; i < n; i++)
        out.push({ x: box.x + i * (w + g), y: i % 2 === 0 ? box.y : box.y + h + g, w, h });
      break;
    }
    case "grid":
    case "table": {
      const c = Math.min(cols, n);
      const rows = Math.ceil(n / c);
      const w = (box.w - g * (c - 1)) / c;
      const h = (box.h - g * (rows - 1)) / rows;
      for (let i = 0; i < n; i++)
        out.push({ x: box.x + (i % c) * (w + g), y: box.y + Math.floor(i / c) * (h + g), w, h });
      break;
    }
    case "radial": {
      // items on an ellipse around the centre; item size shrinks with n
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const w = Math.min(box.w / 3, 420), h = Math.min(box.h / 3.2, 240);
      const rx = (box.w - w) / 2, ry = (box.h - h) / 2;
      for (let i = 0; i < n; i++) {
        const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
        out.push({ x: cx + rx * Math.cos(t) - w / 2, y: cy + ry * Math.sin(t) - h / 2, w, h });
      }
      break;
    }
  }
  return out;
}
