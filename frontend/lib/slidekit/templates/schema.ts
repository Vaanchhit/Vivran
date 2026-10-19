// The shape of a template and of a design rule. Everything a backend engineer
// edits is validated against these at load, with errors that name the file and field.
import { z } from "zod";
import { BLOCK_TYPES, INTENTS, type BlockType } from "../blocks";
import { CondSchema } from "./cond";

const blockType = z.string().refine((t): t is BlockType => (BLOCK_TYPES as string[]).includes(t), { message: "unknown block type" });

export const SlideVariant = z.object({
  /** Use this variant instead of the base slide when the condition holds. First match wins. */
  when: CondSchema,
  type: blockType,
  intent: z.enum(INTENTS).optional(),
  guidance: z.string().min(8).max(400),
  fallback: blockType.optional(),
}).strict();

export const TemplateSlide = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  type: blockType,
  intent: z.enum(INTENTS),
  /** What the model writes on this slide. {topic}, {grade} and {subject} are filled in. */
  guidance: z.string().min(8).max(400),
  /** Used when the planned type does not genuinely fit the content, or is not allowed for this subject and level. */
  fallback: blockType.optional(),
  /** 1–9. When a teacher asks for fewer slides than the template has, the lowest-keep slides go first. Title is always kept. */
  keep: z.number().int().min(1).max(9).default(5),
  /** Slide appears only when this holds. */
  include: CondSchema.optional(),
  variants: z.array(SlideVariant).max(4).optional(),
}).strict();

export const DesignSet = z.object({
  /** A preset theme id from render.ts THEMES. */
  theme: z.string().optional(),
  /** Or a custom accent colour (contrast is enforced at render). */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  dark: z.boolean().optional(),
  minFont: z.union([z.literal(18), z.literal(22), z.literal(26), z.literal(30), z.literal(36)]).optional(),
  maxDensity: z.enum(["low", "medium", "high"]).optional(),
  maxItems: z.number().int().min(2).max(8).optional(),
  preferFamilies: z.array(z.enum(["hero", "list", "cards", "split", "diagram", "table", "media"])).optional(),
}).strict();
export type DesignSet = z.infer<typeof DesignSet>;

export const DesignRule = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Higher wins when two rules set the same property. */
  priority: z.number().int().min(1).max(100),
  /** "plan" rules run from the request alone; "fill" rules also see the filled deck (word counts, formulas…). */
  phase: z.enum(["plan", "fill"]).default("plan"),
  when: CondSchema,
  set: DesignSet,
  why: z.string().min(4).max(160),
}).strict();
export type DesignRule = z.infer<typeof DesignRule>;

export const Template = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(3).max(60),
  version: z.number().int().min(1),
  description: z.string().min(10).max(300),
  /** Who this is for, in a teacher's words. Shown beside the template name. */
  audience: z.string().min(5).max(160),
  /** Used when nothing scores. Exactly one template is the default. */
  default: z.boolean().optional(),
  /** Hard gate: the template is not even considered unless this holds. */
  requires: CondSchema.optional(),
  /** Scored evidence. Weights add up; the highest total wins. Each `why` is shown to the teacher. */
  signals: z.array(z.object({ when: CondSchema, weight: z.number().min(-10).max(10), why: z.string().min(3).max(120) }).strict()).min(1),
  design: DesignSet.optional(),
  slides: z.array(TemplateSlide).min(5).max(8),
}).strict().superRefine((t, ctx) => {
  if (t.slides[0].type !== "title") ctx.addIssue({ code: "custom", path: ["slides", 0], message: "first slide must be a title" });
  const ids = new Set<string>();
  t.slides.forEach((s, i) => { if (ids.has(s.id)) ctx.addIssue({ code: "custom", path: ["slides", i, "id"], message: `duplicate slide id ${s.id}` }); ids.add(s.id); });
});
export type Template = z.infer<typeof Template>;
export type TemplateSlide = z.infer<typeof TemplateSlide>;
