// ─────────────────────────────────────────────────────────────
// Registry: loads every template and design rule, validates them, and fails
// loudly with the file and field when one is wrong. To add a template: drop a
// JSON file in families/, add one import line below. Nothing else.
// ─────────────────────────────────────────────────────────────
import { THEMES } from "../render";
import { SHAPES } from "../subjects";
import { Template, DesignRule, DesignSet } from "./schema";
import { factsIn, type Cond } from "./cond";
import { KNOWN_FACTS } from "./facts";
import conceptIntro from "./families/concept-intro.json";
import problemSolver from "./families/problem-solver.json";
import howItWorks from "./families/how-it-works.json";
import storyOfAnEra from "./families/story-of-an-era.json";
import compareContrast from "./families/compare-contrast.json";
import examRevision from "./families/exam-revision.json";
import labActivity from "./families/lab-activity.json";
import readingRoom from "./families/reading-room.json";
import codeLab from "./families/code-lab.json";
import quizRound from "./families/quiz-round.json";
import caseStudy from "./families/case-study.json";
import courseOrientation from "./families/course-orientation.json";
import dataStory from "./families/data-story.json";
import debateRoom from "./families/debate-room.json";
import derivation from "./families/derivation.json";
import flippedCheckin from "./families/flipped-checkin.json";
import grammarDrill from "./families/grammar-drill.json";
import inTheNews from "./families/in-the-news.json";
import labelTheParts from "./families/label-the-parts.json";
import parentMeeting from "./families/parent-meeting.json";
import placesAndPatterns from "./families/places-and-patterns.json";
import projectLaunch from "./families/project-launch.json";
import researchSeminar from "./families/research-seminar.json";
import storyTime from "./families/story-time.json";
import teacherWorkshop from "./families/teacher-workshop.json";
import vivaPrep from "./families/viva-prep.json";
import designRules from "./design-rules.json";
import vocab from "./purposes.json";

const FILES: [string, unknown][] = [
  ["concept-intro", conceptIntro],
  ["problem-solver", problemSolver],
  ["how-it-works", howItWorks],
  ["story-of-an-era", storyOfAnEra],
  ["compare-contrast", compareContrast],
  ["exam-revision", examRevision],
  ["lab-activity", labActivity],
  ["reading-room", readingRoom],
  ["code-lab", codeLab],
  ["quiz-round", quizRound],
  ["case-study", caseStudy],
  ["course-orientation", courseOrientation],
  ["data-story", dataStory],
  ["debate-room", debateRoom],
  ["derivation", derivation],
  ["flipped-checkin", flippedCheckin],
  ["grammar-drill", grammarDrill],
  ["in-the-news", inTheNews],
  ["label-the-parts", labelTheParts],
  ["parent-meeting", parentMeeting],
  ["places-and-patterns", placesAndPatterns],
  ["project-launch", projectLaunch],
  ["research-seminar", researchSeminar],
  ["story-time", storyTime],
  ["teacher-workshop", teacherWorkshop],
  ["viva-prep", vivaPrep],
];

/** Values a categorical fact can take; a rule naming any other value is a typo, not a no-match. */
const DOMAIN: Record<string, readonly (string | number | boolean)[]> = {
  grade: ["primary", "middle", "secondary", "college"],
  goal: ["introduce", "revise", "practice", "assess"],
  shapes: SHAPES, topShape: SHAPES,
  purpose: Object.keys(vocab.purposes),
  audience: ["students", ...Object.keys(vocab.audiences)],
  tone: ["neutral", "playful", "formal"],
  family: ["quant", "science", "humanities", "commerce", "computing", "language", "arts", "law", "general"],
  script: ["latin", "devanagari", "bengali", "tamil", "telugu", "gujarati", "gurmukhi", "other"],
};

function checkCond(c: Cond, where: string, errors: string[]) {
  for (const name of factsIn(c)) if (!KNOWN_FACTS.has(name)) errors.push(`${where}: unknown fact "${name}"`);
  const walk = (x: Cond) => {
    if ("all" in x) return x.all.forEach(walk);
    if ("any" in x) return x.any.forEach(walk);
    if ("not" in x) return walk(x.not);
    const dom = DOMAIN[x.fact];
    if (!dom) return;
    const vals = "is" in x ? [x.is] : "in" in x ? x.in : "notIn" in x ? x.notIn : "has" in x ? [x.has] : "hasAny" in x ? x.hasAny : [];
    for (const v of vals) if (!dom.includes(v as string)) errors.push(`${where}: "${String(v)}" is not a value of fact "${x.fact}" (one of ${dom.join(", ")})`);
  };
  walk(c);
}

function checkDesign(d: DesignSet | undefined, where: string, errors: string[]) {
  if (d?.theme && !THEMES[d.theme]) errors.push(`${where}: unknown theme "${d.theme}" (one of ${Object.keys(THEMES).join(", ")})`);
}

function load() {
  const errors: string[] = [];
  const templates: Template[] = [];
  for (const [file, raw] of FILES) {
    const r = Template.safeParse(raw);
    if (!r.success) { r.error.issues.forEach(i => errors.push(`families/${file}.json → ${i.path.join(".")}: ${i.message}`)); continue; }
    const t = r.data;
    if (t.id !== file) errors.push(`families/${file}.json: id "${t.id}" must match the file name`);
    if (t.requires) checkCond(t.requires, `${file}.requires`, errors);
    t.signals.forEach((s, i) => checkCond(s.when, `${file}.signals[${i}]`, errors));
    t.slides.forEach((s, i) => {
      if (s.include) checkCond(s.include, `${file}.slides[${i}].include`, errors);
      s.variants?.forEach((v, j) => checkCond(v.when, `${file}.slides[${i}].variants[${j}]`, errors));
    });
    checkDesign(t.design, `${file}.design`, errors);
    templates.push(t);
  }
  if (templates.filter(t => t.default).length !== 1) errors.push("exactly one template must have \"default\": true");

  const rules: DesignRule[] = [];
  const r = DesignRule.array().safeParse((designRules as { rules: unknown }).rules);
  if (!r.success) r.error.issues.forEach(i => errors.push(`design-rules.json → rules.${i.path.join(".")}: ${i.message}`));
  else for (const rule of r.data) {
    checkCond(rule.when, `design-rules.${rule.id}`, errors);
    checkDesign(rule.set, `design-rules.${rule.id}.set`, errors);
    rules.push(rule);
  }
  if (errors.length) throw new Error(`Template library is invalid:\n  ${errors.join("\n  ")}`);
  return { templates, rules };
}

const loaded = load();
export const TEMPLATES: readonly Template[] = loaded.templates;
export const DESIGN_RULES: readonly DesignRule[] = loaded.rules;
export const templateById = (id: string) => TEMPLATES.find(t => t.id === id);
export const defaultTemplate = () => TEMPLATES.find(t => t.default)!;
