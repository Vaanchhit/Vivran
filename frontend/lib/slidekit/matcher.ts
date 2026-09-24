// ─────────────────────────────────────────────────────────────
// Matching engine. Deterministic: same blocks + grade in, same
// placements out. No AI, no randomness, no DOM.
//
//   filter  → layouts that accept the type, suit the grade, and whose
//             requirements the content meets
//   measure → compose every candidate with real text; reject any
//             that overflow at the grade's minimum font
//   score   → fit quality, grade density, visuals, variety
//   repair  → split long lists across slides; else copy-fit request
//             plus a flagged, deterministic trim so it always renders
// ─────────────────────────────────────────────────────────────
import type { Block, BlockType } from "./blocks";
import { fitAtStep, fitText, charBudget, sizesFor, trimToBudget } from "./fit";
import { LAYOUTS, fallbackFor, type Field, type LayoutSpec, type Slot, type Tone } from "./layouts";
import {
  DENSITY_RANK, GRADE_PROFILES, ITEM_GAP, ITEM_PAD, LABEL_H, LINE_HEIGHT,
  areaToBox, itemBoxes, type Box, type GradeBand, type TypeRole,
} from "./tokens";

const MARKER_W = 56, MARKER_H = 48, MARKER_D = 40, FIELD_GAP = 8, TABLE_PAD = 16, HEADER_H = 72, CELL_GAP = 8;

// ── output types ────────────────────────────────────────────
export type El =
  | { t: "text"; x: number; y: number; w: number; h: number; text: string; size: number; role: TypeRole; align: "start" | "center"; tone?: Tone; strike?: boolean; path: string }
  | { t: "box"; x: number; y: number; w: number; h: number; style: "card" | "cell" | "header" | "chip"; tone?: Tone }
  | { t: "marker"; x: number; y: number; d: number; label: string }
  | { t: "connector"; x1: number; y1: number; x2: number; y2: number; arrow: boolean }
  | { t: "image"; x: number; y: number; w: number; h: number; query: string; bg: boolean }
  | { t: "icon"; x: number; y: number; w: number; h: number; name: string }
  | { t: "formula"; x: number; y: number; w: number; h: number; latex: string }
  | { t: "code"; x: number; y: number; w: number; h: number; code: string; size: number; language: string }
  | { t: "diagram"; x: number; y: number; w: number; h: number; kind: string; data: Record<string, unknown> };

export interface Overflow { path: string; chars: number; budget: number; kind: "text" | "lines" | "formula"; cols?: number }

export interface Placement {
  layoutId: string;
  block: Block;
  elements: El[];
  score: number;
  /** Present when a list was split across slides. */
  part?: { index: number; of: number };
  /** Text that was over budget; send these to the copy-fitter for a proper rewrite. */
  copyFit: Overflow[];
  /** Paths trimmed deterministically so the slide still renders. Always shown to the teacher. */
  trimmed: string[];
  /** Items dropped because nothing could hold them. Always shown to the teacher. */
  dropped: string[];
  /** Content routed to speaker notes. */
  notes: string[];
  why: string;
}

interface Attempt {
  ok: boolean; els: El[]; ranks: number[]; fills: number[];
  overflows: Overflow[]; soft: Overflow[]; capacity: { key: string; n: number; lo: number; hi: number }[]; missing: string[];
}

// ── helpers ─────────────────────────────────────────────────
const get = (b: any, k: string) => b?.[k];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const present = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "" && v !== false);
const labelSize = (g: GradeBand) => Math.max(22, GRADE_PROFILES[g].minFont);
const effMax = (l: LayoutSpec, key: string, g: GradeBand) => {
  const [lo, hi] = l.capacity[key];
  return Math.max(lo, Math.min(hi, GRADE_PROFILES[g].maxItems));
};

function fieldValues(item: unknown, fd: Field): string[] {
  const v = fd.bind === "." ? item : get(item, fd.bind);
  if (fd.list) return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
  if (Array.isArray(v)) return [v.map(str).join(" / ")];
  const s = str(v);
  return s ? [s] : [];
}

interface Placed { x: number; y: number; w: number; h: number; text: string; size: number; role: TypeRole; path: string }

/** Stack an item's fields at one step of the size ladder. Returns null if anything doesn't fit. */
function stackFields(item: unknown, fields: Field[], step: number, g: GradeBand, w: number, h: number,
  inline: number | undefined, pathOf: (f: Field, k?: number) => string): { placed: Placed[]; height: number } | null {
  const placed: Placed[] = [];
  const col = (fds: Field[], x: number, width: number) => {
    let y = 0;
    for (const fd of fds) {
      const vals = fieldValues(item, fd);
      if (!vals.length) { if (fd.optional) continue; return null; }
      if (fd.list && vals.length > fd.list.max) return null;
      for (let k = 0; k < vals.length; k++) {
        const f = fitAtStep(vals[k], fd.role, g, step, width, fd.maxLines);
        if (!f) return null;
        placed.push({ x, y, w: width, h: f.height, text: fd.list ? `• ${vals[k]}` : vals[k], size: f.size, role: fd.role, path: pathOf(fd, fd.list ? k : undefined) });
        y += f.height + (fd.list ? 4 : FIELD_GAP);
      }
    }
    return Math.max(0, y - FIELD_GAP);
  };
  let height: number | null;
  if (inline && fields.length > 1) {
    const a = col([fields[0]], 0, inline);
    const b = col(fields.slice(1), inline + 24, w - inline - 24);
    height = a === null || b === null ? null : Math.max(a, b);
  } else height = col(fields, 0, w);
  return height === null || height > h ? null : { placed, height };
}

// ── compose one block into one layout ───────────────────────
/** relaxMin: a continuation part of a split list may hold fewer items than the layout normally wants. */
export function tryLayout(block: Block, l: LayoutSpec, g: GradeBand, startAt = 0, relaxMin = false): Attempt {
  const A: Attempt = { ok: false, els: [], ranks: [], fills: [], overflows: [], soft: [], capacity: [], missing: [] };
  const b = block as any;

  for (const req of l.requires ?? []) if (!present(b[req])) A.missing.push(req);
  for (const key of Object.keys(l.capacity)) {
    const n = Array.isArray(b[key]) ? b[key].length : 0;
    const lo = relaxMin ? Math.min(1, l.capacity[key][0]) : l.capacity[key][0], hi = effMax(l, key, g);
    if (n < lo || n > hi) A.capacity.push({ key, n, lo, hi });
  }
  if (A.missing.length || A.capacity.length) return A;

  const label = (text: string, x: number, y: number, w: number, align: "start" | "center" = "start") =>
    A.els.push({ t: "text", x, y, w, h: LABEL_H, text, size: labelSize(g), role: "label", align, tone: "muted", path: "label" });

  for (const s of l.slots) {
    const box = areaToBox(s.area);
    switch (s.kind) {
      case "text": {
        const val = str(b[s.bind]);
        if (!val) { if (!s.optional) A.missing.push(s.bind); break; }
        const pad = s.card ? ITEM_PAD : 0, lab = s.label ? LABEL_H : 0;
        const inner: Box = { x: box.x + pad, y: box.y + pad + lab, w: box.w - 2 * pad, h: box.h - 2 * pad - lab };
        if (s.card) A.els.push({ t: "box", ...box, style: "card", tone: s.tone });
        if (s.label) label(s.label, inner.x, box.y + pad, inner.w, s.align ?? "start");
        const f = fitText(val, s.role, g, inner.w, inner.h, s.maxLines);
        if (!f) {
          A.overflows.push({ path: s.bind, chars: val.length, budget: charBudget(s.role, g, inner.w, inner.h, s.maxLines), kind: "text" });
          break;
        }
        const y = s.align === "center" ? inner.y + (inner.h - f.height) / 2 : inner.y;
        A.els.push({ t: "text", x: inner.x, y, w: inner.w, h: f.height, text: val, size: f.size, role: s.role,
          align: s.align ?? "start", tone: s.card ? undefined : s.tone, strike: s.strike, path: s.bind });
        A.ranks.push(f.rank); A.fills.push(f.height / inner.h);
        break;
      }

      case "repeat": {
        const arr: unknown[] = b[s.bind];
        const lab = s.label ? LABEL_H + 8 : 0;
        if (s.label) label(s.label, box.x, box.y, box.w);
        const cont: Box = { ...box, y: box.y + lab, h: box.h - lab };
        const items = itemBoxes(cont, s.arrange, arr.length, s.cols);
        const vertical = s.arrange === "column" || s.arrange === "axis-v";
        const hasMarker = !!s.marker && s.marker !== "none";
        const pad = s.card ? ITEM_PAD : 0;
        const mW = hasMarker && vertical ? MARKER_W : 0, mH = hasMarker && !vertical ? MARKER_H : 0;
        const steps = Math.max(...s.fields.map(fd => sizesFor(fd.role, g).length));
        const pathOf = (i: number) => (fd: Field, k?: number) =>
          `${s.bind}[${i}]${fd.bind === "." ? "" : "." + fd.bind}${k !== undefined ? `[${k}]` : ""}`;

        let chosen: { step: number; stacks: { placed: Placed[]; height: number }[] } | null = null;
        for (let step = 0; step < steps && !chosen; step++) {
          const stacks = items.map((it, i) => stackFields(arr[i], s.fields, step, g, it.w - 2 * pad - mW, it.h - 2 * pad - mH, s.inline, pathOf(i)));
          if (stacks.every(Boolean)) chosen = { step, stacks: stacks as any };
        }
        if (!chosen) {
          // report each item that fails even at the smallest size
          items.forEach((it, i) => {
            const w = it.w - 2 * pad - mW, h = it.h - 2 * pad - mH;
            if (stackFields(arr[i], s.fields, steps - 1, g, w, h, s.inline, pathOf(i))) return;
            // blame the longest non-list field
            const fd = [...s.fields].filter(f => !f.list).sort((a, c) => fieldValues(arr[i], c).join("").length - fieldValues(arr[i], a).join("").length)[0];
            const val = fieldValues(arr[i], fd).join("");
            const fw = s.inline && fd === s.fields[0] ? s.inline : s.inline ? w - s.inline - 24 : w;
            const share = s.inline ? h : h / s.fields.filter(f => fieldValues(arr[i], f).length).length;
            A.overflows.push({ path: pathOf(i)(fd), chars: val.length, budget: charBudget(fd.role, g, fw, share, fd.maxLines), kind: "text" });
          });
          break;
        }

        // axis / connectors drawn under the items
        if (s.arrange === "axis-h") { const y = cont.y + cont.h / 2; A.els.push({ t: "connector", x1: cont.x, y1: y, x2: cont.x + cont.w, y2: y, arrow: true }); }
        if (s.arrange === "axis-v") { const x = cont.x + (s.inline ?? 0) + 12; A.els.push({ t: "connector", x1: x, y1: cont.y, x2: x, y2: cont.y + cont.h, arrow: false }); }
        if (s.arrange === "radial" && s.connector === "line") {
          const cx = cont.x + cont.w / 2, cy = cont.y + cont.h / 2;
          for (const it of items) A.els.push({ t: "connector", x1: cx, y1: cy, x2: it.x + it.w / 2, y2: it.y + it.h / 2, arrow: false });
        }
        items.forEach((it, i) => {
          if (s.card) A.els.push({ t: "box", ...it, style: "card", tone: s.tone });
          const nx = items[i + 1];
          if (s.connector === "arrow" && nx) {
            if (Math.abs(nx.y - it.y) < 1) A.els.push({ t: "connector", x1: it.x + it.w + 3, y1: it.y + it.h / 2, x2: nx.x - 3, y2: nx.y + nx.h / 2, arrow: true });
            else if (s.arrange === "radial") A.els.push({ t: "connector", ...shorten(it, nx), arrow: true });
          }
          if (s.arrange === "radial" && s.connector === "arrow" && !nx && items.length > 2)
            A.els.push({ t: "connector", ...shorten(it, items[0]), arrow: true });
          if (hasMarker) {
            const lbl = s.marker === "number" ? String(startAt + i + 1) : s.marker === "letter" ? "ABCDEFGH"[i] : s.marker === "check" ? "✓" : "•";
            A.els.push({ t: "marker", x: it.x + pad, y: it.y + pad + (vertical ? 2 : 0), d: s.marker === "bullet" ? 16 : MARKER_D, label: lbl });
          }
          const ox = it.x + pad + mW, oy = it.y + pad + mH;
          for (const p of chosen!.stacks[i].placed) A.els.push({ t: "text", x: ox + p.x, y: oy + p.y, w: p.w, h: p.h, text: p.text, size: p.size, role: p.role, align: "start", path: p.path });
          A.fills.push(chosen!.stacks[i].height / (it.h - 2 * pad - mH));
        });
        A.ranks.push(chosen.step / Math.max(1, steps - 1));
        break;
      }

      case "table": {
        const subjects: string[] = b[s.header];
        const rows: { attribute: string; values: string[] }[] = b[s.bind];
        const steps = 4;
        let done = false;
        let blame: { path: string; text: string; role: TypeRole; w: number; h: number; maxLines: number } | null = null;
        for (let step = 0; step < steps && !done; step++) {
          const els: El[] = [];
          let ok = true, used = 0;
          const put = (text: string, role: TypeRole, maxLines: number, cell: Box, path: string, style: "cell" | "header") => {
            const inner = { x: cell.x + TABLE_PAD, y: cell.y + TABLE_PAD, w: cell.w - 2 * TABLE_PAD, h: cell.h - 2 * TABLE_PAD };
            const f = fitAtStep(text, role, g, step, inner.w, maxLines);
            if (!f || f.height > inner.h) { ok = false; if (step === steps - 1 && !blame) blame = { path, text, role, w: inner.w, h: inner.h, maxLines }; return; }
            used = Math.max(used, f.height / inner.h);
            els.push({ t: "box", ...cell, style });
            els.push({ t: "text", ...inner, h: f.height, text, size: f.size, role, align: "start", path });
          };
          if (s.mode === "table") {
            const cols = subjects.length + 1, nr = rows.length + 1;
            const cw = (box.w - (cols - 1) * CELL_GAP) / cols, ch = (box.h - (nr - 1) * CELL_GAP) / nr;
            const cell = (c: number, r: number): Box => ({ x: box.x + c * (cw + CELL_GAP), y: box.y + r * (ch + CELL_GAP), w: cw, h: ch });
            subjects.forEach((sub, c) => put(sub, "label", 2, cell(c + 1, 0), `${s.header}[${c}]`, "header"));
            rows.forEach((row, r) => {
              put(row.attribute, s.attr.role, s.attr.maxLines, cell(0, r + 1), `${s.bind}[${r}].attribute`, "header");
              row.values.forEach((v, c) => put(v, s.cell.role, s.cell.maxLines, cell(c + 1, r + 1), `${s.bind}[${r}].values[${c}]`, "cell"));
            });
          } else {
            const cols = subjects.length;
            const cw = (box.w - (cols - 1) * 24) / cols, rh = (box.h - HEADER_H - rows.length * CELL_GAP) / rows.length;
            subjects.forEach((sub, c) => {
              const x = box.x + c * (cw + 24);
              put(sub, "heading", 1, { x, y: box.y, w: cw, h: HEADER_H }, `${s.header}[${c}]`, "header");
              rows.forEach((row, r) => {
                const cell = { x, y: box.y + HEADER_H + CELL_GAP + r * (rh + CELL_GAP), w: cw, h: rh };
                const st = stackFields({ a: row.attribute, v: row.values[c] }, [{ ...s.attr, bind: "a" }, { ...s.cell, bind: "v" }], step, g,
                  cw - 2 * TABLE_PAD, rh - 2 * TABLE_PAD, undefined, fd => fd.bind === "a" ? `${s.bind}[${r}].attribute` : `${s.bind}[${r}].values[${c}]`);
                if (!st) { ok = false; if (step === steps - 1 && !blame) blame = { path: `${s.bind}[${r}].values[${c}]`, text: row.values[c], role: s.cell.role, w: cw - 2 * TABLE_PAD, h: (rh - 2 * TABLE_PAD) * 0.6, maxLines: s.cell.maxLines }; return; }
                used = Math.max(used, st.height / (rh - 2 * TABLE_PAD));
                els.push({ t: "box", ...cell, style: "cell" });
                for (const p of st.placed) els.push({ t: "text", x: cell.x + TABLE_PAD + p.x, y: cell.y + TABLE_PAD + p.y, w: p.w, h: p.h, text: p.text, size: p.size, role: p.role, align: "start", path: p.path });
              });
            });
          }
          if (ok) { A.els.push(...els); A.ranks.push(step / (steps - 1)); A.fills.push(used); done = true; }
        }
        if (!done && blame) {
          const bl = blame as NonNullable<typeof blame>;
          A.overflows.push({ path: bl.path, chars: bl.text.length, budget: charBudget(bl.role, g, bl.w, bl.h, bl.maxLines), kind: "text" });
        }
        break;
      }

      case "image": {
        const q = str(b.imageQuery);
        if (!q) { if (!s.optional) A.missing.push("imageQuery"); break; }
        A.els.push({ t: "image", ...box, query: q, bg: s.layer === "bg" });
        if (s.layer === "bg") A.els.push({ t: "box", ...box, style: "card", tone: "inverse" }); // scrim
        break;
      }
      case "icon": {
        const name = str(b.icon);
        if (name) A.els.push({ t: "icon", x: box.x + box.w / 4, y: box.y + box.h / 4, w: box.w / 2, h: box.h / 2, name });
        break;
      }
      case "formula": {
        const latex = str(b[s.bind]);
        if (!latex) { A.missing.push(s.bind); break; }
        // KaTeX may scale a formula down to 60%; beyond that it's too long for the slot.
        const minW = visibleLatexLength(latex) * 0.5 * 44 * 0.6;
        // Too long even at 60%: still render (KaTeX shrinks further), but ask for a shorter form.
        if (minW > box.w) A.soft.push({ path: s.bind, chars: latex.length, budget: Math.floor(latex.length * box.w / minW), kind: "formula" });
        A.els.push({ t: "formula", ...box, latex });
        break;
      }
      case "code": {
        const code = String(b[s.bind] ?? "").replace(/\t/g, "  ").replace(/\s+$/, "");
        const lines = code.split("\n");
        const longest = Math.max(...lines.map(x => x.length));
        const inner = { w: box.w - 2 * ITEM_PAD, h: box.h - 2 * ITEM_PAD };
        const size = sizesFor("mono", g).find(sz => lines.length <= s.maxLines && lines.length * sz * LINE_HEIGHT <= inner.h && longest * 0.6 * sz <= inner.w);
        if (!size) {
          const minSz = Math.min(...sizesFor("mono", g));
          A.overflows.push({ path: s.bind, chars: lines.length, budget: s.maxLines, kind: "lines", cols: Math.floor(inner.w / (0.6 * minSz)) });
          break;
        }
        A.els.push({ t: "code", ...box, code, size, language: str(b.language) });
        A.ranks.push(sizesFor("mono", g).indexOf(size) / 2); A.fills.push(lines.length * size * LINE_HEIGHT / inner.h);
        break;
      }
      case "diagram": {
        A.els.push({ t: "diagram", ...box, kind: s.diagram, data: Object.fromEntries(s.binds.map(k => [k, b[k]])) });
        break;
      }
      case "meta": {
        const chips = [b.minutes ? `${b.minutes} min` : "", str(b.grouping)].filter(Boolean);
        const w = (box.w - ITEM_GAP * (chips.length - 1)) / Math.max(1, chips.length);
        chips.forEach((c, i) => {
          const x = box.x + i * (w + ITEM_GAP);
          A.els.push({ t: "box", x, y: box.y + 8, w, h: box.h - 16, style: "chip" });
          A.els.push({ t: "text", x: x + 16, y: box.y + (box.h - labelSize(g) * LINE_HEIGHT) / 2, w: w - 32, h: Math.ceil(labelSize(g) * LINE_HEIGHT), text: c[0].toUpperCase() + c.slice(1), size: labelSize(g), role: "label", align: "center", path: "meta" });
        });
        break;
      }
    }
  }
  A.ok = !A.missing.length && !A.capacity.length && !A.overflows.length;
  return A;
}

function shorten(a: Box, b: Box) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const ta = Math.min(a.w / 2 / Math.abs(dx || 1e-9), a.h / 2 / Math.abs(dy || 1e-9)) * len + 6;
  const tb = Math.min(b.w / 2 / Math.abs(dx || 1e-9), b.h / 2 / Math.abs(dy || 1e-9)) * len + 6;
  return { x1: ax + (dx / len) * ta, y1: ay + (dy / len) * ta, x2: bx - (dx / len) * tb, y2: by - (dy / len) * tb };
}

/** Rough count of glyphs KaTeX will draw: commands collapse to one symbol, braces vanish. */
function visibleLatexLength(latex: string) {
  return latex.replace(/\\(frac|dfrac|sqrt|left|right|mathrm|text|operatorname|displaystyle)\b/g, "")
    .replace(/\\[a-zA-Z]+/g, "x").replace(/[{}^_\s]/g, "").length;
}

// ── scoring ─────────────────────────────────────────────────
export function score(l: LayoutSpec, a: Attempt, block: Block, g: GradeBand, hist: { id: string; family: string }[]): { total: number; why: string } {
  const gp = GRADE_PROFILES[g];
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 1);
  const readable = 1 - 0.6 * avg(a.ranks);                           // larger type is better
  const fill = avg(a.fills.map(f => (f < 0.15 ? 0.55 : f < 0.3 ? 0.8 : f > 0.97 ? 0.85 : 1))); // neither empty nor cramped
  const density = DENSITY_RANK[l.density] <= DENSITY_RANK[gp.maxDensity] ? 1 : 0.6;
  const hasImage = l.slots.some(s => s.kind === "image");
  const visual = (hasImage && (block as any).imageQuery ? (gp.image === "required" ? 0.3 : gp.image === "preferred" ? 0.18 : 0.1) : 0)
    + (l.family === "diagram" ? 0.08 : 0);
  const specific = (l.requires?.length ?? 0) * 0.15;                  // e.g. cycle layout for a cycle
  const p1 = hist[hist.length - 1], p2 = hist[hist.length - 2];
  const reuse = hist.filter(h => h.id === l.id).length;               // freshness across the whole deck
  const variety = -(p1?.id === l.id ? 0.5 : 0) - (p1?.family === l.family ? 0.2 : 0) - (p2?.family === l.family ? 0.1 : 0) - 0.04 * reuse;
  const total = 0.35 * readable + 0.25 * fill + 0.2 * density + visual + specific + variety;
  const why = `readable ${readable.toFixed(2)} · fill ${fill.toFixed(2)} · density ${density} · visual ${visual.toFixed(2)} · specific ${specific.toFixed(2)} · variety ${variety.toFixed(2)}`;
  return { total: +total.toFixed(4), why };
}

// ── splitting ───────────────────────────────────────────────
/** Arrays that can be spread across consecutive slides without changing meaning. */
export const SPLIT_KEY: Partial<Record<BlockType, string>> = {
  objectives: "items", vocabulary: "terms", explanation: "points", process: "steps", comparison: "rows",
  timeline: "events", hierarchy: "children", activity: "instructions", discussion: "questions",
  recap: "points", concept_map: "nodes", formula: "variables", code_example: "annotations",
  cause_effect: "causes", worked_example: "steps",
};

/** Build part p of a split. Worked examples keep the problem on every part and the answer on the last. */
function partOf(block: Block, key: string, chunk: unknown[], p: number, parts: number): Block {
  const b: any = { ...(block as any), [key]: chunk };
  if (block.type === "worked_example" && p < parts - 1) b.answer = "Continued on the next slide";
  return b as Block;
}
const NUMBERED = new Set<BlockType>(["process", "worked_example", "activity"]);

function chunk<T>(arr: T[], parts: number): T[][] {
  const base = Math.floor(arr.length / parts), extra = arr.length % parts;
  const out: T[][] = [];
  let i = 0;
  for (let p = 0; p < parts; p++) { const n = base + (p < extra ? 1 : 0); out.push(arr.slice(i, i + n)); i += n; }
  return out;
}

// ── public API ──────────────────────────────────────────────
export function candidates(block: Block, g: GradeBand) {
  return LAYOUTS.filter(l => l.accepts === block.type && l.gradeFit.includes(g));
}

function best(block: Block, g: GradeBand, hist: { id: string; family: string }[], startAt = 0, relaxMin = false) {
  let top: { l: LayoutSpec; a: Attempt; s: { total: number; why: string } } | null = null;
  for (const l of candidates(block, g)) {
    const a = tryLayout(block, l, g, startAt, relaxMin);
    if (!a.ok) continue;
    const s = score(l, a, block, g, hist);
    if (!top || s.total > top.s.total) top = { l, a, s }; // ties keep library order: deterministic
  }
  return top;
}

const notesOf = (block: Block, l: LayoutSpec) => {
  const out: string[] = [];
  const b = block as any;
  for (const k of l.notesBind ?? []) {
    if (k === "answer" && Array.isArray(b.options)) out.push(`Answer: ${"ABCD"[b.answer]}. ${b.options[b.answer]}`);
    else if (b[k] !== undefined && k !== "answer") out.push(str(b[k]));
  }
  if (b.notes) out.push(str(b.notes));
  return out;
};

/** Paint order: background photo, connectors, boxes, then content. Renderers draw elements in this order. */
const LAYER: Record<El["t"], number> = { image: 0, connector: 1, box: 2, diagram: 3, formula: 3, code: 3, icon: 3, marker: 4, text: 5 };
const ordered = (els: El[]) => els.map((e, i) => ({ e, i }))
  .sort((a, b) => (LAYER[a.e.t] - (a.e.t === "box" && a.e.tone === "inverse" ? 1.5 : 0)) - (LAYER[b.e.t] - (b.e.t === "box" && b.e.tone === "inverse" ? 1.5 : 0)) || a.i - b.i)
  .map(x => x.e);

const place = (block: Block, l: LayoutSpec, a: Attempt, s: { total: number; why: string }, extra: Partial<Placement> = {}): Placement =>
  ({ layoutId: l.id, block, elements: ordered(a.els), score: s.total, copyFit: [...a.soft], trimmed: [], dropped: [], notes: notesOf(block, l), why: s.why, ...extra });

/** Match one block. Returns one placement, or several if a long list was split. */
export function matchBlock(block: Block, g: GradeBand, hist: { id: string; family: string }[] = []): Placement[] {
  const top = best(block, g, hist);
  if (top) return [place(block, top.l, top.a, top.s)];

  // 1. split a long list across slides
  const key = SPLIT_KEY[block.type];
  const arr: unknown[] | undefined = key ? (block as any)[key] : undefined;
  if (key && Array.isArray(arr)) {
    for (let parts = 2; parts <= Math.min(4, arr.length); parts++) {
      const chunks = chunk(arr, parts);
      const out: Placement[] = [];
      const h = [...hist];
      let start = 0;
      for (let p = 0; p < parts; p++) {
        const sub = partOf(block, key, chunks[p], p, parts);
        const t = best(sub, g, h, NUMBERED.has(block.type) ? start : 0, true);
        if (!t) break;
        out.push(place(sub, t.l, t.a, t.s, { part: { index: p + 1, of: parts } }));
        h.push({ id: t.l.id, family: t.l.family });
        start += chunks[p].length;
      }
      if (out.length === parts) return out;
    }
  }

  // 2. copy-fit + deterministic trim. Long splittable lists are chunked first, so trimming never has to drop items.
  const fb = fallbackFor(block.type);
  if (key && Array.isArray(arr) && arr.length > (fb.capacity[key] ? effMax(fb, key, g) : Infinity)) {
    const parts = Math.ceil(arr.length / effMax(fb, key, g));
    const chunks = chunk(arr, parts);
    const out: Placement[] = [];
    const h = [...hist];
    let start = 0;
    for (let p = 0; p < parts; p++) {
      const sub = partOf(block, key, chunks[p], p, parts);
      const pl = repairOn(sub, g, h, NUMBERED.has(block.type) ? start : 0);
      out.push({ ...pl, part: { index: p + 1, of: parts } });
      h.push({ id: pl.layoutId, family: LAYOUTS.find(x => x.id === pl.layoutId)!.family });
      start += chunks[p].length;
    }
    return out;
  }
  return [repairOn(block, g, hist, 0)];
}

/** Last resort for one block: request a rewrite, and trim (flagged) so the slide still renders. */
function repairOn(block: Block, g: GradeBand, hist: { id: string; family: string }[], startAt: number): Placement {
  const pool = candidates(block, g);
  const fb = fallbackFor(block.type);
  const order = [fb, ...pool.filter(l => l !== fb)].filter(l => tryLayout(block, l, g, startAt, true).missing.length === 0);
  for (const l of order) {
    const work: any = structuredClone(block);
    const dropped: string[] = [], trimmed: string[] = [];
    const requested: Overflow[] = [];
    // too many items for anything → keep the first ones, flag the rest
    for (const c of tryLayout(work, l, g, startAt, true).capacity) {
      if (c.n > c.hi && Array.isArray(work[c.key])) {
        dropped.push(...work[c.key].slice(c.hi).map((_: unknown, i: number) => `${c.key}[${c.hi + i}]`));
        work[c.key] = work[c.key].slice(0, c.hi);
      }
    }
    for (let round = 0; round < 6; round++) {
      const a = tryLayout(work, l, g, startAt, true);
      if (a.ok) {
        const s = score(l, a, work, g, hist);
        return place(work, l, a, s, { copyFit: [...requested, ...a.soft], trimmed, dropped, why: `${s.why} · repaired` });
      }
      if (a.capacity.length || a.missing.length) break;
      for (const o of a.overflows) {
        if (!requested.some(r => r.path === o.path)) requested.push(o);
        if (o.kind === "lines") {
          // hard-wrap long lines with an indented continuation, then keep what fits
          const cols = o.cols ?? 60;
          const wrapped = String(work.code).split("\n").flatMap((ln: string) => {
            const out: string[] = [];
            let rest = ln;
            while (rest.length > cols) { const cut = rest.lastIndexOf(" ", cols) > cols * 0.5 ? rest.lastIndexOf(" ", cols) : cols; out.push(rest.slice(0, cut)); rest = "    " + rest.slice(cut).trimStart(); }
            return [...out, rest];
          });
          work.code = wrapped.slice(0, o.budget).join("\n");
          if (!trimmed.includes(o.path)) trimmed.push(o.path);
          continue;
        }
        setPath(work, o.path, (v: string) => trimToBudget(v, Math.max(8, Math.floor(o.budget * (1 - 0.12 * round)))));
        if (!trimmed.includes(o.path)) trimmed.push(o.path);
      }
    }
  }
  throw new Error(`unplaceable ${block.type} at ${g}`);
}

function setPath(obj: any, path: string, fn: (v: string) => string) {
  const parts = path.match(/[^.[\]]+/g)!;
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[isNaN(+parts[i]) ? parts[i] : +parts[i]];
  const last = isNaN(+parts[parts.length - 1]) ? parts[parts.length - 1] : +parts[parts.length - 1];
  if (typeof o[last] === "string") o[last] = fn(o[last]);
}

/** Match a whole deck in order, with variety memory. */
export function matchDeck(blocks: Block[], g: GradeBand): Placement[] {
  const out: Placement[] = [];
  const hist: { id: string; family: string }[] = [];
  for (const b of blocks) {
    const ps = matchBlock(b, g, hist);
    for (const p of ps) { out.push(p); const l = LAYOUTS.find(x => x.id === p.layoutId)!; hist.push({ id: l.id, family: l.family }); }
  }
  return out;
}

