// ─────────────────────────────────────────────────────────────
// Native diagram geometry.
//
// Five layouts declare a diagram slot; between them they need exactly
// three box geometries and never more than ten top-level nodes. That
// is not a graph-layout problem, so there is no graph-layout engine
// here — just five closed-form formulas. Pure arithmetic: same kind +
// data + box + grade in, same primitives out. No clock, no RNG, no DOM.
//
// THE BOX IS GUARANTEED BY CONSTRUCTION, NOT BY SCALING. Every
// primitive is emitted in absolute slide pixels computed from the box
// the matcher hands over, so nothing is ever squeezed afterwards and
// nothing distorts. Text is sized with `sizesFor` and the same
// descending-size search the matcher runs for its `code` and `repeat`
// cases; when the grade's smallest font still does not fit, the string
// goes to `overflow` instead of being clipped. The matcher treats that
// exactly like a text overflow, so the block falls to this layout's
// non-diagram sibling (ce_columns, hier_columns, cmap_radial,
// compare_table) — which is the right answer, not a failure.
// ─────────────────────────────────────────────────────────────
import { charBudget, sizesFor, wrapToLines } from "./fit";
import type { Tone } from "./layouts";
import type { Overflow } from "./matcher";
import { GRADE_PROFILES, LABEL_H, LINE_HEIGHT, type Box, type GradeBand, type TypeRole } from "./tokens";

export type DiagramKind = "tree" | "venn" | "fishbone" | "chain" | "mindmap" | "flow";

/** Semantic fills. Each renderer maps these onto its own theme; no colour values live here. */
export type DiaFill = "none" | "card" | "accent" | "positive" | "header";
export type DiaStroke = Tone | "none";

export type DiaShape =
  /** `transparency` is a percentage, so a Venn's two circles show their overlap. */
  | { s: "ellipse"; x: number; y: number; w: number; h: number; fill: DiaFill; stroke: DiaStroke; transparency?: number }
  | { s: "rect"; x: number; y: number; w: number; h: number; r: number; fill: DiaFill; stroke: DiaStroke; transparency?: number }
  /** A rhombus touching the midpoints of its box: the flowchart decision symbol. */
  | { s: "diamond"; x: number; y: number; w: number; h: number; fill: DiaFill; stroke: DiaStroke; transparency?: number }
  | { s: "line"; x1: number; y1: number; x2: number; y2: number; arrow: boolean; dash: boolean };

/** One run of text. Pre-wrapped, because SVG <text> does not wrap and PowerPoint must not re-wrap. */
export interface DiaLabel {
  x: number; y: number; w: number; h: number;
  lines: string[]; size: number; role: TypeRole;
  align: "start" | "center"; tone?: Tone;
  /** Block path, as the matcher's overflow records use ("similarities[2]"). "label" = a fixed caption. */
  path: string;
}

export interface DiagramGeom {
  shapes: DiaShape[];
  labels: DiaLabel[];
  /** Strings that will not fit even at the grade's smallest font. Same shape the matcher uses for text. */
  overflow: Overflow[];
  /** 0 = everything took its largest size, 1 = everything fell to the grade minimum. */
  rank: number;
  /** Share of the available text height actually used. */
  fill: number;
}

// ── data shapes (mirrors of the block fields each slot binds) ──
export interface ChainData { causes: string[]; event: string; effects: string[] }
export interface FishboneData { causes: string[]; event: string; effects: string[] }
export interface TreeData { root: string; children: { label: string; items?: string[] }[] }
export interface VennData { subjects: string[]; rows: { attribute: string; values: string[] }[]; similarities: string[] }
export interface MindmapData { center: string; nodes: { label: string; relation: string }[] }
export interface FlowData { steps: string[]; question: string; yes: string; no: string }

// ── spacing ─────────────────────────────────────────────────
const GAP = 24;            // between sibling nodes
const PAD_X = 20;          // node text inset
const PAD_Y = 14;
const RADIUS = 18;         // rounded-rect corner
const STRIP = LABEL_H + 8; // caption strip above a zone
const CLEAR = 8;           // gap between a connector end and the node it touches
/** charBudget wants a line cap; diagram nodes are bounded by height, not by a line count. */
const ANY_LINES = 99;

const r2 = (v: number) => Math.round(v * 100) / 100;
const inset = (b: Box, px = PAD_X, py = PAD_Y): Box => ({ x: b.x + px, y: b.y + py, w: b.w - 2 * px, h: b.h - 2 * py });

/** The largest inscribed rectangle in an ellipse is (w, h) / √2 — the usable text area of a circle. */
const INSCRIBED = Math.SQRT1_2;
const inEllipse = (b: Box, px = PAD_X, py = PAD_Y): Box =>
  inset({ x: b.x + b.w * (1 - INSCRIBED) / 2, y: b.y + b.h * (1 - INSCRIBED) / 2, w: b.w * INSCRIBED, h: b.h * INSCRIBED }, px, py);

type Anchor = "top" | "middle" | "bottom";
interface Fit { lines: string[]; size: number; h: number }
/** One column of text inside one box. Several of these are fitted together at one size. */
interface Spec { entries: Entry[]; inner: Box; gap?: number; anchor?: Anchor }

interface Entry {
  path: string; text: string; role: TypeRole; tone?: Tone; align?: "start" | "center";
  /** Characters to report on overflow, when `text` carries a bullet the block field does not. */
  chars?: number;
  /** Overrides the column's gap before this entry, so pairs can group more tightly than rows. */
  gap?: number;
}

/** Accumulates primitives and the fit statistics the matcher scores on. */
class Sheet {
  shapes: DiaShape[] = [];
  labels: DiaLabel[] = [];
  overflow: Overflow[] = [];
  private ranks: number[] = [];
  private fills: number[] = [];
  constructor(readonly g: GradeBand) {}

  rect(b: Box, fill: DiaFill, stroke: DiaStroke = "none", r = RADIUS) {
    this.shapes.push({ s: "rect", x: r2(b.x), y: r2(b.y), w: r2(b.w), h: r2(b.h), r, fill, stroke });
    return b;
  }
  diamond(b: Box, fill: DiaFill, stroke: DiaStroke = "none") {
    this.shapes.push({ s: "diamond", x: r2(b.x), y: r2(b.y), w: r2(b.w), h: r2(b.h), fill, stroke });
    return b;
  }
  ellipse(b: Box, fill: DiaFill, stroke: DiaStroke = "none", transparency?: number) {
    this.shapes.push({ s: "ellipse", x: r2(b.x), y: r2(b.y), w: r2(b.w), h: r2(b.h), fill, stroke, ...(transparency ? { transparency } : {}) });
    return b;
  }
  line(x1: number, y1: number, x2: number, y2: number, arrow = false, dash = false) {
    this.shapes.push({ s: "line", x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), arrow, dash });
  }

  /** A fixed caption ("Cause", "Both"). Short by construction, so it never overflows. */
  caption(text: string, x: number, y: number, w: number, align: "start" | "center" = "center") {
    const size = Math.max(22, GRADE_PROFILES[this.g].minFont);
    this.labels.push({ x: r2(x), y: r2(y), w: r2(w), h: Math.ceil(size * LINE_HEIGHT), lines: [text], size, role: "label", align, tone: "muted", path: "label" });
  }

  /** One string in its own box. */
  one(e: Entry, inner: Box, anchor: Anchor = "middle"): boolean {
    return this.group([{ entries: [e], inner, gap: 0, anchor }]);
  }

  /** A column of strings in one box, all at one size. */
  column(entries: Entry[], inner: Box, gap = GAP / 2, anchor: Anchor = "middle"): boolean {
    return this.group([{ entries, inner, gap, anchor }]);
  }

  /** Fit one group at one exact step of the ladder. Null if it does not fit there. */
  private at(s: Spec, step: number) {
    const gap = s.gap ?? GAP / 2;
    const fits = s.entries.map(e => {
      const sizes = sizesFor(e.role, this.g);
      const size = sizes[Math.min(step, sizes.length - 1)];
      const lines = wrapToLines(e.text, size, s.inner.w, e.role);
      return lines ? { lines, size, h: Math.ceil(lines.length * size * LINE_HEIGHT) } : null;
    });
    if (fits.some(f => !f)) return null;
    const lead = (i: number) => (i === 0 ? 0 : s.entries[i].gap ?? gap);
    const total = (fits as Fit[]).reduce((t, f, i) => t + f.h + lead(i), 0);
    return total <= s.inner.h ? { fits: fits as Fit[], total, lead } : null;
  }

  /** The descending-size search, run across every group at once. */
  private search(specs: Spec[]) {
    const live = specs.filter(s => s.entries.length);
    if (!live.length) return { step: 0, steps: 1, plans: specs.map(() => null) };
    const steps = Math.max(...live.flatMap(s => s.entries.map(e => sizesFor(e.role, this.g).length)));
    for (let step = 0; step < steps; step++) {
      const plans = specs.map(s => (s.entries.length ? this.at(s, step) : null));
      if (specs.every((s, i) => !s.entries.length || plans[i])) return { step, steps, plans };
    }
    return null;
  }

  /** Heights the groups need at the one step that fits them all, so a caller can size a panel. */
  measureGroup(specs: Spec[]): number[] | null {
    const r = this.search(specs);
    return r ? specs.map((_, i) => r.plans[i]?.total ?? 0) : null;
  }

  /**
   * Set several groups at ONE step of the size ladder — the matcher's `repeat` rule:
   * peers read as peers only when they are set at the same size. Siblings across
   * columns therefore share a size, and one long string shrinks all of them together.
   */
  group(specs: Spec[]): boolean {
    const r = this.search(specs);
    if (!r) { for (const s of specs) if (s.entries.length) this.blame(s); return false; }
    specs.forEach((s, i) => {
      const p = r.plans[i];
      if (!p) return;
      let y = s.anchor === "top" ? s.inner.y : s.anchor === "bottom" ? s.inner.y + s.inner.h - p.total : s.inner.y + (s.inner.h - p.total) / 2;
      s.entries.forEach((e, k) => {
        const f = p.fits[k];
        y += p.lead(k);
        this.labels.push({ x: r2(s.inner.x), y: r2(y), w: r2(s.inner.w), h: f.h, lines: f.lines, size: f.size, role: e.role, align: e.align ?? "center", tone: e.tone, path: e.path });
        y += f.h;
      });
      this.ranks.push(r.steps > 1 ? r.step / (r.steps - 1) : 0);
      this.fills.push(Math.min(1, p.total / s.inner.h));
    });
    return true;
  }

  /**
   * Nothing fits. Blame every string that is over its fair share of the box, so the
   * copy-fitter gets a real target — and so the matcher rejects this layout.
   */
  private blame(s: Spec) {
    const gap = s.gap ?? GAP / 2;
    const share = (s.inner.h - s.entries.reduce((t, e, i) => t + (i ? e.gap ?? gap : 0), 0)) / s.entries.length;
    const budget = (e: Entry) => charBudget(e.role, this.g, s.inner.w, share, ANY_LINES);
    const over = s.entries.filter(e => (e.chars ?? e.text.length) > budget(e));
    const blamed = over.length ? over : [[...s.entries].sort((a, b) => b.text.length - a.text.length)[0]];
    for (const e of blamed) this.overflow.push({ path: e.path, chars: e.chars ?? e.text.length, budget: budget(e), kind: "text" });
  }

  done(): DiagramGeom {
    const avg = (xs: number[], d: number) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : d);
    return { shapes: this.shapes, labels: this.labels, overflow: this.overflow, rank: +avg(this.ranks, 0).toFixed(4), fill: +avg(this.fills, 1).toFixed(4) };
  }
}

// ── chain: cause → event → effects ──────────────────────────
// Three zones on one baseline with arrow gutters between them. One
// arrow from the event to each effect, so parallel outcomes never read
// as a sequence. Cause and event share a box size; the effects column
// splits its zone n ways.
const CHAIN_H = 300;          // tallest a single node gets, so one effect is not a 573px slab
const CHAIN_GUTTER = 88;      // arrow run between zones
const CHAIN_SPLIT = [0.36, 0.28, 0.36];

function chain(d: ChainData, box: Box, sh: Sheet) {
  const body: Box = { x: box.x, y: box.y + STRIP, w: box.w, h: box.h - STRIP };
  const free = box.w - 2 * CHAIN_GUTTER;
  const [w0, w1, w2] = CHAIN_SPLIT.map(f => free * f);
  const x0 = box.x, x1 = x0 + w0 + CHAIN_GUTTER, x2 = x1 + w1 + CHAIN_GUTTER;

  const mainH = Math.min(CHAIN_H, body.h);
  const mainY = body.y + (body.h - mainH) / 2;
  const cy = mainY + mainH / 2;

  const n = d.effects.length;
  const eh = Math.min(CHAIN_H, (body.h - GAP * (n - 1)) / n);
  const ey0 = body.y + (body.h - (eh * n + GAP * (n - 1))) / 2;

  sh.caption("Cause", x0, mainY - STRIP, w0);
  sh.caption("Event", x1, mainY - STRIP, w1);
  sh.caption(n > 1 ? "Effects" : "Effect", x2, ey0 - STRIP, w2);

  const cause: Box = { x: x0, y: mainY, w: w0, h: mainH };
  const event: Box = { x: x1, y: mainY, w: w1, h: mainH };
  sh.rect(cause, "card");
  sh.rect(event, "accent", "accent");
  sh.line(x0 + w0 + CLEAR, cy, x1 - CLEAR, cy, true);

  sh.one({ path: "event", text: d.event, role: "heading", tone: "accent" }, inset(event));

  const boxes = d.effects.map((_, i) => ({ x: x2, y: ey0 + i * (eh + GAP), w: w2, h: eh }));
  boxes.forEach(b => { sh.rect(b, "positive", "positive"); sh.line(x1 + w1 + CLEAR, cy, x2 - CLEAR, b.y + b.h / 2, true); });
  sh.group([
    { entries: [{ path: "causes[0]", text: d.causes[0], role: "body" }], inner: inset(cause) },
    ...boxes.map((b, i) => ({ entries: [{ path: `effects[${i}]`, text: d.effects[i], role: "body" as TypeRole, tone: "positive" as Tone }], inner: inset(b) })),
  ]);
}

// ── tree: root over evenly distributed children ─────────────
// Root band, a horizontal bus under it, one vertical drop per child.
// Each child is a header over a card of its items. Column width is the
// only thing that varies with n, so the drops are always vertical and
// the bus is always level: no edge routing, no crossings possible.
const TREE_ROOT_W = 560, TREE_ROOT_H = 130, TREE_DROP = 60, TREE_HEAD_H = 120, TREE_PANEL_GAP = 16;

function tree(d: TreeData, box: Box, sh: Sheet) {
  const n = d.children.length;
  const cw = (box.w - GAP * (n - 1)) / n;
  const listOf = (i: number) => (d.children[i].items ?? []).map((t, k) =>
    ({ path: `children[${i}].items[${k}]`, text: `• ${t}`, chars: t.length, role: "body" as TypeRole, align: "start" as const }));

  // Every item card gets the same height — the tallest list's — so the columns line
  // up, and the whole tree is then centred in the slot instead of hanging from the top.
  const free = box.h - TREE_ROOT_H - TREE_DROP - TREE_HEAD_H - TREE_PANEL_GAP;
  const probe: Box = { x: box.x, y: box.y, w: cw, h: free };
  const needs = sh.measureGroup(d.children.map((_, i) => ({ entries: listOf(i), inner: inset(probe) })));
  const panelH = needs === null ? free : Math.min(free, Math.max(0, ...needs.map(x => (x > 0 ? x + 2 * PAD_Y + 1 : 0))));
  const used = TREE_ROOT_H + TREE_DROP + TREE_HEAD_H + (panelH > 0 ? TREE_PANEL_GAP + panelH : 0);
  const y0 = box.y + Math.max(0, (box.h - used) / 2);

  const rootW = Math.min(TREE_ROOT_W, box.w);
  const root: Box = { x: box.x + (box.w - rootW) / 2, y: y0, w: rootW, h: TREE_ROOT_H };
  sh.rect(root, "accent", "accent");
  sh.one({ path: "root", text: d.root, role: "heading", tone: "accent" }, inset(root));

  const bus = y0 + TREE_ROOT_H + TREE_DROP / 2;
  const top = y0 + TREE_ROOT_H + TREE_DROP;
  const cx = (i: number) => box.x + i * (cw + GAP) + cw / 2;
  sh.line(root.x + rootW / 2, root.y + root.h, root.x + rootW / 2, bus);
  if (n > 1) sh.line(cx(0), bus, cx(n - 1), bus);

  const heads: Spec[] = [], lists: Spec[] = [];
  d.children.forEach((c, i) => {
    sh.line(cx(i), bus, cx(i), top);
    const head: Box = { x: box.x + i * (cw + GAP), y: top, w: cw, h: TREE_HEAD_H };
    sh.rect(head, "header", "neutral");
    heads.push({ entries: [{ path: `children[${i}].label`, text: c.label, role: "heading" }], inner: inset(head) });
    if (!listOf(i).length || panelH <= 0) return;
    const panel: Box = { x: head.x, y: top + TREE_HEAD_H + TREE_PANEL_GAP, w: cw, h: panelH };
    sh.rect(panel, "card");
    lists.push({ entries: listOf(i), inner: inset(panel), anchor: "top" });
  });
  sh.group(heads);
  sh.group(lists);
}

// ── mindmap: centre on the left, nodes fanning right ────────
// One vertical bus carries every edge, so each node gets a level run at
// its own centre and the relation rides that run in its own band. Bands
// never overlap, so two relations never can either — whatever n is.
const MM_CENTRE_W = 420, MM_CENTRE_H = 220, MM_NODE_W = 520, MM_BUS = 48, MM_REL_IN = 40, MM_REL_OUT = 60;

function mindmap(d: MindmapData, box: Box, sh: Sheet) {
  const cy = box.y + box.h / 2;
  const centre: Box = { x: box.x, y: cy - MM_CENTRE_H / 2, w: MM_CENTRE_W, h: MM_CENTRE_H };
  sh.ellipse(centre, "accent", "accent");
  sh.one({ path: "center", text: d.center, role: "heading", tone: "accent" }, inEllipse(centre));

  const n = d.nodes.length;
  const nh = (box.h - GAP * (n - 1)) / n;
  const nodeX = box.x + box.w - MM_NODE_W;
  const bus = box.x + MM_CENTRE_W + MM_BUS;
  const mid = (i: number) => box.y + i * (nh + GAP) + nh / 2;
  sh.line(centre.x + centre.w + CLEAR, cy, bus, cy);
  if (n > 1) sh.line(bus, mid(0), bus, mid(n - 1));

  const relX = bus + MM_REL_IN, relW = nodeX - CLEAR - MM_REL_OUT - relX;
  const labels: Spec[] = [], relations: Spec[] = [];
  d.nodes.forEach((node, i) => {
    const b: Box = { x: nodeX, y: box.y + i * (nh + GAP), w: MM_NODE_W, h: nh };
    sh.rect(b, "card", "neutral");
    sh.line(bus, mid(i), b.x - CLEAR, mid(i), true);
    labels.push({ entries: [{ path: `nodes[${i}].label`, text: node.label, role: "heading" }], inner: inset(b) });
    // The relation names the edge, so it is set just above the edge, inside the
    // half-band that belongs to this node alone — two relations can never collide.
    relations.push({ entries: [{ path: `nodes[${i}].relation`, text: node.relation, role: "caption", tone: "muted" }],
      inner: { x: relX, y: b.y, w: relW, h: nh / 2 - CLEAR }, anchor: "bottom" });
  });
  sh.group(labels);
  sh.group(relations);
}

// ── venn: two set circles and their lens ────────────────────
// Two equal ellipses, overlapping by a fixed fraction of the box. Text
// goes in rectangles INSCRIBED in each region, computed from the ellipse
// equation — a crescent and a lens hold far less than their bounding box,
// and pretending otherwise is how Venn text ends up outside its circle.
const VENN_OVERLAP = 0.265;   // overlap width as a fraction of the box
const VENN_LUNE_IN = 110;     // outer inset of the lune text rect: trades width for height
const VENN_CLEAR = 24;        // keep lune text clear of the overlap boundary
const VENN_LENS_IN = 48;      // inset of the lens text rect from the overlap edges
const VENN_ALPHA = 42;        // % transparency, so the overlap reads as an overlap
const VENN_PAIR = 4, VENN_ROW = 16;

function venn(d: VennData, box: Box, sh: Sheet) {
  const ew = (box.w + box.w * VENN_OVERLAP) / 2;
  const top = box.y + STRIP, eh = box.h - STRIP;
  const rx = ew / 2, ry = eh / 2;
  const cy = top + ry;
  const cxL = box.x + rx, cxR = box.x + box.w - rx;
  /** Half-height of an ellipse dx from its centre — the only maths a Venn needs. */
  const halfAt = (dx: number) => ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2));

  sh.ellipse({ x: box.x, y: top, w: ew, h: eh }, "accent", "accent", VENN_ALPHA);
  sh.ellipse({ x: box.x + box.w - ew, y: top, w: ew, h: eh }, "positive", "positive", VENN_ALPHA);

  // A rectangle is inside an ellipse when both of its outer corners are, so the
  // binding half-height is the smaller of the two edges'.
  const region = (x0: number, x1: number, c: number): Box => {
    const b = Math.min(halfAt(x0 - c), halfAt(x1 - c));
    return { x: x0, y: cy - b, w: x1 - x0, h: 2 * b };
  };
  const lune = [
    region(box.x + VENN_LUNE_IN, cxR - rx - VENN_CLEAR, cxL),
    region(cxL + rx + VENN_CLEAR, box.x + box.w - VENN_LUNE_IN, cxR),
  ];
  const lens = region((cxR - rx) + VENN_LENS_IN, (cxL + rx) - VENN_LENS_IN, cxL);

  const tones: Tone[] = ["accent", "positive"];
  const pair = [0, 1];
  sh.group(pair.map(i => ({ entries: [{ path: `subjects[${i}]`, text: d.subjects[i] ?? "", role: "label" as TypeRole, tone: tones[i] }],
    inner: { x: lune[i].x, y: box.y, w: lune[i].w, h: STRIP } })));
  sh.group(pair.map(i => ({
    entries: d.rows.flatMap((row, r) => [
      { path: `rows[${r}].attribute`, text: row.attribute, role: "label" as TypeRole, tone: "muted" as Tone, gap: VENN_ROW },
      { path: `rows[${r}].values[${i}]`, text: row.values[i] ?? "", role: "body" as TypeRole, gap: VENN_PAIR },
    ]),
    inner: lune[i], gap: VENN_PAIR,
  })));
  sh.caption("Both", lens.x, box.y, lens.w);
  sh.column(d.similarities.map((t, k) => ({ path: `similarities[${k}]`, text: t, role: "body" as TypeRole })), lens, VENN_ROW);
}

// ── fishbone: spine, ribs, head ─────────────────────────────
// A fixed skeleton, not a routed graph: the spine is level, the causes
// fill ceil(n/2) columns above and below it, and each rib is one straight
// segment from its column to a point on the spine. Nothing can cross.
const FB_HEAD_W = 420, FB_HEAD_H = 180, FB_BAND = 90, FB_ROW_H = 280, FB_SLANT = 70, FB_COL_GAP = 40;

function fishbone(d: FishboneData, box: Box, sh: Sheet) {
  const cy = box.y + box.h / 2;
  const railX = box.x + box.w - FB_HEAD_W;
  const head: Box = { x: railX, y: cy - FB_HEAD_H / 2, w: FB_HEAD_W, h: FB_HEAD_H };
  sh.rect(head, "accent", "accent");
  sh.one({ path: "event", text: d.event, role: "heading", tone: "accent" }, inset(head));
  sh.line(box.x + GAP, cy, railX - CLEAR, cy, true);

  // effects hang off the head, under their own caption
  const n = d.effects.length;
  const capY = head.y + head.h + 24;
  const eTop = capY + LABEL_H + 6, eH = (box.y + box.h - eTop - GAP * (n - 1)) / n;
  sh.caption(n > 1 ? "Effects" : "Effect", railX, capY, FB_HEAD_W);
  sh.line(railX + FB_HEAD_W / 2, head.y + head.h, railX + FB_HEAD_W / 2, capY, false, true);
  sh.group(d.effects.map((t, i) => {
    const b: Box = { x: railX, y: eTop + i * (eH + GAP), w: FB_HEAD_W, h: eH };
    sh.rect(b, "positive", "positive");
    return { entries: [{ path: `effects[${i}]`, text: t, role: "body" as TypeRole, tone: "positive" as Tone }], inner: inset(b, PAD_X, 10) };
  }));

  const cols = Math.ceil(d.causes.length / 2);
  const cw = (box.w - FB_HEAD_W - FB_COL_GAP - GAP * (cols - 1)) / cols;
  sh.group(d.causes.map((t, i) => {
    const up = i % 2 === 0, j = Math.floor(i / 2);
    const b: Box = { x: box.x + j * (cw + GAP), y: up ? cy - FB_BAND - FB_ROW_H : cy + FB_BAND, w: cw, h: FB_ROW_H };
    sh.rect(b, "card", "neutral");
    const mx = b.x + cw / 2;
    sh.line(mx + FB_SLANT, cy, mx, up ? b.y + b.h : b.y);
    return { entries: [{ path: `causes[${i}]`, text: t, role: "body" as TypeRole }], inner: inset(b) };
  }));
}

// ── flow: steps → decision, Yes to the right, No below ──────
// One row: the steps, then the decision diamond, then the Yes outcome.
// The No outcome sits directly under the diamond. Every edge is a single
// horizontal or vertical run between fixed cells, so nothing is routed and
// nothing can cross. The diamond's text goes in its inscribed rectangle
// (half its width and height), which is why it gets a wider cell.
const FLOW_GUTTER = 84;               // arrow run between cells; also holds the "Yes" caption
const FLOW_VGAP = 100;                // drop from the diamond to the No outcome
const FLOW_H = 230;                   // cell height, so a short flow is not a slab
const FLOW_DIAMOND = 1.6, FLOW_OUT = 1.25; // cell widths relative to a step

function flow(d: FlowData, box: Box, sh: Sheet) {
  const n = d.steps.length;
  const unit = (box.w - FLOW_GUTTER * (n + 1)) / (n + FLOW_DIAMOND + FLOW_OUT);
  const dW = unit * FLOW_DIAMOND, oW = unit * FLOW_OUT;
  const h = Math.min(FLOW_H, (box.h - FLOW_VGAP) / 2);
  const y0 = box.y + (box.h - (2 * h + FLOW_VGAP)) / 2;
  const cy = y0 + h / 2;

  const steps: Box[] = d.steps.map((_, i) => ({ x: box.x + i * (unit + FLOW_GUTTER), y: y0, w: unit, h }));
  const dia: Box = { x: box.x + n * (unit + FLOW_GUTTER), y: y0, w: dW, h };
  const yes: Box = { x: dia.x + dW + FLOW_GUTTER, y: y0, w: oW, h };
  const no: Box = { x: dia.x, y: y0 + h + FLOW_VGAP, w: dW, h };

  steps.forEach((b, i) => {
    sh.rect(b, "card", "neutral");
    const next = i + 1 < n ? steps[i + 1].x : dia.x;
    sh.line(b.x + b.w + CLEAR, cy, next - CLEAR, cy, true);
  });
  sh.diamond(dia, "accent", "accent");
  sh.rect(yes, "positive", "positive");
  sh.rect(no, "card", "negative");

  sh.line(dia.x + dW + CLEAR, cy, yes.x - CLEAR, cy, true);
  sh.caption("Yes", dia.x + dW, cy - LABEL_H - 10, FLOW_GUTTER);
  const mx = dia.x + dW / 2;
  sh.line(mx, y0 + h + CLEAR, mx, no.y - CLEAR, true);
  sh.caption("No", mx + 14, y0 + h + (FLOW_VGAP - LABEL_H) / 2, 70, "start");

  const inner: Box = { x: dia.x + dW / 4 + 4, y: y0 + h / 4 + 2, w: dW / 2 - 8, h: h / 2 - 4 };
  sh.one({ path: "question", text: d.question, role: "body", tone: "accent" }, inner);
  sh.group(steps.map((b, i) => ({ entries: [{ path: `steps[${i}]`, text: d.steps[i], role: "body" as TypeRole }], inner: inset(b) })));
  sh.group([
    { entries: [{ path: "yes", text: d.yes, role: "body", tone: "positive" }], inner: inset(yes) },
    { entries: [{ path: "no", text: d.no, role: "body" }], inner: inset(no) },
  ]);
}

// ── public API ──────────────────────────────────────────────
/**
 * Lay one diagram out inside `box`. Throws for a kind it does not draw;
 * the matcher catches that and keeps its placeholder, so a bug here can
 * never take down a whole deck.
 */
export function layoutDiagram(kind: string, data: Record<string, unknown>, box: Box, grade: GradeBand): DiagramGeom {
  const sh = new Sheet(grade);
  switch (kind) {
    case "chain": chain(data as unknown as ChainData, box, sh); break;
    case "tree": tree(data as unknown as TreeData, box, sh); break;
    case "mindmap": mindmap(data as unknown as MindmapData, box, sh); break;
    case "venn": venn(data as unknown as VennData, box, sh); break;
    case "fishbone": fishbone(data as unknown as FishboneData, box, sh); break;
    case "flow": flow(data as unknown as FlowData, box, sh); break;
    default: throw new Error(`no native layout for "${kind}" diagrams`);
  }
  return sh.done();
}

// ── worst case, for the verifier ────────────────────────────
/** Block paths whose length each kind is sensitive to. A slot may declare a budget for any of these. */
export const KIND_PATHS: Record<DiagramKind, string[]> = {
  chain: ["causes[]", "event", "effects[]"],
  fishbone: ["causes[]", "event", "effects[]"],
  tree: ["root", "children[].label", "children[].items[]"],
  venn: ["subjects[]", "rows[].attribute", "rows[].values[]", "similarities[]"],
  mindmap: ["center", "nodes[].label", "nodes[].relation"],
  flow: ["steps[]", "question", "yes", "no"],
};

const FILLER = ("Measurable characterisation of the applied pressure gradient between adjacent layers because energy"
  + " transfer increases with the observed rate and cost of every sampled classroom condition").split(" ");

/** Deterministic filler of exactly n characters, with a 16-letter word early to stress single-word wrapping. */
export function filler(n: number): string {
  if (n < 1) return "x";
  let out = "";
  for (let i = 0; out.length < n; i++) out = out ? `${out} ${FILLER[i % FILLER.length]}` : FILLER[0];
  return out.slice(0, n);
}

export interface WorstCase {
  /** Characters allowed at a block path, e.g. "rows[].values[]". */
  chars(path: string): number;
  /** Items allowed at an array path, e.g. "rows" or "children[].items". */
  count(path: string): number;
}

/** The most content this kind may ever be handed: every array full, every string at its budget. */
export function worstCaseData(kind: DiagramKind, w: WorstCase): Record<string, unknown> {
  const s = (p: string) => filler(w.chars(p));
  const arr = <T>(p: string, f: () => T): T[] => Array.from({ length: w.count(p) }, f);
  switch (kind) {
    case "chain":
    case "fishbone":
      return { causes: arr("causes", () => s("causes[]")), event: s("event"), effects: arr("effects", () => s("effects[]")) };
    case "tree":
      return { root: s("root"), children: arr("children", () => ({ label: s("children[].label"), items: arr("children[].items", () => s("children[].items[]")) })) };
    case "venn":
      return {
        subjects: arr("subjects", () => s("subjects[]")),
        rows: arr("rows", () => ({ attribute: s("rows[].attribute"), values: arr("subjects", () => s("rows[].values[]")) })),
        similarities: arr("similarities", () => s("similarities[]")),
      };
    case "mindmap":
      return { center: s("center"), nodes: arr("nodes", () => ({ label: s("nodes[].label"), relation: s("nodes[].relation") })) };
    case "flow":
      return { steps: arr("steps", () => s("steps[]")), question: s("question"), yes: s("yes"), no: s("no") };
  }
}
