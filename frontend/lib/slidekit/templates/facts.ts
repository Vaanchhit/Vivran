// ─────────────────────────────────────────────────────────────
// Facts: everything the template selector and design rules may look at,
// derived deterministically from what the teacher typed (and, after the
// model has filled the deck, from the deck itself). No model call.
// The list below IS the vocabulary of the condition language; a rule that
// names a fact not listed here fails at load.
// ─────────────────────────────────────────────────────────────
import type { Block } from "../blocks";
import type { LessonContext } from "../intent";
import { SUBJECTS } from "../subjects";
import { MEME_IDS } from "../meme-core";
import type { Facts } from "./cond";
import vocab from "./purposes.json";

export const PLAN_FACTS = [
  "grade", "subject", "family", "goal", "slideCount", "durationMin", "shapes", "topShape", "purpose", "tone",
  "wantsMeme", "memeOk", "grounded", "script", "language", "hasObjectives", "quantitative", "isCode",
] as const;
export const FILL_FACTS = ["avgWords", "maxWords", "memeCount", "hasFormula", "hasCode", "hasDiagrams", "quizShare", "blockCount"] as const;
export const KNOWN_FACTS: ReadonlySet<string> = new Set<string>([...PLAN_FACTS, ...FILL_FACTS]);

type Vocab = Record<string, { keywords: string[] }>;
const PURPOSES = vocab.purposes as Vocab;
const TONES = vocab.tones as Vocab;

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ")} `;
const hits = (text: string, words: string[]) => words.filter(w => text.includes(` ${w.toLowerCase()} `) || (w.length > 4 && text.includes(` ${w.toLowerCase()}`))).length;

/** Highest-scoring vocabulary entry for the text, or undefined when nothing matched. */
function infer(text: string, table: Vocab): string | undefined {
  let best: string | undefined, top = 0;
  for (const [id, { keywords }] of Object.entries(table)) {
    const n = hits(text, keywords);
    if (n > top) { top = n; best = id; }
  }
  return best;
}

export interface PromptSignals { text: string; wantsMeme: boolean }

/** Read the teacher's own words: topic, notes, objectives. */
export function signals(ctx: LessonContext, extra = ""): PromptSignals {
  const text = norm([ctx.topic, ctx.notes ?? "", ctx.objectives.join(" "), extra].join(" "));
  return { text, wantsMeme: ctx.allowedBlocks.includes("meme") };
}

export function planFacts(ctx: LessonContext, durationMin?: number, extra = ""): Facts {
  const sig = signals(ctx, extra);
  const purpose = infer(sig.text, PURPOSES) ?? (ctx.goal === "assess" ? "assessment" : ctx.goal === "revise" ? "revision" : ctx.goal === "practice" ? "practice" : "introduction");
  const tone = infer(sig.text, TONES) ?? "neutral";
  const shapes = ctx.shapes.map(s => s.shape);
  // Memes are offered only when asked for in plain words, or the deck is relaxed by nature (never in assessments,
  // formal talks, or a lesson whose own text looks like a formal event).
  const memeOk = ctx.goal !== "assess" && tone !== "formal" && MEME_IDS.length > 0;
  return {
    grade: ctx.grade, subject: ctx.subject, family: SUBJECTS[ctx.subject].family, goal: ctx.goal,
    slideCount: ctx.slideCount, durationMin, shapes, topShape: shapes[0], purpose, tone,
    wantsMeme: sig.wantsMeme, memeOk, grounded: ctx.grounding === "strict", script: ctx.script, language: ctx.language.toLowerCase(),
    hasObjectives: ctx.objectives.length > 0,
    quantitative: shapes.some(s => ["quantitative", "computational", "skill"].includes(s)),
    isCode: SUBJECTS[ctx.subject].family === "computing",
  };
}

const wordsIn = (v: unknown): number[] => {
  if (typeof v === "string") return [v.trim().split(/\s+/).filter(Boolean).length];
  if (Array.isArray(v)) return v.flatMap(wordsIn);
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => ["type", "intent", "source", "imageQuery", "icon", "notes", "sourceIds", "template", "language"].includes(k) ? [] : wordsIn(x));
  return [];
};

/** Facts about the filled deck, for rules that react to what the model actually wrote. */
export function fillFacts(blocks: Block[]): Facts {
  const per = blocks.map(b => wordsIn(b));
  const flat = per.flat();
  const avg = flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : 0;
  const types = blocks.map(b => b.type as string);
  return {
    avgWords: +avg.toFixed(1), maxWords: flat.length ? Math.max(...flat) : 0, blockCount: blocks.length,
    memeCount: types.filter(t => t === "meme").length, hasFormula: types.includes("formula"), hasCode: types.includes("code_example"),
    hasDiagrams: types.some(t => ["process", "timeline", "concept_map", "hierarchy", "cause_effect", "flowchart", "comparison"].includes(t)),
    quizShare: blocks.length ? +(types.filter(t => t === "quiz_mcq").length / blocks.length).toFixed(2) : 0,
  };
}
