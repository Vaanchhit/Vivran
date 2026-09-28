// ─────────────────────────────────────────────────────────────
// Intent understanding. Turns what a teacher typed into a resolved
// LessonContext, deterministically and without an LLM call.
// Anything it can't resolve becomes a question, not a guess.
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import type { BlockType } from "./blocks";
import {
  SHAPES, SHAPE_KEYWORDS, SUBJECTS, allowedBlocks, GRADE_BLOCK_EXCLUDES,
  inferSubject, resolveSubject, type Shape, type SubjectId,
} from "./subjects";
import type { GradeBand } from "./tokens";

// ── input ───────────────────────────────────────────────────
export const GOALS = ["introduce", "revise", "practice", "assess"] as const;
export type Goal = (typeof GOALS)[number];

/** Hard cap on deck length: short decks are what a class actually gets through. */
export const MAX_SLIDES = 8;

export const TeacherInput = z.object({
  topic: z.string().trim().min(2).max(200),
  subject: z.string().trim().max(60).optional(),
  grade: z.union([z.string().trim().max(80), z.number().int().min(1).max(20)]).optional(),
  goal: z.enum(GOALS).default("introduce"),
  slideCount: z.number().int().min(5).max(MAX_SLIDES).optional(),
  durationMin: z.number().int().min(10).max(180).optional(),
  board: z.string().trim().max(40).optional(),
  objectives: z.array(z.string().trim().min(3).max(200)).max(6).optional(),
  sourceText: z.string().trim().max(20000).optional(),
  include: z.object({
    quiz: z.boolean(), activity: z.boolean(), misconceptions: z.boolean(),
    realWorld: z.boolean(), vocabulary: z.boolean(),
  }).partial().default({}),
  language: z.string().trim().max(30).default("English"),
  notes: z.string().trim().max(1000).optional(),
});
export type TeacherInput = z.input<typeof TeacherInput>;
type Include = { quiz: boolean; activity: boolean; misconceptions: boolean; realWorld: boolean; vocabulary: boolean };

// ── output ──────────────────────────────────────────────────
export interface Question {
  field: "grade" | "topic" | "subject" | "sourceText";
  ask: string;
  /** Tappable choices for the UI, when the answer space is small. */
  options?: string[];
  /** Blocking questions must be answered before generation. */
  blocking: boolean;
}

export interface LessonContext {
  topic: string;
  subject: SubjectId;
  subjectSource: "chosen" | "inferred" | "default";
  grade: GradeBand;
  gradeLabel: string;
  goal: Goal;
  slideCount: number;
  board?: string;
  objectives: string[];
  grounding: "strict" | "open";
  sourceText?: string;
  include: Include;
  /** Includes the teacher switched on explicitly. The planner guarantees these a slide. */
  requested: (keyof Include)[];
  language: string;
  script: "latin" | "devanagari" | "bengali" | "tamil" | "telugu" | "gujarati" | "gurmukhi" | "other";
  shapes: { shape: Shape; score: number }[];
  allowedBlocks: BlockType[];
  notes?: string;
  questions: Question[];
  warnings: string[];
}

// ── grade ───────────────────────────────────────────────────
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const COLLEGE = /\b(ug|pg|undergrad\w*|postgrad\w*|college|universit\w*|bachelor\w*|master\w*|b\.?\s?(com|sc|a|ba|ms|ca|tech|e|ed|pharm|des|arch)|m\.?\s?(com|sc|a|ba|tech|phil|des|pharm|d|s)|bba|bms|bca|mba|mca|pgdm|pgd\w*|llb|llm|ph\.?\s?d|mbbs|bds|hons|honours|semester|sem\s?\d|term\s?\d|first year|second year|third year|final year|\d(st|nd|rd|th)\s?year|year\s?\d\s?(ug|pg)|fy|sy|ty)\b/;

export function bandOf(n: number): GradeBand {
  return n <= 5 ? "primary" : n <= 8 ? "middle" : n <= 12 ? "secondary" : "college";
}

export function parseGrade(raw?: string | number): { band: GradeBand; label: string } | null {
  if (raw === undefined || raw === "") return null;
  if (typeof raw === "number") return { band: bandOf(raw), label: `Class ${raw}` };
  const q = raw.toLowerCase().trim();
  if (/\b(kg|lkg|ukg|nursery|pre-?primary|kindergarten)\b/.test(q)) return { band: "primary", label: raw };
  if (COLLEGE.test(q)) return { band: "college", label: raw };
  const uk = q.match(/\byear\s*(\d{1,2})\b/); // UK "Year 7" = Class 6
  if (uk) return { band: bandOf(Math.max(1, +uk[1] - 1)), label: raw };
  const num = q.match(/\b(?:class|grade|std\.?|standard)?\s*(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (num && +num[1] >= 1 && +num[1] <= 12) return { band: bandOf(+num[1]), label: `Class ${num[1]}` };
  const rom = q.match(/\b(?:class|grade|std\.?|standard)\s+([ivx]{1,4})\b/);
  if (rom && ROMAN[rom[1]]) return { band: bandOf(ROMAN[rom[1]]), label: `Class ${ROMAN[rom[1]]}` };
  if (/\b(primary|elementary|junior)\b/.test(q)) return { band: "primary", label: raw };
  if (/\b(middle)\b/.test(q)) return { band: "middle", label: raw };
  if (/\b(high school|secondary|senior|board)\b/.test(q)) return { band: "secondary", label: raw };
  return null;
}

// ── text hygiene ────────────────────────────────────────────
const INJECTION = /\b(ignore|disregard|forget)\b.{0,30}\b(previous|above|prior|all)\b.{0,20}\b(instructions?|rules?|prompts?)\b|\bsystem prompt\b|\byou are now\b|\bact as\b/i;

function clean(s: string | undefined): { text?: string; flagged: boolean } {
  if (!s) return { flagged: false };
  const t = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim();
  return { text: t || undefined, flagged: INJECTION.test(t) };
}

function detectScript(...texts: (string | undefined)[]): LessonContext["script"] {
  const all = texts.filter(Boolean).join(" ");
  if (/[\u0900-\u097F]/.test(all)) return "devanagari";
  if (/[\u0980-\u09FF]/.test(all)) return "bengali";
  if (/[\u0A00-\u0A7F]/.test(all)) return "gurmukhi";
  if (/[\u0A80-\u0AFF]/.test(all)) return "gujarati";
  if (/[\u0B80-\u0BFF]/.test(all)) return "tamil";
  if (/[\u0C00-\u0C7F]/.test(all)) return "telugu";
  if (/[^\u0000-\u024F\u2000-\u206F\u20A0-\u20CF\u2190-\u22FF]/.test(all)) return "other";
  return "latin";
}
const LANGUAGE_SCRIPT: Record<string, LessonContext["script"]> = {
  hindi: "devanagari", marathi: "devanagari", sanskrit: "devanagari", nepali: "devanagari",
  bengali: "bengali", bangla: "bengali", assamese: "bengali", punjabi: "gurmukhi",
  gujarati: "gujarati", tamil: "tamil", telugu: "telugu",
};

// ── topic shape ─────────────────────────────────────────────
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scoreShapes(text: string, subject: SubjectId): { shape: Shape; score: number }[] {
  const t = ` ${text.toLowerCase()} `;
  const raw = {} as Record<Shape, number>;
  for (const sh of SHAPES) {
    const hits = SHAPE_KEYWORDS[sh].filter(k => new RegExp(`(^|\\W)${esc(k)}(\\W|$)`).test(t)).length;
    raw[sh] = Math.min(hits, 2) + ((SUBJECTS[subject].priors as Partial<Record<Shape, number>>)[sh] ?? 0);
    // a leading cue ("Causes of…", "Types of…") states the teacher's intent outright
    if (SHAPE_KEYWORDS[sh].some(k => t.trimStart().startsWith(`${k} `))) raw[sh] += 1.5;
  }
  if (/\b(1[0-9]{3}|20[0-9]{2})s?\b/.test(t)) raw.chronological += 1;          // a year
  if (/\d\s*[+\-×x*/=^]\s*\d|\bx\^?2\b/.test(t)) raw.quantitative += 0.5;       // arithmetic
  if (/\s(vs\.?|versus|and)\s/.test(t) && raw.comparative > 0) raw.comparative += 0.5;

  const max = Math.max(...Object.values(raw));
  if (max <= 0) return [{ shape: "conceptual", score: 1 }];
  return (Object.entries(raw) as [Shape, number][])
    .map(([shape, v]) => ({ shape, score: +(v / max).toFixed(2) }))
    .filter(s => s.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ── defaults ────────────────────────────────────────────────
const DEFAULT_SLIDES: Record<Goal, number> = { introduce: 8, revise: 7, practice: 7, assess: 6 };

function defaultInclude(goal: Goal, grade: GradeBand, subject: SubjectId): Include {
  const fam = SUBJECTS[subject].family;
  const young = grade === "primary" || grade === "middle";
  switch (goal) {
    case "introduce": return { quiz: true, activity: young, misconceptions: true, realWorld: true, vocabulary: young || fam === "science" || fam === "humanities" };
    case "revise":    return { quiz: true, activity: false, misconceptions: true, realWorld: false, vocabulary: true };
    case "practice":  return { quiz: true, activity: true, misconceptions: false, realWorld: false, vocabulary: false };
    case "assess":    return { quiz: true, activity: false, misconceptions: false, realWorld: false, vocabulary: false };
  }
}

const TOO_ADVANCED: Partial<Record<GradeBand, RegExp>> = {
  primary: /\b(calculus|derivative|integral|differentiation|matrix|matrices|logarithm|trigonometr\w*|organic chemistry|quantum|thermodynamics)\b/i,
  middle: /\b(calculus|derivative|integral|differentiation|quantum|thermodynamics)\b/i,
};

// ── main ────────────────────────────────────────────────────
export function understand(rawInput: TeacherInput): LessonContext {
  const input = TeacherInput.parse(rawInput);
  const questions: Question[] = [];
  const warnings: string[] = [];

  const topicC = clean(input.topic), notesC = clean(input.notes), srcC = clean(input.sourceText);
  if (topicC.flagged || notesC.flagged)
    warnings.push("Some text looked like instructions to the AI. It was kept as lesson content only.");
  const topic = topicC.text!;

  // subject
  let subject: SubjectId, subjectSource: LessonContext["subjectSource"];
  const chosen = resolveSubject(input.subject);
  const guessed = inferSubject(`${topic} ${notesC.text ?? ""}`);
  if (chosen) { subject = chosen; subjectSource = "chosen"; }
  else if (guessed && guessed.confidence >= 0.75) { subject = guessed.id; subjectSource = "inferred"; }
  else {
    subject = guessed?.id ?? "general"; subjectSource = guessed ? "inferred" : "default";
    questions.push({
      field: "subject", blocking: false,
      ask: guessed ? `Is this a ${SUBJECTS[guessed.id].label} lesson?` : "Which subject is this for?",
      options: guessed ? [SUBJECTS[guessed.id].label, "Something else"] : undefined,
    });
  }

  // grade
  const g = parseGrade(input.grade);
  if (!g) questions.push({
    field: "grade", blocking: true, ask: "Which class or level is this for?",
    options: ["Class 1–5", "Class 6–8", "Class 9–12", "College"],
  });
  const grade = g?.band ?? "secondary";

  // topic breadth
  const words = topic.split(/\s+/).length;
  const isWholeSubject = words <= 3 && Object.values(SUBJECTS).some(d => (d.synonyms as string[]).includes(topic.toLowerCase()));
  if (isWholeSubject) questions.push({
    field: "topic", blocking: true,
    ask: `"${topic}" is a whole subject. Which chapter or topic should this lesson cover?`,
  });
  else if ((topic.match(/,|;|\band\b/g) ?? []).length >= 3)
    warnings.push("This looks like several topics. Consider one lesson per topic for clearer slides.");

  const adv = TOO_ADVANCED[grade];
  if (g && adv?.test(topic)) warnings.push(`"${topic}" is usually taught above ${g.label}. Check the level before generating.`);

  // size
  let slideCount = input.slideCount
    ?? (input.durationMin ? Math.round(input.durationMin / 3.5) : DEFAULT_SLIDES[input.goal]);
  slideCount = Math.max(5, Math.min(MAX_SLIDES, slideCount));

  // grounding
  const grounding = srcC.text && srcC.text.length >= 200 ? "strict" : "open";
  if (srcC.text && grounding === "open")
    warnings.push("The source material is very short, so most content will be generated. Review facts before class.");
  if (grounding === "open" && ["history", "science", "biology", "chemistry", "physics", "geography", "economics"].includes(subject))
    questions.push({
      field: "sourceText", blocking: false,
      ask: "Paste the textbook section or your notes to make every fact traceable. You can also skip this.",
    });

  // script
  const langScript = LANGUAGE_SCRIPT[input.language.toLowerCase()];
  const script = langScript ?? detectScript(topic, srcC.text);
  if (script !== "latin") warnings.push(`Slides will use ${script} script. Layouts use taller line spacing for it.`);

  const trustedNotes = notesC.flagged ? "" : notesC.text ?? "";
  const shapes = scoreShapes(`${topic} ${trustedNotes} ${(input.objectives ?? []).join(" ")}`, subject);
  const allowed = allowedBlocks(subject).filter(b => !GRADE_BLOCK_EXCLUDES[grade].includes(b));

  return {
    topic, subject, subjectSource, grade, gradeLabel: g?.label ?? "unspecified", goal: input.goal, slideCount,
    board: input.board, objectives: input.objectives ?? [], grounding, sourceText: srcC.text,
    include: { ...defaultInclude(input.goal, grade, subject), ...input.include },
    requested: (Object.keys(input.include) as (keyof Include)[]).filter(k => input.include[k]),
    language: input.language, script, shapes, allowedBlocks: allowed, notes: notesC.text,
    questions, warnings,
  };
}

export const isReady = (ctx: LessonContext) => !ctx.questions.some(q => q.blocking);
