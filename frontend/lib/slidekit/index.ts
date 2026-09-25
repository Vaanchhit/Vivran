// Public entry point: teacher input → questions, or a ready plan + prompt.
import { isReady, understand, type LessonContext, type Question, type TeacherInput } from "./intent";
import { plan, type PlanItem } from "./planner";
import { buildPrompt, type BuiltPrompt } from "./prompt";

export type Understood =
  | { status: "needs_input"; questions: Question[]; context: LessonContext }
  | { status: "ready"; context: LessonContext; plan: PlanItem[]; prompt: BuiltPrompt };

export function prepareLesson(input: TeacherInput): Understood {
  const context = understand(input);
  if (!isReady(context)) return { status: "needs_input", questions: context.questions.filter(q => q.blocking), context };
  const items = plan(context);
  return { status: "ready", context, plan: items, prompt: buildPrompt(context, items) };
}

export * from "./blocks";
export * from "./layouts";
export * from "./intent";
export * from "./planner";
export * from "./prompt";
export * from "./subjects";
export * from "./tokens";
export { verifyLibrary } from "./verify";
export * from "./matcher";
export * from "./budgets";
export * from "./fit";
export * from "./diagram";
