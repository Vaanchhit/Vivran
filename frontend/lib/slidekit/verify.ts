// ─────────────────────────────────────────────────────────────
// Library verifier. Run in CI: a layout that can't physically hold
// its advertised content at a grade's minimum font never ships.
// ─────────────────────────────────────────────────────────────
import { Blocks, BLOCK_TYPES, type BlockType } from "./blocks";
import { layoutDiagram, worstCaseData, KIND_PATHS } from "./diagram";
import { LAYOUTS, type DiagramSlot, type Field, type LayoutSpec, type Slot } from "./layouts";
import { GRADE_BLOCK_EXCLUDES } from "./subjects";
import {
  GLYPH, GRADE_PROFILES, ITEM_PAD, LABEL_H, LINE_HEIGHT, ROLE_SIZES, SAFE, WRAP_SLACK, WRAP_WORD,
  areaInBounds, areaToBox, itemBoxes, type Box, type GradeBand, type TypeRole,
} from "./tokens";

const GRADES: GradeBand[] = ["primary", "middle", "secondary", "college"];
export const MARKER_W = 56, MARKER_H = 48, FIELD_GAP = 8, TABLE_PAD = 16, HEADER_H = 72;
const CHARS_PER_WORD = 6.5;

// ── schema introspection (zod v4) ───────────────────────────
function unwrap(s: any): any { while (s?._zod?.def?.innerType) s = s._zod.def.innerType; return s; }
function shapeOf(t: BlockType): Record<string, any> { return (Blocks[t] as any).shape; }
/** Resolve a block path ("rows[].values[]") to its zod node. */
function nodeAt(t: BlockType, path: string): any {
  let node: any;
  path.split(".").forEach((part, i) => {
    const key = part.replace(/\[\]/g, "");
    node = i === 0 ? shapeOf(t)[key] : unwrap(node)._zod.def.shape[key];
    for (const _ of part.match(/\[\]/g) ?? []) node = unwrap(node)._zod.def.element;
  });
  return unwrap(node);
}
const checkOf = (s: any, name: string) => (s?._zod?.def?.checks ?? []).find((c: any) => c._zod.def.check === name)?._zod.def;
export function arrayBounds(t: BlockType, key: string): [number, number] | null {
  const s = unwrap(shapeOf(t)[key]);
  if (s?._zod?.def?.type !== "array") return null;
  const checks = s._zod.def.checks ?? [];
  const min = checks.find((c: any) => c._zod.def.check === "min_length")?._zod.def.minimum ?? 0;
  const max = checks.find((c: any) => c._zod.def.check === "max_length")?._zod.def.maximum ?? Infinity;
  return [min, max];
}

// ── text fitting ────────────────────────────────────────────
/** Sizes a role may use at this grade. The grade minimum overrides the role ladder. */
export function sizesFor(role: TypeRole, grade: GradeBand): number[] {
  const min = GRADE_PROFILES[grade].minFont;
  const ok = ROLE_SIZES[role].filter(s => s >= min);
  return ok.length ? ok : [min];
}
/** Word wrap wastes up to about one long word per line, which matters most in narrow boxes. */
const lines = (chars: number, size: number, width: number, role: TypeRole = "body") => {
  const g = GLYPH[role] * size;
  return Math.max(1, Math.ceil((chars * g) / Math.max(Math.min(width * WRAP_SLACK, width - WRAP_WORD * g), g)));
};

/** Height needed for fields at the smallest allowed size, or null if any field exceeds maxLines. */
function fieldsHeight(fields: Field[], width: number, grade: GradeBand, capWords: boolean, inline?: number): number | null {
  const cap = GRADE_PROFILES[grade].maxWordsPerItem * CHARS_PER_WORD;
  const one = (fd: Field, w: number) => {
    const size = Math.min(...sizesFor(fd.role, grade));
    const chars = capWords && fd.role !== "title" ? Math.min(fd.maxChars, cap) : fd.maxChars;
    const n = lines(chars, size, w, fd.role);
    if (n > fd.maxLines) return null;
    return n * size * LINE_HEIGHT * (fd.list?.max ?? 1);
  };
  if (inline) {
    const first = one(fields[0], inline);
    const restW = width - inline - 24;
    let rest = 0;
    for (const fd of fields.slice(1)) { const h = one(fd, restW); if (h === null) return null; rest += h + FIELD_GAP; }
    return first === null ? null : Math.max(first, rest - FIELD_GAP);
  }
  let total = 0;
  for (const fd of fields) { const h = one(fd, width); if (h === null) return null; total += h + FIELD_GAP; }
  return total - FIELD_GAP;
}

// ── per-slot occupied boxes (for overlap checks) ────────────
function occupied(slot: Slot, l: LayoutSpec, grade: GradeBand): Box[] {
  const box = areaToBox(slot.area);
  if (slot.kind !== "repeat") return [box];
  const n = maxCount(l, slot.bind, grade);
  return itemBoxes(box, slot.arrange, n, slot.cols);
}
function maxCount(l: LayoutSpec, bind: string, grade: GradeBand) {
  const cap = l.capacity[bind]?.[1] ?? 6;
  return Math.max(l.capacity[bind]?.[0] ?? 1, Math.min(cap, GRADE_PROFILES[grade].maxItems));
}
const boxesOverlap = (a: Box, b: Box) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const inSafe = (b: Box) =>
  b.x >= SAFE.x - 0.5 && b.y >= SAFE.y - 0.5 && b.x + b.w <= SAFE.x + SAFE.w + 0.5 && b.y + b.h <= SAFE.y + SAFE.h + 0.5;

// ── slot fit ────────────────────────────────────────────────
function slotFits(slot: Slot, l: LayoutSpec, grade: GradeBand): string | null {
  const box = areaToBox(slot.area);
  const pad = slot.card ? ITEM_PAD * 2 : 0;
  const labelH = slot.label ? LABEL_H : 0;
  switch (slot.kind) {
    case "text": {
      const h = fieldsHeight([{ bind: slot.bind, role: slot.role, maxChars: slot.maxChars, maxLines: slot.maxLines }], box.w - pad, grade, false);
      if (h === null) return `"${slot.id}" needs more than ${slot.maxLines} line(s)`;
      if (h + pad + labelH > box.h) return `"${slot.id}" too tall (${Math.round(h + pad + labelH)} > ${Math.round(box.h)})`;
      return null;
    }
    case "repeat": {
      const n = maxCount(l, slot.bind, grade);
      const items = itemBoxes({ ...box, y: box.y + labelH, h: box.h - labelH }, slot.arrange, n, slot.cols);
      const it = items[0];
      const vertical = slot.arrange === "column" || slot.arrange === "axis-v";
      const mW = slot.marker && slot.marker !== "none" && vertical ? MARKER_W : 0;
      const mH = slot.marker && slot.marker !== "none" && !vertical ? MARKER_H : 0;
      const h = fieldsHeight(slot.fields, it.w - pad - mW, grade, true, slot.inline);
      if (h === null) return `"${slot.id}" item text exceeds its line budget at ${n} items`;
      if (h + pad + mH > it.h) return `"${slot.id}" item too tall at ${n} items (${Math.round(h + pad + mH)} > ${Math.round(it.h)})`;
      return null;
    }
    case "table": {
      const cols = maxCount(l, slot.header, grade);
      const rows = maxCount(l, slot.bind, grade);
      if (slot.mode === "table") {
        const cw = (box.w - cols * 8) / (cols + 1) - TABLE_PAD * 2;
        const ch = (box.h - rows * 8) / (rows + 1) - TABLE_PAD * 2;
        const hd = fieldsHeight([{ bind: "h", role: "label", maxChars: 30, maxLines: 2 }], cw, grade, false);
        if (hd === null || hd > ch) return `table header too small for its text`;
        const a = fieldsHeight([slot.attr], cw, grade, true), c = fieldsHeight([slot.cell], cw, grade, true);
        if (a === null || c === null) return `table cell text exceeds line budget`;
        if (Math.max(a, c) > ch) return `table cell too tall (${Math.round(Math.max(a, c))} > ${Math.round(ch)})`;
      } else {
        const cw = (box.w - (cols - 1) * 24) / cols - TABLE_PAD * 2;
        const ch = (box.h - HEADER_H - rows * 8) / rows - TABLE_PAD * 2;
        const hh = fieldsHeight([{ bind: "h", role: "heading", maxChars: 30, maxLines: 1 }], cw, grade, false);
        if (hh === null || hh > HEADER_H - TABLE_PAD * 2) return `column header too small for its text`;
        const h = fieldsHeight([slot.attr, slot.cell], cw, grade, true);
        if (h === null) return `column cell text exceeds line budget`;
        if (h > ch) return `column cell too tall (${Math.round(h)} > ${Math.round(ch)})`;
      }
      return null;
    }
    case "code": {
      const size = Math.min(...sizesFor("mono", grade));
      const need = slot.maxLines * size * LINE_HEIGHT + ITEM_PAD * 2;
      if (60 * GLYPH.mono * size > box.w - ITEM_PAD * 2) return `code block narrower than 60 columns`;
      return need > box.h ? `code block too short for ${slot.maxLines} lines` : null;
    }
    case "meta": {
      const size = Math.min(...sizesFor("label", grade));
      return lines(11, size, box.w / slot.binds.length - 24, "label") > 1 ? `meta chips too narrow` : null;
    }
    case "diagram":
      return diagramFits(slot, l, grade, box);
    // No `default`: every slot kind is accounted for here, so adding one fails the
    // build rather than silently skipping verification, which is how diagrams went
    // five layouts unchecked.
    case "image":
    case "icon":
      return null; // no text of their own; both scale to their box
    case "formula":
      return null; // KaTeX scales the expression down to fit
  }
}

/**
 * Run the real geometry at this layout's own maximum — every array at its
 * capacity ceiling for the grade, every string at its declared budget — and
 * insist the result is drawable: inside the box, no two labels touching, and
 * nothing set below the grade's minimum font.
 */
function diagramFits(slot: DiagramSlot, l: LayoutSpec, grade: GradeBand, box: Box): string | null {
  const cap = Math.floor(GRADE_PROFILES[grade].maxWordsPerItem * CHARS_PER_WORD);
  const wc = {
    // Exactly what budgets.ts hands the mock model, so the verifier and the sweep agree.
    chars: (p: string) => slot.budget?.[p] !== undefined
      ? Math.min(slot.budget[p], cap)
      : checkOf(nodeAt(l.accepts, p), "max_length")?.maximum ?? 60,
    // Arrays the layout declares a capacity for are capped by grade; nested ones by the schema.
    count: (p: string) => l.capacity[p] ? maxCount(l, p, grade) : checkOf(nodeAt(l.accepts, p), "max_length")?.maximum ?? 1,
  };
  let gm;
  try { gm = layoutDiagram(slot.diagram, worstCaseData(slot.diagram, wc), box, grade); }
  catch (e) { return `${slot.diagram} diagram threw: ${(e as Error).message}`; }

  if (gm.overflow.length)
    return `${slot.diagram} diagram cannot hold its own budget (${gm.overflow.map(o => `${o.path} ${o.chars}>${o.budget}`).join(", ")})`;

  const within = (b: Box) => b.x >= box.x - 0.5 && b.y >= box.y - 0.5 && b.x + b.w <= box.x + box.w + 0.5 && b.y + b.h <= box.y + box.h + 0.5;
  for (const s of gm.shapes) {
    const b: Box = s.s === "line"
      ? { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) }
      : s;
    if (!within(b)) return `${slot.diagram} diagram ${s.s} leaves its box`;
  }
  const min = GRADE_PROFILES[grade].minFont;
  for (const lb of gm.labels) {
    if (!within(lb)) return `${slot.diagram} diagram label "${lb.path}" leaves its box`;
    if (lb.size < min) return `${slot.diagram} diagram label "${lb.path}" is ${lb.size}px, below the ${min}px minimum`;
  }
  for (let i = 0; i < gm.labels.length; i++) for (let j = i + 1; j < gm.labels.length; j++)
    if (boxesOverlap(gm.labels[i], gm.labels[j]))
      return `${slot.diagram} diagram labels "${gm.labels[i].path}" and "${gm.labels[j].path}" overlap`;
  return null;
}

// ── the verifier ────────────────────────────────────────────
export interface Issue { layout?: string; type?: BlockType; grade?: GradeBand; msg: string }

export function verifyLibrary(): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();

  for (const l of LAYOUTS) {
    if (ids.has(l.id)) issues.push({ layout: l.id, msg: "duplicate id" });
    ids.add(l.id);
    const keys = Object.keys(shapeOf(l.accepts));

    for (const k of [...Object.keys(l.capacity), ...(l.requires ?? []), ...(l.notesBind ?? [])])
      if (!keys.includes(k)) issues.push({ layout: l.id, msg: `unknown field "${k}"` });
    for (const [k, [lo, hi]] of Object.entries(l.capacity)) {
      const b = arrayBounds(l.accepts, k);
      if (b && (lo < b[0] || hi > b[1])) issues.push({ layout: l.id, msg: `capacity ${k} [${lo},${hi}] outside schema [${b}]` });
      if (lo > hi) issues.push({ layout: l.id, msg: `capacity ${k} min > max` });
    }

    for (const slot of l.slots) {
      if (!areaInBounds(slot.area)) issues.push({ layout: l.id, msg: `slot "${slot.id}" outside grid` });
      const binds = "binds" in slot ? slot.binds : [slot.bind];
      for (const b of binds) if (!keys.includes(b)) issues.push({ layout: l.id, msg: `slot "${slot.id}" binds unknown "${b}"` });
      if (slot.kind === "repeat" && !l.capacity[slot.bind]) issues.push({ layout: l.id, msg: `repeat "${slot.id}" has no capacity` });
      if (slot.kind === "diagram") for (const k of Object.keys(slot.budget ?? {}))
        if (!KIND_PATHS[slot.diagram].includes(k)) issues.push({ layout: l.id, msg: `diagram "${slot.id}" budgets unknown path "${k}"` });
    }

    for (const g of l.gradeFit) {
      // geometry at max capacity
      const fg = l.slots.filter(s => s.layer !== "bg").map(s => ({ s, boxes: occupied(s, l, g) }));
      for (const { s, boxes } of fg) {
        for (const b of boxes) if (!inSafe(b)) issues.push({ layout: l.id, grade: g, msg: `"${s.id}" leaves the safe area` });
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
          if (boxesOverlap(boxes[i], boxes[j])) { issues.push({ layout: l.id, grade: g, msg: `"${s.id}" items overlap each other` }); i = boxes.length; break; }
      }
      for (let i = 0; i < fg.length; i++) for (let j = i + 1; j < fg.length; j++)
        if (fg[i].boxes.some(a => fg[j].boxes.some(b => boxesOverlap(a, b))))
          issues.push({ layout: l.id, grade: g, msg: `"${fg[i].s.id}" overlaps "${fg[j].s.id}"` });
      // text fit
      for (const s of l.slots) { const e = slotFits(s, l, g); if (e) issues.push({ layout: l.id, grade: g, msg: e }); }
    }
  }

  // coverage
  for (const t of BLOCK_TYPES) {
    const ls = LAYOUTS.filter(l => l.accepts === t);
    if (ls.length < 2) issues.push({ type: t, msg: `only ${ls.length} layout(s)` });
    const fb = ls.filter(l => l.fallback);
    if (fb.length !== 1) { issues.push({ type: t, msg: `${fb.length} fallbacks (need exactly 1)` }); continue; }
    const f = fb[0];
    if (f.requires?.length) issues.push({ type: t, msg: `fallback "${f.id}" has requirements` });
    for (const [k, [lo]] of Object.entries(f.capacity)) {
      const b = arrayBounds(t, k);
      if (b && lo > b[0]) issues.push({ type: t, msg: `fallback "${f.id}" can't take the schema minimum ${k}=${b[0]}` });
    }
    for (const g of GRADES) {
      if (GRADE_BLOCK_EXCLUDES[g].includes(t)) continue;
      if (!f.gradeFit.includes(g)) issues.push({ type: t, grade: g, msg: `fallback "${f.id}" not fit for this grade` });
    }
  }
  return issues;
}
