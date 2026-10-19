// ─────────────────────────────────────────────────────────────
// From a chosen template to a plan the existing pipeline can fill.
// Deterministic: resolves variants, drops what the request does not need,
// respects what this subject and level may use, and says what it did.
// ─────────────────────────────────────────────────────────────
import type { BlockType } from "../blocks";
import type { LessonContext } from "../intent";
import type { PlanItem } from "../planner";
import { SUBJECTS } from "../subjects";
import { evalCond, type Facts } from "./cond";
import type { Template, TemplateSlide } from "./schema";

export interface BuiltPlan {
  plan: PlanItem[];
  /** One line per decision the builder made that the teacher might wonder about. */
  notes: string[];
  /** The template slide behind each plan item, for the viewer and the log. */
  slideIds: string[];
}

const fill = (s: string, ctx: LessonContext) =>
  s.replace(/\{topic\}/g, ctx.topic).replace(/\{grade\}/g, ctx.gradeLabel).replace(/\{subject\}/g, SUBJECTS[ctx.subject].label);

interface Resolved { slide: TemplateSlide; type: BlockType; intent: PlanItem["intent"]; guidance: string; fallback?: BlockType; variant: boolean }

export function planFromTemplate(t: Template, ctx: LessonContext, facts: Facts): BuiltPlan {
  const allowed = new Set<BlockType>(ctx.allowedBlocks);
  const notes: string[] = [];
  let memes = 0;

  let items: Resolved[] = [];
  for (const slide of t.slides) {
    if (slide.include && !evalCond(slide.include, facts)) { notes.push(`left out "${slide.id}": its condition did not hold`); continue; }
    let r: Resolved = { slide, type: slide.type, intent: slide.intent, guidance: slide.guidance, fallback: slide.fallback, variant: false };
    const v = slide.variants?.find(x => evalCond(x.when, facts));
    if (v && allowed.has(v.type) && (v.type !== "meme" || memes < 1)) {
      r = { slide, type: v.type, intent: v.intent ?? slide.intent, guidance: v.guidance, fallback: v.fallback ?? slide.type, variant: true };
      if (v.type === "meme") { memes++; notes.push(`"${slide.id}" became a meme slide`); }
    }
    if (!allowed.has(r.type)) {
      const alt = r.fallback && allowed.has(r.fallback) ? r.fallback : "explanation";
      notes.push(`"${slide.id}": ${r.type} is not used for ${SUBJECTS[ctx.subject].label} at ${ctx.gradeLabel}, so it is a${alt === "explanation" ? "n explanation" : ` ${alt}`} slide`);
      r = { ...r, type: alt, fallback: alt === "explanation" ? undefined : "explanation" };
    }
    items.push(r);
  }

  // The teacher turned the quiz off: honour it, except in an assessment where the quiz is the lesson.
  if (!ctx.include.quiz && ctx.goal !== "assess") {
    const before = items.length;
    items = items.filter(i => i.type !== "quiz_mcq");
    if (items.length < before) notes.push("quiz questions left out, as you asked");
  }

  // Fewer slides requested than the template has: drop the least important, never the opening or the close.
  const want = Math.max(1, ctx.slideCount);
  while (items.length > want) {
    let drop = -1, lowest = 99;
    items.forEach((it, i) => {
      if (i === 0 || it.type === "title" || (i === items.length - 1 && it.type === "recap")) return;
      if (it.slide.keep <= lowest) { lowest = it.slide.keep; drop = i; } // `<=`: on a tie the later slide goes first
    });
    if (drop < 0) break;
    notes.push(`dropped "${items[drop].slide.id}" to fit ${want} slides`);
    items.splice(drop, 1);
  }

  const plan: PlanItem[] = items.map((it, i) => {
    let guidance = fill(it.guidance, ctx);
    if (it.type === "objectives" && ctx.objectives.length) guidance = "Restate the teacher's objectives in student-friendly words, keeping their meaning.";
    return { n: i + 1, intent: it.intent, type: it.type, guidance, fallbackType: it.fallback };
  });
  return { plan, notes, slideIds: items.map(i => i.slide.id) };
}
