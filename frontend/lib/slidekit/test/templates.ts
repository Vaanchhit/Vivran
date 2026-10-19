// ─────────────────────────────────────────────────────────────
// Template family tests. Free: the model is the mock.
//   npx tsx lib/slidekit/test/templates.ts
// Covers: the condition language, registry validation, which template a
// real-sounding teacher prompt selects (and why), plan shape, design rules,
// the meme safeguards, and that every template x every model behaviour
// lays out cleanly (no overflow past the safe area, no overlapping text,
// nothing lost).
// ─────────────────────────────────────────────────────────────
import { evalCond } from "../templates/cond";
import { TEMPLATES, DESIGN_RULES, prepareTemplated, finalDesign, decideDesign } from "../templates";
import { matchDeck, type Placement } from "../matcher";
import { repairBlock } from "../repair";
import { withKnobs, CANVAS, SAFE } from "../tokens";
import { THEMES, contrast } from "../render";
import { cleanCaption, escapeLine, memeLines, memeSrc, verifyMemeQuery, MEME_FORMATS } from "../meme";
import { mockDeck, type Profile } from "./mockModel";
import { exportPptx } from "../pptx";
import JSZip from "jszip";
import type { Block } from "../blocks";
import type { TeacherInput } from "../intent";

const failures: string[] = [];
let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) failures.push(msg); };

// ── condition language ──────────────────────────────────────
{
  const f = { grade: "primary", n: 7, shapes: ["causal", "process"], on: true, off: false };
  ok(evalCond({ fact: "grade", is: "primary" }, f), "is");
  ok(evalCond({ fact: "grade", in: ["middle", "primary"] }, f), "in");
  ok(!evalCond({ fact: "grade", notIn: ["primary"] }, f), "notIn");
  ok(evalCond({ fact: "n", gte: 7 }, f) && !evalCond({ fact: "n", gte: 8 }, f) && evalCond({ fact: "n", lte: 7 }, f), "gte/lte");
  ok(evalCond({ fact: "shapes", has: "process" }, f) && evalCond({ fact: "shapes", hasAny: ["x", "causal"] }, f) && !evalCond({ fact: "shapes", has: "x" }, f), "has/hasAny");
  ok(evalCond({ fact: "on", truthy: true }, f) && evalCond({ fact: "off", truthy: false }, f) && evalCond({ fact: "missing", truthy: false }, f), "truthy");
  ok(evalCond({ all: [{ fact: "on", truthy: true }, { not: { fact: "off", truthy: true } }] }, f), "all/not");
  ok(evalCond({ any: [{ fact: "grade", is: "x" }, { fact: "n", is: 7 }] }, f), "any");
  ok(!evalCond({ fact: "shapes", in: ["causal"] }, f), "'in' never matches a list-valued fact");
}

// ── library integrity ───────────────────────────────────────
ok(TEMPLATES.length === 26, `26 templates, got ${TEMPLATES.length}`);
for (const t of TEMPLATES) ok(t.slides.length === 8, `${t.id} has 8 slides, has ${t.slides.length}`);
for (const t of TEMPLATES) ok(!!t.design?.skin, `${t.id} has a skin`);
for (const r of DESIGN_RULES) if (r.set.theme) ok(THEMES[r.set.theme], `rule ${r.id} names a real theme`);
for (const [id, th] of Object.entries(THEMES)) { // the contrast guard: every preset the rules can pick reads
  ok(contrast(th.theme.ink, th.theme.bg) >= 7, `${id}: ink on bg ≥ 7:1`);
  ok(contrast(th.theme.accent, th.theme.bg) >= 3, `${id}: accent on bg ≥ 3:1`);
}

// ── selection: persona prompts → expected template ──────────
interface Case { who: string; input: TeacherInput; expect: string; meme?: boolean; slides?: number }
const CASES: Case[] = [
  { who: "Class 6 science teacher, first lesson", input: { topic: "Photosynthesis", grade: "Class 6", subject: "Science", goal: "introduce" }, expect: "how-it-works" },
  { who: "Class 10 maths, practice session", input: { topic: "Quadratic equations: solving by factorisation", grade: "Class 10", subject: "Mathematics", goal: "practice" }, expect: "problem-solver" },
  { who: "Class 9 physics numericals", input: { topic: "Newton's second law numericals", grade: "Class 9", subject: "Physics", goal: "practice", notes: "solve problems" }, expect: "problem-solver" },
  { who: "Class 8 history", input: { topic: "The revolt of 1857: causes and events", grade: "Class 8", subject: "History", goal: "introduce" }, expect: "story-of-an-era" },
  { who: "Class 11 biology compare", input: { topic: "Mitosis vs Meiosis", grade: "Class 11", subject: "Biology", goal: "introduce" }, expect: "compare-contrast" },
  { who: "Board revision, Class 12 chemistry", input: { topic: "Electrochemistry", grade: "Class 12", subject: "Chemistry", goal: "revise", notes: "last minute exam prep" }, expect: "exam-revision" },
  { who: "Class 7 lab period", input: { topic: "Acids and bases litmus experiment", grade: "Class 7", subject: "Science", notes: "hands-on activity in groups" }, expect: "lab-activity" },
  { who: "Class 9 English poem", input: { topic: "The poem 'Daffodils' analysis", grade: "Class 9", subject: "English Literature", goal: "introduce" }, expect: "reading-room" },
  { who: "BCA programming", input: { topic: "Python for loops", grade: "BCA", subject: "Computer Science", goal: "introduce" }, expect: "code-lab" },
  { who: "Quiz round", input: { topic: "Fractions quiz round", grade: "Class 5", subject: "Mathematics", goal: "assess", slideCount: 8 }, expect: "quiz-round" },
  { who: "Vague prompt falls to default", input: { topic: "Democracy", grade: "Class 8", subject: "civics", goal: "introduce" }, expect: "concept-intro" },
  { who: "Meme requested", input: { topic: "Photosynthesis", grade: "Class 8", subject: "Science", goal: "introduce", notes: "add a meme, make it fun" }, expect: "how-it-works", meme: true },
  { who: "Meme via include flag", input: { topic: "Compound interest vs simple interest", grade: "Class 9", subject: "Economics", include: { meme: true } }, expect: "compare-contrast", meme: true },
  { who: "No meme unless asked", input: { topic: "Photosynthesis", grade: "Class 8", subject: "Science", goal: "introduce" }, expect: "how-it-works", meme: false },
  { who: "No meme in an assessment even if asked", input: { topic: "Fractions quiz", grade: "Class 5", subject: "Mathematics", goal: "assess", notes: "funny memes please" }, expect: "quiz-round", meme: false },
  { who: "Law case", input: { topic: "Kesavananda Bharati case study", grade: "LLB", subject: "law" }, expect: "case-study" },
  { who: "Civics debate", input: { topic: "Debate: should voting be compulsory", grade: "Class 10", subject: "civics" }, expect: "debate-room" },
  { who: "PG seminar", input: { topic: "Research paper presentation on transformer models", grade: "M.Tech", subject: "computer_science" }, expect: "research-seminar" },
  { who: "Class 2 story", input: { topic: "The thirsty crow story", grade: "Class 2", subject: "english_literature" }, expect: "story-time" },
  { who: "Science fair project", input: { topic: "Science fair project on water purification", grade: "Class 8", subject: "science" }, expect: "project-launch" },
  { who: "Current affairs", input: { topic: "Repo rate hike in the news", grade: "Class 12", subject: "economics" }, expect: "in-the-news" },
  { who: "Parts of a flower", input: { topic: "Parts of a flower", grade: "Class 6", subject: "biology" }, expect: "label-the-parts" },
  { who: "Physics derivation", input: { topic: "Derive the equations of motion", grade: "Class 11", subject: "physics" }, expect: "derivation" },
  { who: "Geography regions", input: { topic: "Climate regions of India", grade: "Class 9", subject: "geography" }, expect: "places-and-patterns" },
  { who: "Practical viva", input: { topic: "Viva questions on titration", grade: "Class 12", subject: "chemistry" }, expect: "viva-prep" },
  { who: "First day", input: { topic: "Welcome to Class 11 Accountancy: course orientation", grade: "Class 11", subject: "accountancy" }, expect: "course-orientation" },
  { who: "Teacher workshop", input: { topic: "Workshop for teachers on formative assessment", grade: "college", subject: "general" }, expect: "teacher-workshop" },
  { who: "PTM", input: { topic: "Parent teacher meeting for term 1", grade: "Class 4", subject: "general" }, expect: "parent-meeting" },
  { who: "Grammar", input: { topic: "Active and passive voice", grade: "Class 7", subject: "language" }, expect: "grammar-drill" },
  { who: "Flipped", input: { topic: "Flipped classroom check-in on cell division after watching the video", grade: "Class 9", subject: "biology" }, expect: "flipped-checkin" },
  { who: "Data", input: { topic: "India's GDP growth data and trends", grade: "Class 12", subject: "economics" }, expect: "data-story" },
  { who: "No meme for parents even if asked", input: { topic: "Parent teacher meeting, add a meme", grade: "Class 4", subject: "general" }, expect: "parent-meeting", meme: false },
  { who: "Fewer slides requested", input: { topic: "Photosynthesis", grade: "Class 6", subject: "Science", slideCount: 6 }, expect: "how-it-works", slides: 6 },
];

const PROFILES: Profile[] = ["typical", "max", "sloppy", "broken"];
const safe = (e: Placement["elements"][number]) => !("w" in e) || (e.t === "image" && e.bg) || (e.t === "box" && e.tone === "inverse") ||
  (e.x >= SAFE.x - 1 && e.y >= SAFE.y - 1 && e.x + e.w <= SAFE.x + SAFE.w + 1 && e.y + e.h <= SAFE.y + SAFE.h + 1);

const rows: string[] = [];
const coverage = new Set<string>();
for (const c of CASES) {
  const prep = prepareTemplated(c.input);
  if (prep.status !== "ready") { ok(false, `${c.who}: not ready`); continue; }
  coverage.add(prep.template.id);
  ok(prep.template.id === c.expect, `${c.who}: expected ${c.expect}, got ${prep.template.id} (${prep.template.reasons.join("; ")})`);
  const want = c.slides ?? prep.context.slideCount;
  ok(prep.plan.length === Math.min(want, 8), `${c.who}: ${prep.plan.length} slides, wanted ${want}`);
  ok(prep.plan[0].type === "title", `${c.who}: opens with a title`);
  ok(prep.plan.every(p => prep.context.allowedBlocks.includes(p.type)), `${c.who}: plan uses only allowed block types`);
  const memes = prep.plan.filter(p => p.type === "meme").length;
  if (c.meme !== undefined) ok((memes > 0) === c.meme, `${c.who}: meme slide ${memes > 0 ? "present" : "absent"}, expected ${c.meme ? "present" : "absent"}`);
  ok(memes <= 1, `${c.who}: at most one meme`);
  if (memes) ok(prep.prompt.system.includes("MEME FORMATS") && prep.prompt.system.includes("Never mock"), `${c.who}: meme prompt carries formats and safety rules`);
  else ok(!prep.prompt.system.includes("MEME FORMATS"), `${c.who}: no meme prompt when no meme slide`);

  // fill with every model behaviour, repair, finalise the design, lay out
  for (const profile of PROFILES) {
    const deck = mockDeck(prep.plan, prep.context, profile, `${c.who}:${profile}`);
    const blocks: Block[] = [];
    deck.blocks.forEach((raw, i) => { const r = repairBlock(raw, prep.plan[i], prep.context.topic); if (r.block) blocks.push(r.block); else ok(false, `${c.who}/${profile}: block ${i + 1} (${prep.plan[i].type}) lost`); });
    const design = finalDesign(prep, blocks);
    const placements = withKnobs(design.knobs, () => matchDeck(blocks, prep.context.grade));
    ok(placements.length >= blocks.length, `${c.who}/${profile}: every block has a slide`);
    placements.forEach((p, i) => {
      for (const e of p.elements) ok(safe(e), `${c.who}/${profile}: slide ${i + 1} (${p.layoutId}) ${e.t} leaves the safe area`);
      const texts = p.elements.filter(e => e.t === "text") as Extract<Placement["elements"][number], { t: "text" }>[];
      for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
        const A = texts[a], B = texts[b];
        ok(!(A.x < B.x + B.w - 1 && B.x < A.x + A.w - 1 && A.y < B.y + B.h - 1 && B.y < A.y + A.h - 1), `${c.who}/${profile}: slide ${i + 1} text overlaps`);
      }
    });
    if (memes) ok(placements.some(p => p.elements.some(e => e.t === "picture")), `${c.who}/${profile}: meme slide draws a picture`);
  }
  rows.push(`| ${c.who} | ${prep.template.id} (${prep.template.how}) | ${prep.plan.map(p => p.type).join(" → ")} | ${prep.design.applied.map(a => a.id).join(", ") || "–"} |`);
}
ok([...coverage].length >= 25, `selection reaches at least 25 of the 26 templates, reached ${coverage.size}`);

// ── design rules: conflict resolution + fill phase ──────────
{
  const young = decideDesign({ grade: "primary", family: "science", tone: "neutral", script: "latin" }, undefined, "plan");
  ok(young.themeId === "forest", `young learners beat the subject theme (got ${young.themeId})`);
  ok(young.knobs.minFont === 30 && young.knobs.maxDensity === "low", "young learners get big type and low density");
  ok(young.applied.some(a => a.id === "young-learners"), "decisions name the rule that made them");
  const quizMiddle = decideDesign({ grade: "middle", purpose: "assessment" }, undefined, "plan");
  ok(quizMiddle.knobs.maxDensity === "low", "higher-priority rule wins the density (quiz-room over middle-years)");
  const planOnly = decideDesign({ grade: "primary", avgWords: 12 }, undefined, "plan");
  const withFill = decideDesign({ grade: "primary", avgWords: 12 }, undefined, "fill");
  ok(!planOnly.applied.some(a => a.id === "dense-text-young") && withFill.applied.some(a => a.id === "dense-text-young"), "fill rules run only in the fill phase");
  const base = decideDesign({ grade: "college", family: "humanities" }, { theme: "chalkboard" }, "plan");
  ok(base.themeId === "paper", "a matching rule overrides the template's own default look");
  const none = decideDesign({ grade: "college", family: "general", tone: "neutral", script: "latin" }, { theme: "chalkboard" }, "plan");
  ok(none.themeId === "chalkboard", "template default applies when no rule matches");
}

// ── meme safeguards ─────────────────────────────────────────
{
  ok(MEME_FORMATS.every(f => f.lines >= 1 && f.lines <= 4), "every format takes 1-4 lines");
  ok(cleanCaption("<b>hello</b> https://evil.example world") === "hello world", "caption markup and links stripped");
  ok(cleanCaption("what the fuck") === "", "profanity yields no caption");
  ok(cleanCaption("x".repeat(200)).length <= 70, "caption length capped");
  ok(escapeLine("a b?c/d#e%f_g-h\"i") === "a_b~qc~sd~he~pf__g--h''i", `memegen escaping, got ${escapeLine("a b?c/d#e%f_g-h\"i")}`);
  ok(memeLines("nonexistent", ["a"]) === null, "unknown format rejected");
  ok(memeLines("pooh", ["only one"])?.length === 2, "missing caption lines are padded to the format");
  ok(memeLines("gru", ["1", "2", "3", "4", "5", "6"])?.length === 4, "extra caption lines are trimmed");
  const src = memeSrc("pooh", ["Memorising", "Understanding"])!;
  const u = new URL(src, "http://x");
  const t = u.searchParams.get("t"), l = u.searchParams.get("l"), s = u.searchParams.get("s");
  ok(!!verifyMemeQuery(t, l, s), "a signed meme URL verifies");
  ok(verifyMemeQuery(t, l!.replace("Memorising", "Something else"), s) === null, "tampering with captions fails verification");
  ok(verifyMemeQuery("drake", l, s) === null, "a format outside the allowlist fails verification");
  ok(verifyMemeQuery(t, l, "0".repeat(24)) === null, "a wrong signature fails verification");
  ok(verifyMemeQuery(t, l, null) === null, "a missing signature fails verification");
}

// ── PowerPoint export: real file, one slide per placement, themed ──
async function pptxChecks() {
  const prep = prepareTemplated({ topic: "Photosynthesis", grade: "Class 8", subject: "science", notes: "add a meme" });
  if (prep.status === "ready") {
    const deck = mockDeck(prep.plan, prep.context, "typical", "pptx");
    const blocks = deck.blocks.map((b, i) => repairBlock(b, prep.plan[i], prep.context.topic).block!).filter(Boolean) as Block[];
    const design = finalDesign(prep, blocks);
    const placements = withKnobs(design.knobs, () => matchDeck(blocks, prep.context.grade));
    for (const p of placements) for (const e of p.elements) if (e.t === "picture") e.src = memeSrc(e.template, e.lines) ?? undefined;
    const bytes = (await exportPptx(placements, "Photosynthesis", THEMES[design.themeId ?? "paper"].theme)) as ArrayBuffer;
    const zip = await JSZip.loadAsync(bytes);
    const slideFiles = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    ok(slideFiles.length === placements.length, `pptx has ${slideFiles.length} slides, deck has ${placements.length}`);
    const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
    ok(first.includes("<a:t>") && first.includes("Arial"), "pptx slide text is native and uses the deck font");
    const bgHex = THEMES[design.themeId ?? "paper"].theme.bg.replace("#", "").toUpperCase();
    ok(first.toUpperCase().includes(bgHex), "pptx uses the chosen theme background");
  }
}

async function main() {
  await pptxChecks();
  console.log(`\n| Persona | Template | Slides | Design rules |\n|---|---|---|---|\n${rows.join("\n")}\n`);
  console.log(`${checks} checks, ${failures.length} failure(s)`);
  for (const f of failures.slice(0, 40)) console.log("  ✗", f);
  if (failures.length) process.exit(1);
}
main();
