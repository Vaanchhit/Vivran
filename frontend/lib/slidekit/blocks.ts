// ─────────────────────────────────────────────────────────────
// Content blocks: the contract between the LLM and the layout
// engine. The model fills these; it never chooses a layout.
// Limits here are absolute ceilings. Grade profiles tighten them.
// ─────────────────────────────────────────────────────────────
import { z } from "zod";

export const INTENTS = ["hook", "orient", "teach", "apply", "check", "close"] as const;
export type Intent = (typeof INTENTS)[number];

const s = (max: number) => z.string().trim().min(1).max(max);
const list = <T extends z.ZodTypeAny>(item: T, min: number, max: number) => z.array(item).min(min).max(max);

/** Every block carries these. */
const base = {
  intent: z.enum(INTENTS),
  /** "input" = came from the teacher's source material; "model" = generated. */
  source: z.enum(["input", "model"]).default("model"),
  /** Search phrase for a stock photo. Concrete nouns only. */
  imageQuery: s(60).optional(),
  /** Icon name from the approved icon set (validated separately). */
  icon: s(40).optional(),
  /** Speaker notes for the teacher. Never rendered on the slide. */
  notes: s(600).optional(),
  /**
   * Tags naming the SOURCE MATERIAL excerpts this block was written from —
   * "S1", "S2", as labelled in the prompt. The model emits tags, not ids,
   * because it never sees real identifiers; the caller maps them back to the
   * chunks it supplied and drops any tag it did not issue, so an invented
   * citation cannot survive. Empty or absent means ungrounded, which is a
   * fact worth showing rather than hiding.
   */
  sourceIds: z.array(s(8)).max(6).optional(),
};

export const Blocks = {
  title: z.object({ ...base, type: z.literal("title"), title: s(70), subtitle: s(120).optional() }),

  section: z.object({ ...base, type: z.literal("section"), title: s(60), kicker: s(40).optional() }),

  objectives: z.object({ ...base, type: z.literal("objectives"), heading: s(60), items: list(s(90), 2, 5) }),

  definition: z.object({
    ...base, type: z.literal("definition"),
    term: s(40), meaning: s(220), example: s(160).optional(),
  }),

  vocabulary: z.object({
    ...base, type: z.literal("vocabulary"), heading: s(60),
    terms: list(z.object({ term: s(30), meaning: s(110) }), 3, 6),
  }),

  explanation: z.object({ ...base, type: z.literal("explanation"), heading: s(60), points: list(s(140), 2, 6) }),

  process: z.object({
    ...base, type: z.literal("process"), heading: s(60),
    steps: list(z.object({ label: s(40), detail: s(110).optional() }), 3, 8),
    isCycle: z.boolean().default(false),
  }),

  comparison: z.object({
    ...base, type: z.literal("comparison"), heading: s(60),
    subjects: list(s(30), 2, 3),
    rows: list(z.object({ attribute: s(30), values: list(s(90), 2, 3) }), 2, 6),
    similarities: list(s(80), 1, 4).optional(),
  }).superRefine((b, ctx) => {
    b.rows.forEach((r, i) => {
      if (r.values.length !== b.subjects.length)
        ctx.addIssue({ code: "custom", path: ["rows", i, "values"], message: `needs exactly ${b.subjects.length} values` });
    });
  }),

  cause_effect: z.object({
    ...base, type: z.literal("cause_effect"), heading: s(60),
    causes: list(s(90), 1, 6), event: s(60), effects: list(s(90), 1, 4),
  }),

  timeline: z.object({
    ...base, type: z.literal("timeline"), heading: s(60),
    events: list(z.object({ date: s(20), label: s(50), detail: s(100).optional() }), 3, 8),
  }),

  hierarchy: z.object({
    ...base, type: z.literal("hierarchy"), heading: s(60), root: s(40),
    children: list(z.object({ label: s(40), items: list(s(50), 1, 4).optional() }), 2, 5),
  }),

  formula: z.object({
    ...base, type: z.literal("formula"), heading: s(60),
    latex: s(200),
    variables: list(z.object({ symbol: s(20), meaning: s(70), unit: s(20).optional() }), 1, 6),
    note: s(140).optional(),
  }),

  worked_example: z.object({
    ...base, type: z.literal("worked_example"), heading: s(60),
    problem: s(260), steps: list(s(140), 2, 6), answer: s(120),
  }),

  key_fact: z.object({
    ...base, type: z.literal("key_fact"),
    statement: s(120), value: s(16).optional(), context: s(160).optional(),
  }),

  misconception: z.object({ ...base, type: z.literal("misconception"), myth: s(120), fact: s(160), why: s(200) }),

  real_world: z.object({
    ...base, type: z.literal("real_world"), concept: s(60), example: s(180), connection: s(180),
  }),

  quiz_mcq: z.object({
    ...base, type: z.literal("quiz_mcq"),
    question: s(160), options: list(s(70), 4, 4), answer: z.number().int().min(0).max(3), explanation: s(220),
  }),

  activity: z.object({
    ...base, type: z.literal("activity"), title: s(60),
    instructions: list(s(120), 1, 5),
    minutes: z.number().int().min(1).max(60),
    grouping: z.enum(["individual", "pairs", "groups", "whole class"]),
  }),

  discussion: z.object({ ...base, type: z.literal("discussion"), heading: s(60), questions: list(s(160), 1, 3) }),

  recap: z.object({ ...base, type: z.literal("recap"), heading: s(60), points: list(s(110), 3, 5) }),

  code_example: z.object({
    ...base, type: z.literal("code_example"), heading: s(60),
    language: s(20), code: z.string().min(1).max(900), caption: s(140).optional(),
    annotations: list(s(100), 1, 4).optional(),
  }),

  concept_map: z.object({
    ...base, type: z.literal("concept_map"), heading: s(60), center: s(40),
    nodes: list(z.object({ label: s(36), relation: s(40) }), 3, 6),
  }),

  /** A decision flowchart: steps leading into one yes/no question, and what each answer leads to. */
  flowchart: z.object({
    ...base, type: z.literal("flowchart"), heading: s(60),
    steps: list(s(40), 1, 3), question: s(60), yes: s(60), no: s(60),
  }),
} as const;

export type BlockType = keyof typeof Blocks;
export const BLOCK_TYPES = Object.keys(Blocks) as BlockType[];
export type Block = { [K in BlockType]: z.infer<(typeof Blocks)[K]> }[BlockType];

export const Deck = z.object({
  lessonTitle: s(80),
  blocks: z.array(z.discriminatedUnion("type", Object.values(Blocks) as any)).min(3).max(40),
});
export type Deck = z.infer<typeof Deck>;

/** Validate one block; returns readable errors for a retry prompt. */
export function validateBlock(raw: unknown): { ok: true; block: Block } | { ok: false; errors: string[] } {
  const type = (raw as any)?.type as BlockType;
  const schema = Blocks[type];
  if (!schema) return { ok: false, errors: [`unknown block type "${type}"`] };
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, block: r.data as Block };
  return { ok: false, errors: r.error.issues.map(i => `${type}.${i.path.join(".")}: ${i.message}`) };
}

/**
 * Compact shape hints for the prompt. Short on purpose: small free models
 * follow a one-line shape better than a full JSON Schema.
 */
export const BLOCK_HINTS: Record<BlockType, string> = {
  title: `{"type":"title","title":"≤70","subtitle":"≤120?"}`,
  section: `{"type":"section","title":"≤60","kicker":"≤40?"}`,
  objectives: `{"type":"objectives","heading":"≤60","items":["≤90", 2-5]}`,
  definition: `{"type":"definition","term":"≤40","meaning":"≤220","example":"≤160?"}`,
  vocabulary: `{"type":"vocabulary","heading":"≤60","terms":[{"term":"≤30","meaning":"≤110"}, 3-6]}`,
  explanation: `{"type":"explanation","heading":"≤60","points":["≤140", 2-6]}`,
  process: `{"type":"process","heading":"≤60","steps":[{"label":"≤40","detail":"≤110?"}, 3-8],"isCycle":bool}`,
  comparison: `{"type":"comparison","heading":"≤60","subjects":["≤30", 2-3],"rows":[{"attribute":"≤30","values":["one per subject"]}, 2-6],"similarities":["≤80"]?}`,
  cause_effect: `{"type":"cause_effect","heading":"≤60","causes":["≤90", 1-6],"event":"≤60","effects":["≤90", 1-4]}`,
  timeline: `{"type":"timeline","heading":"≤60","events":[{"date":"≤20","label":"≤50","detail":"≤100?"}, 3-8]}`,
  hierarchy: `{"type":"hierarchy","heading":"≤60","root":"≤40","children":[{"label":"≤40","items":["≤50", 1-4]?}, 2-5]}`,
  formula: `{"type":"formula","heading":"≤60","latex":"LaTeX","variables":[{"symbol":"","meaning":"≤70","unit":"?"}, 1-6],"note":"≤140?"}`,
  worked_example: `{"type":"worked_example","heading":"≤60","problem":"≤260","steps":["≤140", 2-6],"answer":"≤120"}`,
  key_fact: `{"type":"key_fact","statement":"≤120","value":"≤16?","context":"≤160?"}`,
  misconception: `{"type":"misconception","myth":"≤120","fact":"≤160","why":"≤200"}`,
  real_world: `{"type":"real_world","concept":"≤60","example":"≤180","connection":"≤180"}`,
  quiz_mcq: `{"type":"quiz_mcq","question":"≤160","options":["≤70" ×4],"answer":0-3,"explanation":"≤220"}`,
  activity: `{"type":"activity","title":"≤60","instructions":["≤120", 1-5],"minutes":int,"grouping":"individual|pairs|groups|whole class"}`,
  discussion: `{"type":"discussion","heading":"≤60","questions":["≤160", 1-3]}`,
  recap: `{"type":"recap","heading":"≤60","points":["≤110", 3-5]}`,
  code_example: `{"type":"code_example","heading":"≤60","language":"","code":"≤900 chars, ≤14 lines","caption":"≤140?","annotations":["≤100", 1-4]?}`,
  concept_map: `{"type":"concept_map","heading":"≤60","center":"≤40","nodes":[{"label":"≤36","relation":"≤40"}, 3-6]}`,
  flowchart: `{"type":"flowchart","heading":"≤60","steps":["≤40", 1-3],"question":"≤60, answerable yes or no","yes":"≤60","no":"≤60"}`,
};
