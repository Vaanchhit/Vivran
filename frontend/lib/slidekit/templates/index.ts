// ─────────────────────────────────────────────────────────────
// The template-driven pipeline entry point:
//
//   understand → facts → select template → plan from template
//             → design (rules) → prompt (built under that design)
//
// Everything here is deterministic and free: no model call. The model's only
// job is the existing one, filling the plan's blocks. After it has, call
// `finalDesign` with the filled blocks to apply the "fill" rules, then run
// matchDeck inside `withKnobs(design.knobs, …)`.
// ─────────────────────────────────────────────────────────────
import type { Block } from "../blocks";
import { isReady, understand, type LessonContext, type Question, type TeacherInput } from "../intent";
import type { PlanItem } from "../planner";
import { buildPrompt, type BuiltPrompt } from "../prompt";
import { withKnobs } from "../tokens";
import { planFromTemplate } from "./build";
import type { Facts } from "./cond";
import { decideDesign, type DesignDecision } from "./design";
import { fillFacts, planFacts } from "./facts";
import { selectTemplate, type Selection } from "./select";

export { TEMPLATES, DESIGN_RULES, templateById } from "./registry";
export { selectTemplate, rank, MIN_SCORE } from "./select";
export { decideDesign } from "./design";
export { planFacts, fillFacts } from "./facts";
export { evalCond } from "./cond";
export type { DesignDecision, Selection };

export interface TemplateChoice { id: string; name: string; reasons: string[]; how: Selection["how"]; alternatives: Selection["alternatives"] }

export type Templated =
  | { status: "needs_input"; questions: Question[]; context: LessonContext }
  | {
      status: "ready"; context: LessonContext; plan: PlanItem[]; prompt: BuiltPrompt;
      template: TemplateChoice; templateObj: Selection["template"]; facts: Facts; design: DesignDecision; notes: string[]; slideIds: string[];
    };

export function prepareTemplated(input: TeacherInput, opts: { template?: string } = {}): Templated {
  // A template is a full lesson: with no length or duration given, use all of it.
  const sized: TeacherInput = input.slideCount || input.durationMin ? input : { ...input, slideCount: 8 };
  const context = understand(sized);
  if (!isReady(context)) return { status: "needs_input", questions: context.questions.filter(q => q.blocking), context };

  const facts = planFacts(context, input.durationMin);
  const sel = selectTemplate(facts, opts.template);
  const built = planFromTemplate(sel.template, context, facts);
  const design = decideDesign(facts, sel.template.design, "plan");
  // The prompt states per-slide limits from the grade profile, so it must be built under the same design the layouts will be.
  const prompt = withKnobs(design.knobs, () => buildPrompt(context, built.plan));

  return {
    status: "ready", context, plan: built.plan, prompt, facts, design, notes: built.notes, slideIds: built.slideIds,
    template: { id: sel.template.id, name: sel.template.name, reasons: sel.reasons, how: sel.how, alternatives: sel.alternatives },
    templateObj: sel.template,
  };
}

/** After the model filled the deck: re-decide with what it actually wrote (long lines, formulas, memes). */
export function finalDesign(prep: Extract<Templated, { status: "ready" }>, blocks: Block[]): DesignDecision {
  return decideDesign({ ...prep.facts, ...fillFacts(blocks) }, prep.templateObj.design, "fill");
}
