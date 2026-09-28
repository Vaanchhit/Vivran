// ─────────────────────────────────────────────────────────────
// Layout library.
//
// A layout is a SPEC, not a template: grid areas + text budgets +
// capacity. The same spec drives the HTML renderer, the PPTX
// exporter, the capacity checker and the gallery.
//
// Budgets (maxChars/maxLines) are what this layout can hold at the
// grade's minimum font. They are often tighter than the block schema
// ceiling on purpose: the matcher scores fit, and the copy-fitter
// rewrites a slot to the budget if this layout is chosen anyway.
// ─────────────────────────────────────────────────────────────
import type { BlockType } from "./blocks";
import type { Arrange, Area, Density, GradeBand, TypeRole } from "./tokens";

export type LayoutFamily = "hero" | "list" | "cards" | "split" | "diagram" | "table" | "media";
export type Tone = "neutral" | "accent" | "positive" | "negative" | "muted" | "inverse";
export type Marker = "number" | "letter" | "check" | "bullet" | "none";

/** One text field inside a repeated item. bind "." = the item itself (string arrays). */
export interface Field {
  bind: string;
  role: TypeRole;
  maxChars: number;
  maxLines: number;
  optional?: boolean;
  /** Field is itself a list of strings (e.g. hierarchy child items). */
  list?: { max: number };
}

interface SlotBase { id: string; area: Area; optional?: boolean; tone?: Tone; card?: boolean; layer?: "bg"; label?: string }

export interface TextSlot extends SlotBase {
  kind: "text"; bind: string; role: TypeRole; maxChars: number; maxLines: number;
  align?: "start" | "center"; strike?: boolean;
}
export interface RepeatSlot extends SlotBase {
  kind: "repeat"; bind: string; arrange: Arrange; cols?: number;
  fields: Field[]; marker?: Marker; connector?: "arrow" | "line";
  /** First field sits in a fixed-width left column (px); the rest stack beside it. */
  inline?: number;
}
export interface TableSlot extends SlotBase {
  kind: "table"; bind: string; header: string; mode: "table" | "columns";
  attr: Field; cell: Field;
}
export interface MediaSlot extends SlotBase { kind: "image" | "icon"; bind: string }
export interface FormulaSlot extends SlotBase { kind: "formula"; bind: string }
export interface CodeSlot extends SlotBase { kind: "code"; bind: string; maxLines: number }
export interface DiagramSlot extends SlotBase {
  kind: "diagram"; diagram: "tree" | "venn" | "fishbone" | "chain" | "mindmap" | "flow"; binds: string[];
  /**
   * Characters this diagram is verified to hold, by block path ("rows[].values[]").
   * A diagram's regions are lunes and ribs, not rectangles, so some hold much less
   * than the schema ceiling. Anything longer overflows and the block goes to this
   * layout's non-diagram sibling — which is the honest outcome, not a failure.
   * Omitted paths default to the schema ceiling. Keys must be in KIND_PATHS.
   */
  budget?: Record<string, number>;
}
export interface MetaSlot extends SlotBase { kind: "meta"; binds: string[] }

export type Slot = TextSlot | RepeatSlot | TableSlot | MediaSlot | FormulaSlot | CodeSlot | DiagramSlot | MetaSlot;

export interface LayoutSpec {
  id: string;
  accepts: BlockType;
  description: string;
  family: LayoutFamily;
  density: Density;
  gradeFit: GradeBand[];
  /** Array length limits by field path, e.g. { steps: [3, 4] }. */
  capacity: Record<string, [number, number]>;
  /** Fields that must be present / truthy for this layout to be eligible. */
  requires?: string[];
  /** Guaranteed-safe layout for its block type. Exactly one per type. */
  fallback?: boolean;
  /** Fields routed to speaker notes instead of the slide. */
  notesBind?: string[];
  slots: Slot[];
}

// ── helpers ─────────────────────────────────────────────────
const A = (c: number, cs: number, r: number, rs: number): Area => ({ c, cs, r, rs });
const ALL: GradeBand[] = ["primary", "middle", "secondary", "college"];
const NOT_PRIMARY: GradeBand[] = ["middle", "secondary", "college"];
const UPPER: GradeBand[] = ["secondary", "college"];

const f = (bind: string, role: TypeRole, maxChars: number, maxLines: number, extra: Partial<Field> = {}): Field =>
  ({ bind, role, maxChars, maxLines, ...extra });

const text = (id: string, bind: string, role: TypeRole, area: Area, maxChars: number, maxLines: number,
  extra: Partial<TextSlot> = {}): TextSlot => ({ kind: "text", id, bind, role, area, maxChars, maxLines, ...extra });

const rep = (id: string, bind: string, area: Area, arrange: Arrange, fields: Field[],
  extra: Partial<RepeatSlot> = {}): RepeatSlot => ({ kind: "repeat", id, bind, area, arrange, fields, ...extra });

const img = (area: Area, extra: Partial<MediaSlot> = {}): MediaSlot => ({ kind: "image", id: "image", bind: "imageQuery", area, ...extra });
const icon = (area: Area): MediaSlot => ({ kind: "icon", id: "icon", bind: "icon", area, optional: true });

/** Standard slide heading across the top row. */
const heading = (bind = "heading", area = A(0, 12, 0, 1), maxChars = 60): TextSlot =>
  text("heading", bind, "title", area, maxChars, 1);

// ── the library ─────────────────────────────────────────────
export const LAYOUTS: LayoutSpec[] = [
  // TITLE ───────────────────────────────────────────────────
  {
    id: "title_center", accepts: "title", family: "hero", density: "low", gradeFit: ALL, capacity: {}, fallback: true,
    description: "Centred title and subtitle.",
    slots: [
      text("title", "title", "display", A(1, 10, 2, 3), 70, 2, { align: "center" }),
      text("subtitle", "subtitle", "heading", A(2, 8, 5, 2), 120, 2, { align: "center", optional: true }),
    ],
  },
  {
    id: "title_split_image", accepts: "title", family: "split", density: "low", gradeFit: ALL, capacity: {},
    requires: ["imageQuery"], description: "Title left, full-height photo right.",
    slots: [
      text("title", "title", "display", A(0, 6, 2, 3), 70, 4),
      text("subtitle", "subtitle", "heading", A(0, 6, 5, 2), 120, 3, { optional: true }),
      img(A(7, 5, 0, 8)),
    ],
  },

  // SECTION ─────────────────────────────────────────────────
  {
    id: "section_band", accepts: "section", family: "hero", density: "low", gradeFit: ALL, capacity: {}, fallback: true,
    description: "Left-aligned section divider with a small kicker.",
    slots: [
      text("kicker", "kicker", "label", A(0, 8, 2, 1), 40, 1, { optional: true, tone: "accent" }),
      text("title", "title", "display", A(0, 10, 3, 2), 60, 2),
    ],
  },
  {
    id: "section_center", accepts: "section", family: "hero", density: "low", gradeFit: ALL, capacity: {},
    description: "Centred section divider.",
    slots: [
      text("kicker", "kicker", "label", A(2, 8, 2, 1), 40, 1, { optional: true, align: "center", tone: "accent" }),
      text("title", "title", "display", A(1, 10, 3, 2), 60, 2, { align: "center" }),
    ],
  },

  // OBJECTIVES ──────────────────────────────────────────────
  {
    id: "objectives_list", accepts: "objectives", family: "list", density: "medium", gradeFit: ALL,
    capacity: { items: [2, 5] }, fallback: true, description: "Checklist of objectives with an optional icon.",
    slots: [
      heading(),
      rep("items", "items", A(0, 8, 1, 7), "column", [f(".", "body", 90, 2)], { marker: "check" }),
      icon(A(9, 3, 2, 4)),
    ],
  },
  {
    id: "objectives_cards", accepts: "objectives", family: "cards", density: "low", gradeFit: ALL,
    capacity: { items: [2, 4] }, description: "Objectives as a row of cards.",
    slots: [heading(), rep("items", "items", A(0, 12, 2, 5), "row", [f(".", "body", 90, 4)], { card: true })],
  },

  // DEFINITION ──────────────────────────────────────────────
  {
    id: "def_hero", accepts: "definition", family: "hero", density: "low", gradeFit: ALL, capacity: {},
    description: "The term as a big centred word, meaning beneath.",
    slots: [
      text("term", "term", "display", A(0, 12, 1, 2), 40, 1, { align: "center", tone: "accent" }),
      text("meaning", "meaning", "body", A(1, 10, 3, 2), 220, 3, { align: "center" }),
      text("example", "example", "caption", A(2, 8, 5, 2), 160, 3, { align: "center", optional: true, label: "Example" }),
    ],
  },
  {
    id: "def_picture", accepts: "definition", family: "split", density: "low", gradeFit: ALL, capacity: {},
    requires: ["imageQuery"], description: "Term and meaning left, photo right.",
    slots: [
      text("term", "term", "display", A(0, 7, 1, 2), 40, 2, { tone: "accent" }),
      text("meaning", "meaning", "body", A(0, 7, 3, 3), 220, 5),
      text("example", "example", "caption", A(0, 7, 6, 2), 160, 3, { optional: true, label: "Example" }),
      img(A(8, 4, 1, 7)),
    ],
  },
  {
    id: "def_card", accepts: "definition", family: "list", density: "medium", gradeFit: ALL, capacity: {}, fallback: true,
    description: "Term as heading, meaning in an accent card, example in a muted card.",
    slots: [
      text("term", "term", "title", A(0, 12, 0, 1), 40, 1),
      text("meaning", "meaning", "body", A(0, 12, 1, 4), 220, 4, { card: true, tone: "accent" }),
      text("example", "example", "body", A(0, 12, 5, 3), 160, 3, { card: true, tone: "muted", optional: true, label: "Example" }),
    ],
  },

  // VOCABULARY ──────────────────────────────────────────────
  {
    id: "vocab_grid", accepts: "vocabulary", family: "cards", density: "medium", gradeFit: ALL,
    capacity: { terms: [3, 6] }, description: "Word cards in a three-column grid.",
    slots: [
      heading(),
      rep("terms", "terms", A(0, 12, 1, 7), "grid", [f("term", "heading", 30, 1), f("meaning", "body", 110, 3)], { cols: 3, card: true }),
    ],
  },
  {
    id: "vocab_rows", accepts: "vocabulary", family: "list", density: "high", gradeFit: ALL,
    capacity: { terms: [3, 5] }, fallback: true, description: "Glossary rows: term left, meaning right.",
    slots: [
      heading(),
      rep("terms", "terms", A(0, 12, 1, 7), "column", [f("term", "heading", 22, 1), f("meaning", "body", 110, 2)], { inline: 420 }),
    ],
  },

  // EXPLANATION ─────────────────────────────────────────────
  {
    id: "expl_bullets", accepts: "explanation", family: "list", density: "high", gradeFit: ALL,
    capacity: { points: [2, 6] }, fallback: true, description: "Heading and bullet points. The universal fallback.",
    slots: [heading(), rep("points", "points", A(0, 12, 1, 7), "column", [f(".", "body", 140, 3)], { marker: "bullet" })],
  },
  {
    id: "expl_image", accepts: "explanation", family: "split", density: "medium", gradeFit: ALL,
    capacity: { points: [2, 4] }, requires: ["imageQuery"], description: "Bullets left, photo right.",
    slots: [
      heading(),
      rep("points", "points", A(0, 7, 1, 7), "column", [f(".", "body", 140, 4)], { marker: "bullet" }),
      img(A(8, 4, 1, 7)),
    ],
  },
  {
    id: "expl_cards", accepts: "explanation", family: "cards", density: "medium", gradeFit: ALL,
    capacity: { points: [2, 4] }, description: "Points as a row of cards.",
    slots: [heading(), rep("points", "points", A(0, 12, 2, 5), "row", [f(".", "body", 140, 5)], { card: true })],
  },

  // PROCESS ─────────────────────────────────────────────────
  {
    id: "process_row", accepts: "process", family: "diagram", density: "medium", gradeFit: ALL,
    capacity: { steps: [3, 4] }, description: "Numbered steps left to right with arrows.",
    slots: [
      heading(),
      rep("steps", "steps", A(0, 12, 2, 4), "row",
        [f("label", "heading", 40, 2), f("detail", "body", 110, 4, { optional: true })],
        { card: true, marker: "number", connector: "arrow" }),
    ],
  },
  {
    id: "process_column", accepts: "process", family: "list", density: "high", gradeFit: ALL,
    capacity: { steps: [3, 7] }, fallback: true, description: "Numbered steps top to bottom.",
    slots: [
      heading(),
      rep("steps", "steps", A(0, 12, 1, 7), "column",
        [f("label", "heading", 40, 1), f("detail", "body", 110, 1, { optional: true })], { marker: "number" }),
    ],
  },
  {
    id: "process_cycle", accepts: "process", family: "diagram", density: "medium", gradeFit: ALL,
    capacity: { steps: [3, 6] }, requires: ["isCycle"], description: "Steps around a loop. Only for cycles.",
    slots: [
      heading(),
      rep("steps", "steps", A(1, 10, 1, 7), "radial",
        [f("label", "heading", 30, 2), f("detail", "body", 70, 3, { optional: true })],
        { card: true, connector: "arrow" }),
    ],
  },
  {
    id: "process_zigzag", accepts: "process", family: "diagram", density: "high", gradeFit: NOT_PRIMARY,
    capacity: { steps: [5, 8] }, description: "Long processes in two rows of four.",
    slots: [
      heading(),
      rep("steps", "steps", A(0, 12, 1, 7), "grid",
        [f("label", "heading", 40, 2), f("detail", "body", 110, 4, { optional: true })],
        { cols: 4, card: true, marker: "number", connector: "arrow" }),
    ],
  },

  // COMPARISON ──────────────────────────────────────────────
  {
    id: "compare_columns", accepts: "comparison", family: "split", density: "medium", gradeFit: ALL,
    capacity: { subjects: [2, 2], rows: [2, 5] }, description: "Two side-by-side columns, one per subject.",
    slots: [
      heading(),
      { kind: "table", id: "table", bind: "rows", header: "subjects", mode: "columns", area: A(0, 12, 1, 7),
        attr: f("attribute", "label", 30, 1), cell: f("values", "body", 90, 2) },
    ],
  },
  {
    id: "compare_table", accepts: "comparison", family: "table", density: "high", gradeFit: ALL,
    capacity: { subjects: [2, 3], rows: [2, 6] }, fallback: true, description: "Full comparison table.",
    slots: [
      heading(),
      { kind: "table", id: "table", bind: "rows", header: "subjects", mode: "table", area: A(0, 12, 1, 7),
        attr: f("attribute", "label", 30, 2), cell: f("values", "body", 80, 3) },
    ],
  },
  {
    id: "compare_venn", accepts: "comparison", family: "diagram", density: "medium", gradeFit: ALL,
    capacity: { subjects: [2, 2], rows: [2, 4], similarities: [1, 4] }, requires: ["similarities"],
    description: "Venn diagram: differences in each circle, similarities in the overlap.",
    // A crescent and a lens hold much less than the 90/80 the schema allows: measured
    // against the real geometry at every grade this layout claims. Longer text overflows
    // and the block goes to compare_table, which is the right call for a wordy comparison.
    slots: [heading(), { kind: "diagram", id: "venn", diagram: "venn", binds: ["subjects", "rows", "similarities"], area: A(1, 10, 1, 7),
      budget: { "rows[].values[]": 70, "similarities[]": 55 } }],
  },

  // CAUSE → EFFECT ──────────────────────────────────────────
  {
    id: "ce_columns", accepts: "cause_effect", family: "diagram", density: "medium", gradeFit: ALL,
    capacity: { causes: [1, 4], effects: [1, 4] }, fallback: true, description: "Causes → event → effects in three columns.",
    slots: [
      heading(),
      rep("causes", "causes", A(0, 4, 1, 7), "column", [f(".", "body", 90, 3)], { card: true, label: "Causes" }),
      text("event", "event", "heading", A(4, 4, 3, 3), 60, 3, { align: "center", card: true, tone: "accent" }),
      rep("effects", "effects", A(8, 4, 1, 7), "column", [f(".", "body", 90, 3)], { card: true, label: "Effects" }),
    ],
  },
  {
    id: "ce_fishbone", accepts: "cause_effect", family: "diagram", density: "high", gradeFit: UPPER,
    capacity: { causes: [3, 6], effects: [1, 2] }, description: "Fishbone diagram for many causes of one event.",
    slots: [heading(), { kind: "diagram", id: "fishbone", diagram: "fishbone", binds: ["causes", "event", "effects"], area: A(0, 12, 1, 7) }],
  },
  {
    id: "ce_chain", accepts: "cause_effect", family: "diagram", density: "low", gradeFit: ALL,
    capacity: { causes: [1, 1], effects: [1, 3] }, description: "A simple chain: one cause, the event, its effects.",
    slots: [heading(), { kind: "diagram", id: "chain", diagram: "chain", binds: ["causes", "event", "effects"], area: A(0, 12, 2, 5) }],
  },

  // TIMELINE ────────────────────────────────────────────────
  {
    id: "timeline_h", accepts: "timeline", family: "diagram", density: "medium", gradeFit: ALL,
    capacity: { events: [3, 5] }, description: "Horizontal axis, events alternating above and below.",
    slots: [
      heading(),
      rep("events", "events", A(0, 12, 1, 7), "axis-h",
        [f("date", "label", 12, 1), f("label", "heading", 50, 3), f("detail", "body", 80, 4, { optional: true })],
        { card: true, connector: "line" }),
    ],
  },
  {
    id: "timeline_v", accepts: "timeline", family: "list", density: "high", gradeFit: ALL,
    capacity: { events: [3, 8] }, fallback: true, description: "Vertical timeline: date column, event beside it.",
    slots: [
      heading(),
      rep("events", "events", A(0, 12, 1, 7), "axis-v",
        [f("date", "label", 12, 1), f("label", "heading", 50, 1), f("detail", "body", 100, 1, { optional: true })],
        { inline: 260, connector: "line" }),
    ],
  },

  // HIERARCHY ───────────────────────────────────────────────
  {
    id: "hier_tree", accepts: "hierarchy", family: "diagram", density: "medium", gradeFit: ALL,
    capacity: { children: [2, 5] }, description: "Top-down tree, auto-laid out.",
    slots: [heading(), { kind: "diagram", id: "tree", diagram: "tree", binds: ["root", "children"], area: A(0, 12, 1, 7) }],
  },
  {
    id: "hier_columns", accepts: "hierarchy", family: "cards", density: "high", gradeFit: ALL,
    capacity: { children: [2, 5] }, fallback: true, description: "Root as a band, each child a column with its items.",
    slots: [
      heading(),
      text("root", "root", "heading", A(0, 12, 1, 1), 40, 1, { align: "center", tone: "accent", card: true }),
      rep("children", "children", A(0, 12, 2, 6), "row",
        [f("label", "heading", 34, 2), f("items", "body", 40, 2, { optional: true, list: { max: 4 } })], { card: true }),
    ],
  },

  // FORMULA ─────────────────────────────────────────────────
  {
    id: "formula_center", accepts: "formula", family: "hero", density: "medium", gradeFit: ALL,
    capacity: { variables: [1, 6] }, fallback: true, description: "Formula centred, variable key below.",
    slots: [
      heading(),
      { kind: "formula", id: "formula", bind: "latex", area: A(1, 10, 1, 3), tone: "accent" },
      rep("variables", "variables", A(0, 12, 4, 3), "grid",
        [f("symbol", "label", 5, 1), f("meaning", "body", 70, 3), f("unit", "caption", 20, 1, { optional: true })],
        { cols: 3, inline: 160 }),
      text("note", "note", "caption", A(0, 12, 7, 1), 140, 2, { optional: true, tone: "muted" }),
    ],
  },
  {
    id: "formula_side", accepts: "formula", family: "split", density: "medium", gradeFit: NOT_PRIMARY,
    capacity: { variables: [2, 6] }, description: "Formula left, variable key down the right.",
    slots: [
      heading(),
      { kind: "formula", id: "formula", bind: "latex", area: A(0, 7, 1, 5), tone: "accent" },
      text("note", "note", "caption", A(0, 7, 6, 2), 140, 2, { optional: true, tone: "muted" }),
      rep("variables", "variables", A(8, 4, 1, 7), "column",
        [f("symbol", "label", 5, 1), f("meaning", "body", 70, 3), f("unit", "caption", 20, 1, { optional: true })],
        { inline: 160 }),
    ],
  },

  // WORKED EXAMPLE ──────────────────────────────────────────
  {
    id: "worked_stack", accepts: "worked_example", family: "list", density: "high", gradeFit: ALL,
    capacity: { steps: [2, 4] }, fallback: true, description: "Problem, numbered steps, highlighted answer.",
    slots: [
      heading(),
      text("problem", "problem", "body", A(0, 12, 1, 2), 260, 3, { card: true, tone: "muted", label: "Problem" }),
      rep("steps", "steps", A(0, 12, 3, 3), "column", [f(".", "body", 140, 2)], { marker: "number" }),
      text("answer", "answer", "heading", A(0, 12, 6, 2), 120, 2, { card: true, tone: "positive", label: "Answer" }),
    ],
  },
  {
    id: "worked_split", accepts: "worked_example", family: "split", density: "high", gradeFit: NOT_PRIMARY,
    capacity: { steps: [2, 5] }, description: "Problem left; steps and answer right.",
    slots: [
      heading(),
      text("problem", "problem", "body", A(0, 5, 1, 7), 260, 8, { card: true, tone: "muted", label: "Problem" }),
      rep("steps", "steps", A(6, 6, 1, 5), "column", [f(".", "body", 140, 3)], { marker: "number" }),
      text("answer", "answer", "heading", A(6, 6, 6, 2), 100, 2, { card: true, tone: "positive", label: "Answer" }),
    ],
  },

  // KEY FACT ────────────────────────────────────────────────
  {
    id: "fact_number", accepts: "key_fact", family: "hero", density: "low", gradeFit: ALL,
    capacity: {}, requires: ["value"], description: "One big number with its meaning.",
    slots: [
      text("value", "value", "display", A(0, 12, 1, 3), 16, 1, { align: "center", tone: "accent" }),
      text("statement", "statement", "heading", A(1, 10, 4, 2), 120, 2, { align: "center" }),
      text("context", "context", "caption", A(2, 8, 6, 2), 160, 3, { align: "center", optional: true, tone: "muted" }),
    ],
  },
  {
    id: "fact_statement", accepts: "key_fact", family: "hero", density: "low", gradeFit: ALL,
    capacity: {}, fallback: true, description: "One big statement.",
    slots: [
      text("statement", "statement", "title", A(1, 10, 2, 3), 120, 3, { align: "center" }),
      text("context", "context", "body", A(2, 8, 5, 2), 160, 3, { align: "center", optional: true, tone: "muted" }),
    ],
  },
  {
    id: "fact_photo", accepts: "key_fact", family: "media", density: "low", gradeFit: ALL,
    capacity: {}, requires: ["imageQuery"], description: "Full-bleed photo with the statement over a scrim.",
    slots: [
      img(A(0, 12, 0, 8), { layer: "bg" }),
      text("statement", "statement", "title", A(0, 8, 4, 3), 120, 3, { tone: "inverse" }),
      text("context", "context", "body", A(0, 8, 7, 1), 70, 1, { optional: true, tone: "inverse" }),
    ],
  },

  // MISCONCEPTION ───────────────────────────────────────────
  {
    id: "myth_split", accepts: "misconception", family: "split", density: "medium", gradeFit: ALL,
    capacity: {}, fallback: true, description: "Myth and fact side by side, reason below.",
    slots: [
      text("myth", "myth", "heading", A(0, 6, 1, 4), 120, 4, { card: true, tone: "negative", label: "Myth" }),
      text("fact", "fact", "heading", A(6, 6, 1, 4), 160, 4, { card: true, tone: "positive", label: "Fact" }),
      text("why", "why", "body", A(0, 12, 5, 3), 200, 3, { card: true, tone: "muted", label: "Why" }),
    ],
  },
  {
    id: "myth_stack", accepts: "misconception", family: "list", density: "medium", gradeFit: ALL,
    capacity: {}, description: "Myth struck through, fact below it, then the reason.",
    slots: [
      text("myth", "myth", "heading", A(0, 12, 1, 2), 120, 2, { card: true, tone: "negative", strike: true, label: "Myth" }),
      text("fact", "fact", "heading", A(0, 12, 3, 3), 160, 3, { card: true, tone: "positive", label: "Fact" }),
      text("why", "why", "body", A(0, 12, 6, 2), 200, 2, { card: true, tone: "muted", label: "Why" }),
    ],
  },

  // REAL WORLD ──────────────────────────────────────────────
  {
    id: "rw_photo", accepts: "real_world", family: "media", density: "medium", gradeFit: ALL,
    capacity: {}, requires: ["imageQuery"], description: "Photo left; concept, example and connection right.",
    slots: [
      img(A(0, 6, 0, 8)),
      text("concept", "concept", "title", A(7, 5, 0, 2), 60, 3),
      text("example", "example", "body", A(7, 5, 2, 3), 180, 5, { card: true, label: "In real life" }),
      text("connection", "connection", "body", A(7, 5, 5, 3), 180, 5, { card: true, tone: "accent", label: "The idea" }),
    ],
  },
  {
    id: "rw_bridge", accepts: "real_world", family: "split", density: "medium", gradeFit: ALL,
    capacity: {}, fallback: true, description: "Everyday example bridged to the concept.",
    slots: [
      heading("concept"),
      text("example", "example", "body", A(0, 5, 1, 7), 180, 6, { card: true, label: "In real life" }),
      text("connection", "connection", "body", A(7, 5, 1, 7), 180, 6, { card: true, tone: "accent", label: "The idea" }),
    ],
  },

  // QUIZ ────────────────────────────────────────────────────
  {
    id: "quiz_grid", accepts: "quiz_mcq", family: "cards", density: "medium", gradeFit: ALL,
    capacity: { options: [4, 4] }, fallback: true, notesBind: ["answer", "explanation"],
    description: "Question on top, four lettered option tiles.",
    slots: [
      text("question", "question", "title", A(0, 12, 0, 2), 160, 3),
      rep("options", "options", A(0, 12, 2, 6), "grid", [f(".", "heading", 70, 2)], { cols: 2, card: true, marker: "letter" }),
    ],
  },
  {
    id: "quiz_list", accepts: "quiz_mcq", family: "list", density: "medium", gradeFit: ALL,
    capacity: { options: [4, 4] }, notesBind: ["answer", "explanation"],
    description: "Question on top, lettered options down the left, optional picture right.",
    slots: [
      text("question", "question", "title", A(0, 12, 0, 2), 160, 3),
      rep("options", "options", A(0, 8, 2, 6), "column", [f(".", "heading", 70, 2)], { marker: "letter" }),
      img(A(9, 3, 2, 6), { optional: true }),
    ],
  },

  // ACTIVITY ────────────────────────────────────────────────
  {
    id: "activity_card", accepts: "activity", family: "list", density: "medium", gradeFit: ALL,
    capacity: { instructions: [1, 5] }, fallback: true, description: "Title, time and grouping, numbered instructions.",
    slots: [
      text("title", "title", "title", A(0, 8, 0, 1), 48, 1),
      { kind: "meta", id: "meta", binds: ["minutes", "grouping"], area: A(8, 4, 0, 1) },
      rep("instructions", "instructions", A(0, 8, 1, 7), "column", [f(".", "body", 120, 2)], { marker: "number" }),
      icon(A(9, 3, 2, 4)),
    ],
  },
  {
    id: "activity_board", accepts: "activity", family: "cards", density: "medium", gradeFit: ALL,
    capacity: { instructions: [2, 4] }, description: "Instructions as a row of numbered cards.",
    slots: [
      text("title", "title", "title", A(0, 12, 0, 1), 60, 1),
      { kind: "meta", id: "meta", binds: ["minutes", "grouping"], area: A(0, 12, 1, 1) },
      rep("instructions", "instructions", A(0, 12, 2, 6), "row", [f(".", "body", 120, 5)], { card: true, marker: "number" }),
    ],
  },

  // DISCUSSION ──────────────────────────────────────────────
  {
    id: "discussion_single", accepts: "discussion", family: "hero", density: "low", gradeFit: ALL,
    capacity: { questions: [1, 1] }, description: "One big open question.",
    slots: [
      text("heading", "heading", "heading", A(1, 10, 1, 1), 60, 1, { align: "center", tone: "accent" }),
      rep("questions", "questions", A(1, 10, 2, 4), "column", [f(".", "title", 160, 3)]),
    ],
  },
  {
    id: "discussion_list", accepts: "discussion", family: "cards", density: "medium", gradeFit: ALL,
    capacity: { questions: [1, 3] }, fallback: true, description: "Up to three questions as stacked cards.",
    slots: [heading(), rep("questions", "questions", A(0, 12, 1, 7), "column", [f(".", "heading", 160, 3)], { card: true })],
  },

  // RECAP ───────────────────────────────────────────────────
  {
    id: "recap_list", accepts: "recap", family: "list", density: "medium", gradeFit: ALL,
    capacity: { points: [3, 5] }, fallback: true, description: "Takeaways as a checklist.",
    slots: [heading(), rep("points", "points", A(0, 12, 1, 7), "column", [f(".", "body", 110, 2)], { marker: "check" })],
  },
  {
    id: "recap_cards", accepts: "recap", family: "cards", density: "low", gradeFit: ALL,
    capacity: { points: [3, 4] }, description: "Takeaways as a row of cards.",
    slots: [heading(), rep("points", "points", A(0, 12, 2, 5), "row", [f(".", "heading", 100, 4)], { card: true })],
  },

  // CODE ────────────────────────────────────────────────────
  {
    id: "code_full", accepts: "code_example", family: "media", density: "high", gradeFit: NOT_PRIMARY,
    capacity: {}, fallback: true, description: "Full-width code block with a caption.",
    slots: [
      heading(),
      { kind: "code", id: "code", bind: "code", area: A(0, 12, 1, 6), maxLines: 14 },
      text("caption", "caption", "body", A(0, 12, 7, 1), 120, 1, { optional: true, tone: "muted" }),
    ],
  },
  {
    id: "code_annotated", accepts: "code_example", family: "split", density: "high", gradeFit: NOT_PRIMARY,
    capacity: { annotations: [1, 4] }, requires: ["annotations"], description: "Code left, numbered notes right.",
    slots: [
      heading(),
      { kind: "code", id: "code", bind: "code", area: A(0, 8, 1, 7), maxLines: 16 },
      rep("annotations", "annotations", A(8, 4, 1, 7), "column", [f(".", "body", 100, 3)], { marker: "number" }),
    ],
  },

  // CONCEPT MAP ─────────────────────────────────────────────
  {
    id: "cmap_radial", accepts: "concept_map", family: "diagram", density: "medium", gradeFit: ALL,
    capacity: { nodes: [3, 6] }, fallback: true, description: "Central idea with related ideas around it.",
    slots: [
      heading(),
      text("center", "center", "heading", A(4, 4, 4, 1), 30, 1, { align: "center", card: true, tone: "accent" }),
      rep("nodes", "nodes", A(0, 12, 1, 7), "radial",
        [f("label", "heading", 36, 2), f("relation", "caption", 40, 2)], { card: true, connector: "line" }),
    ],
  },
  {
    id: "cmap_mindmap", accepts: "concept_map", family: "diagram", density: "medium", gradeFit: NOT_PRIMARY,
    capacity: { nodes: [3, 6] }, description: "Left-to-right mind map, auto-laid out.",
    slots: [heading(), { kind: "diagram", id: "mindmap", diagram: "mindmap", binds: ["center", "nodes"], area: A(0, 12, 1, 7) }],
  },

  // FLOWCHART ───────────────────────────────────────────────
  {
    id: "flow_chart", accepts: "flowchart", family: "diagram", density: "medium", gradeFit: NOT_PRIMARY,
    capacity: { steps: [1, 2] }, description: "Decision flowchart: steps into a yes/no question, Yes to the right, No below.",
    // The question sits in the diamond's inscribed rectangle, half the cell each way,
    // so it holds far less than the schema's 60. Longer flows go to flow_list.
    slots: [heading(), { kind: "diagram", id: "flow", diagram: "flow", binds: ["steps", "question", "yes", "no"], area: A(0, 12, 1, 7),
      budget: { "question": 40, "steps[]": 36 } }],
  },
  {
    id: "flow_list", accepts: "flowchart", family: "list", density: "medium", gradeFit: ALL,
    capacity: { steps: [1, 3] }, fallback: true, description: "Numbered steps, then the question and both outcomes as cards.",
    slots: [
      heading(),
      rep("steps", "steps", A(0, 5, 1, 7), "column", [f(".", "body", 40, 2)], { marker: "number" }),
      text("question", "question", "heading", A(6, 6, 1, 2), 60, 2, { card: true, tone: "accent", label: "Decision" }),
      text("yes", "yes", "body", A(6, 6, 3, 2), 60, 2, { card: true, tone: "positive", label: "If yes" }),
      text("no", "no", "body", A(6, 6, 5, 3), 60, 2, { card: true, tone: "negative", label: "If no" }),
    ],
  },
];

export const LAYOUT_BY_ID = Object.fromEntries(LAYOUTS.map(l => [l.id, l])) as Record<string, LayoutSpec>;
export const layoutsFor = (t: BlockType) => LAYOUTS.filter(l => l.accepts === t);
export const fallbackFor = (t: BlockType) => LAYOUTS.find(l => l.accepts === t && l.fallback)!;
