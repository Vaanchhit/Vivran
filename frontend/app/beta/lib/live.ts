// The chat against the real backend. Every request goes to POST /api/chat/route
// first, which reads it with rules (the small model only when no rule fits) and
// says which intelligence the task belongs to (backend app/ai/task_router.py).
// Then it is handed to whatever that route names:
//
//   chat.answer      POST /api/chat/answer         compare, summarise, ideas, analyse, general
//   examples         POST /api/examples            explain
//   deck             /api/deck/outline → /api/deck slides, planned then written
//   assessment       POST /api/assessments/generate exam papers
//   worksheet        POST /api/content/worksheet
//   course_plan      POST /api/projects
//
// Quick actions go to /api/chat/transform and "Improve" to /api/chat/improve.
// Results come back as the chat's own blocks, so the interface is the same one
// the preview had; only where the words come from changed.
import {
  ApiError, chatAnswer, chatImprove, chatRoute, chatTransform, generateAssessmentPaper, generateCoursePlan, generateDeck,
  generateExample, generateOutline, generateWorksheet, getLibraryItem, getUsualSetup,
  type AssessmentGenerateResponse, type ChatBlock, type ChatRead, type ChatRoute, type ChatSource, type CoursePlan,
  type DeckOutline, type DeckReady, type ExampleResult, type LibraryEntry, type WorksheetResult,
} from "@/services/api";
import { ACTIONS, LEVELS } from "./config";
import type { ActionId, Block, BotMsg, Intent, IntentResult, Msg, OutlineRow, Run, Source, Step } from "./types";

export interface ActiveSource { id: string; title: string }
export interface Profile { name: string; grade?: string; subject?: string; language?: string }
export interface Ask { question: string; options: string[]; field: string; placeholder: string }

export type Command =
  | { kind: "writeDeck"; ref: string; slides: OutlineRow[] }
  | { kind: "writePaper"; ref: string; choice: string };

export interface Reply { result: IntentResult; run: Run; ask?: Ask; routes: ChatRoute[]; ref?: string }

interface Ctx { source: ActiveSource | null; profile: Profile; history: Msg[]; forced?: Intent; command?: Command; voice?: boolean }

const step = (label: string, detail: string): Step => ({ label, detail, ms: 260 });
const INTENTS: Intent[] = ["explain", "summarise", "compare", "slides", "paper", "worksheet", "plan", "ideas", "analyse", "general"];

/* ───────────────────────── what was made, kept by reference ───────────────────────── */

// Decks and papers are large, so blocks point at them by ref. Kept in memory and
// in this browser; a deck or paper saved to the library can always be fetched
// again by its library id.
type Stored =
  | { kind: "outline"; params: DeckArgs; outline: DeckOutline; route?: ChatRoute }
  | { kind: "deck"; deck: DeckReady }
  | { kind: "paperSetup"; params: PaperArgs; route?: ChatRoute }
  | { kind: "paper"; data: AssessmentGenerateResponse; params: PaperArgs; route?: ChatRoute };
interface DeckArgs { topic: string; grade?: string; subject?: string; language?: string; materialId?: string }
interface PaperArgs { topic: string; grade: string; subject: string; marks: number; difficulty: string; materialId?: string }

const mem = new Map<string, Stored>();
let storeKey = "vivran_beta_refs";
export function scopeStore(userId: string) { storeKey = `vivran_beta_refs_${userId}`; mem.clear(); }
const uid = () => Math.random().toString(36).slice(2, 10);

export const refs = {
  put(v: Stored): string { const id = uid(); refs.set(id, v); return id; },
  set(id: string, v: Stored) {
    mem.set(id, v);
    try { localStorage.setItem(`${storeKey}:${id}`, JSON.stringify(v)); } catch { /* full or blocked: memory still has it */ }
  },
  get(id: string): Stored | null {
    if (mem.has(id)) return mem.get(id)!;
    try { const raw = localStorage.getItem(`${storeKey}:${id}`); if (raw) { const v = JSON.parse(raw) as Stored; mem.set(id, v); return v; } } catch { /* ignore */ }
    return null;
  },
};

/** A deck or paper by ref, fetching it from the library when this browser no longer has it. */
export async function loadArtifact(kind: "deck" | "paper", ref: string, libraryId?: string): Promise<Stored | null> {
  const hit = refs.get(ref);
  if (hit) return hit;
  if (!libraryId) return null;
  const item = await getLibraryItem(libraryId);
  const v: Stored = kind === "deck"
    ? { kind: "deck", deck: { ...(item.content as DeckReady), libraryId } }
    : { kind: "paper", data: item.content as AssessmentGenerateResponse, params: { topic: item.title, grade: "", subject: "", marks: 40, difficulty: "medium", ...(item.params as object) } as PaperArgs };
  refs.set(ref, v);
  return v;
}

/* ───────────────────────── helpers ───────────────────────── */

const turns = (history: Msg[]) => history.slice(-8).map((m) => ({ role: m.role, text: m.role === "user" ? m.text : textOf(m.run).slice(0, 1200) }));

function sourcesBlock(list: ChatSource[] | undefined | null, startAt = 1): Block[] {
  if (!list?.length) return [];
  const items: Source[] = list.map((s, i) => ({
    tag: s.tag ?? `S${i + startAt}`,
    file: s.source_material || "Your material",
    where: [s.chapter, s.page_number ? `p. ${s.page_number}` : ""].filter(Boolean).join(" · ") || "passage",
    quote: (s.excerpt || "").replace(/\s+/g, " ").trim().slice(0, 220),
  }));
  return [{ t: "sources", items }];
}

function fromChat(blocks: ChatBlock[]): Block[] {
  return blocks.map((b): Block => b.t === "table"
    ? { t: "table", data: { columns: b.data.columns, rows: b.data.rows, caption: b.data.caption ?? undefined } }
    : b.t === "bullets" ? { t: "bullets", title: b.title ?? undefined, items: b.items } : { t: "text", text: b.text });
}

const followups = (items: string[] | undefined): Block[] => (items?.length ? [{ t: "followups", items }] : []);

function resultFrom(read: ChatRead, forced?: Intent): IntentResult {
  const intent = (forced ?? (INTENTS.includes(read.intent as Intent) ? read.intent : "general")) as Intent;
  return { intent, label: read.label, confidence: read.confidence, entities: read.entities };
}

function failure(e: unknown, text: string): Run {
  const msg = e instanceof ApiError ? e.message : "Couldn't reach Vivran just now. Check your connection and try again.";
  return { steps: [step("Trying", "The request didn't go through.")], blocks: [{ t: "notice", tone: "error", text: msg, retry: text }] };
}

/** How the request itself was read: by rules, or by the small model when no rule matched. */
function reader(read: ChatRead): ChatRoute {
  const slm = read.route.also_used?.find((u) => u.task === "classify_fallback");
  return slm
    ? { task: "classify", intelligence: "slm", pipeline: "chat.route", input: read.route.input, output: "text", why: "No keyword rule matched, so the small model picked the task.", model: slm.model, provider: slm.provider }
    : { task: "classify", intelligence: "rules", pipeline: "chat.route", input: read.route.input, output: "text", why: "Keyword rules read the request; no model was needed.", model: null, provider: "rules" };
}

const describeRoute = (r: ChatRoute) => r.intelligence === "rules" ? "Read by rules, no model needed." : r.intelligence === "slm" ? "A small, fast model is enough for this." : r.intelligence === "llm" ? "This needs the full model." : "Speech service.";

/* ───────────────────────── the request ───────────────────────── */

export async function respond(text: string, ctx: Ctx): Promise<Reply> {
  if (ctx.command?.kind === "writeDeck") return writeDeck(ctx.command.ref, ctx.command.slides);
  if (ctx.command?.kind === "writePaper") return writePaper(ctx.command.ref, ctx.command.choice);

  let read: ChatRead;
  try {
    read = await chatRoute({ text, forced_intent: ctx.forced, has_source: !!ctx.source, modality: ctx.voice ? "voice" : "text" });
  } catch (e) {
    return { result: { intent: "general", label: "General", confidence: 0, entities: {} }, run: failure(e, text), routes: [] };
  }
  const result = resultFrom(read, ctx.forced);
  const routes = [reader(read), read.route];
  const e = read.entities;
  const grade = e.grade ?? ctx.profile.grade;
  const subject = e.subject ?? ctx.profile.subject;
  const first = step("Reading your request", `Looks like ${read.label.toLowerCase()}${e.topic ? ` on ${e.topic}` : ""}${grade ? `, ${grade}` : ""}.`);

  if (read.ask) {
    return { result, ask: read.ask, routes, run: {
      steps: [step("Reading your request", `Looks like ${read.label.toLowerCase()}. One detail is missing, so I'll ask rather than guess.`)],
      blocks: [{ t: "ask", ...read.ask }],
    } };
  }

  try {
    switch (read.route.pipeline) {
      case "deck": return await planDeck(result, routes, first, { topic: e.topic!, grade, subject, language: ctx.profile.language, materialId: ctx.source?.id });
      case "assessment": return await setUpPaper(result, routes, first, { topic: e.topic!, grade: grade ?? "", subject: subject ?? "", marks: e.marks ?? 0, difficulty: e.difficulty || "medium", materialId: ctx.source?.id });
      case "examples": return await explain(result, routes, first, e.topic!, grade, subject, ctx);
      case "worksheet": return await worksheet(result, routes, first, e.topic!, grade, subject);
      case "course_plan": return await plan(result, routes, first, text, e.topic!, grade, subject);
      default: return await answer(result, routes, first, read.task, text, grade, subject, ctx);
    }
  } catch (err) {
    return { result, routes, run: failure(err, text) };
  }
}

async function answer(result: IntentResult, routes: ChatRoute[], first: Step, task: string, text: string, grade: string | undefined, subject: string | undefined, ctx: Ctx): Promise<Reply> {
  const a = await chatAnswer({ task, text, history: turns(ctx.history), material_id: ctx.source?.id, grade, subject });
  routes[routes.length - 1] = a.route;
  const searched = a.grounded_on
    ? step("Searching your sources", `${a.grounded_on} passage${a.grounded_on === 1 ? "" : "s"} found${a.sources.length ? `, ${a.sources.length} used` : ", none needed"}.`)
    : step("Searching your sources", ctx.source ? `Nothing in ${ctx.source.title} matched, so this is from general knowledge.` : "No source in use, so this is from general knowledge.");
  return { result, routes, run: {
    steps: task === "smalltalk" ? [first] : [first, searched, step("Writing", describeRoute(a.route))],
    blocks: [...fromChat(a.blocks), ...sourcesBlock(a.sources), ...followups(a.followups)],
  } };
}

/* ── slides: plan, approve, write ── */

const TYPE_LABEL = (types: { type: string; label: string }[], t: string) => types.find((x) => x.type === t)?.label ?? t.replace(/_/g, " ");

async function planDeck(result: IntentResult, routes: ChatRoute[], first: Step, args: DeckArgs): Promise<Reply> {
  const out = await generateOutline(args);
  if (out.status === "needs_input") {
    const q = out.questions.find((x) => x.blocking) ?? out.questions[0];
    const ask: Ask = { question: q.ask, options: q.options ?? [], field: q.field, placeholder: "Type your answer" };
    return { result, routes, ask, run: { steps: [first], blocks: [{ t: "ask", ...ask }] } };
  }
  const ref = refs.put({ kind: "outline", params: args, outline: out, route: routes[routes.length - 1] });
  const slides: OutlineRow[] = out.outline.map((s) => ({ type: s.type, move: TYPE_LABEL(out.types, s.type), title: s.title, point: s.point }));
  return { result, routes, ref, run: {
    steps: [
      first,
      step("Searching your sources", out.context.grounded ? "Found passages in your material to build on." : "No matching material, so I'll write from general knowledge and say so."),
      step(`Planning ${slides.length} slides`, out.plannedBy === "draft" ? "Used Vivran's own lesson plan for this topic." : "One teaching move per slide, from the opener to a recap."),
    ],
    blocks: [
      { t: "text", text: `Here's the plan for **${out.context.topic}**${out.context.gradeLabel ? ` (${out.context.gradeLabel})` : ""} before I write anything. Rename or remove slides, then approve.` },
      { t: "outline", ref, slides },
    ],
  } };
}

async function writeDeck(ref: string, slides: OutlineRow[]): Promise<Reply> {
  const stored = refs.get(ref);
  const result: IntentResult = { intent: "slides", label: "Slides", confidence: 1, entities: {} };
  if (!stored || stored.kind !== "outline") return { result, routes: [], run: { steps: [], blocks: [{ t: "notice", tone: "error", text: "That plan is no longer in this browser. Ask for the slides again." }] } };
  try {
    const deck = await generateDeck({ ...stored.params, outline: slides.map((s) => ({ type: s.type, title: s.title, point: s.point })) });
    if (deck.status !== "ready") {
      const q = deck.questions[0];
      return { result, routes: [], run: { steps: [], blocks: [{ t: "notice", tone: "warn", text: q?.ask ?? "I need a little more before I can write this deck." }] } };
    }
    const dref = refs.put({ kind: "deck", deck });
    const g = deck.grounding;
    const ran: ChatRoute[] = stored.route ? [{ ...stored.route, ran_on: deck.model ? { model: deck.model, provider: deck.provider ?? "" } : undefined }] : [];
    return { result, routes: ran, run: {
      steps: [
        step(`Writing ${deck.quality.slides} slides`, "Following your approved outline."),
        step("Fitting every slide", deck.quality.copyFit.length ? `Tightened ${deck.quality.copyFit.length} slide${deck.quality.copyFit.length === 1 ? "" : "s"} so nothing overflows.` : "Measured with the deck's font: nothing overflows."),
        step("Linking sources", g.retrieved ? `${g.cited} of ${g.retrieved} passages cited on the slides.` : "No sources in use, so nothing is marked as cited."),
      ],
      blocks: [
        { t: "text", text: `Your deck on **${deck.context.topic}** is ready: ${deck.quality.slides} slides${g.cited ? `, citing ${g.cited} passage${g.cited === 1 ? "" : "s"} from your material` : ""}.${deck.libraryId ? " It's saved to your Library." : ""}` },
        { t: "artifact", kind: "deck", ref: dref, libraryId: deck.libraryId ?? undefined, title: deck.context.topic, meta: `${deck.quality.slides} slides · ${deck.context.gradeLabel}` },
        ...sourcesBlock(g.sources),
        { t: "followups", items: [`A 20-mark quiz on ${deck.context.topic}`, `A worksheet on ${deck.context.topic}`] },
      ],
    } };
  } catch (e) {
    return { result, routes: [], run: failure(e, `Slides on ${stored.params.topic}`) };
  }
}

/* ── papers: two choices, then write ── */

const DIFF: Record<string, string> = { "Mostly recall": "easy", Balanced: "medium", "Stretch the top of the class": "hard" };

async function setUpPaper(result: IntentResult, routes: ChatRoute[], first: Step, args: PaperArgs): Promise<Reply> {
  const usual = await getUsualSetup("assessment").then((r) => r.usual).catch(() => null);
  const ref = refs.put({ kind: "paperSetup", params: args, route: routes[routes.length - 1] });
  const questions = [{ q: "How hard should it be?", options: Object.keys(DIFF) }];
  if (!args.marks) questions.push({ q: "How many marks?", options: ["20 marks", "40 marks", "80 marks"] });
  return { result, routes, ref, run: {
    steps: [first, step("Checking your teaching memory", usual ? `Found your usual setup: ${usual.label}.` : "No usual paper format learned yet.")],
    blocks: [
      ...(usual ? [{ t: "memory", text: `Using your usual format: **${usual.label}**.`, why: usual.status === "active" ? "From your teaching memory." : "Suggested from your recent papers." } as Block] : []),
      { t: "text", text: `A paper on **${args.topic}**${args.marks ? `, ${args.marks} marks` : ""}. ${questions.length === 1 ? "One quick choice" : "Two quick choices"} before I write it:` },
      { t: "choices", submit: "Write the paper", resume: ref, questions },
    ],
  } };
}

async function writePaper(ref: string, choice: string, override?: Partial<PaperArgs>): Promise<Reply> {
  const result: IntentResult = { intent: "paper", label: "Exam paper", confidence: 1, entities: {} };
  const stored = refs.get(ref);
  if (!stored || (stored.kind !== "paperSetup" && stored.kind !== "paper")) return { result, routes: [], run: { steps: [], blocks: [{ t: "notice", tone: "error", text: "That request is no longer in this browser. Ask for the paper again." }] } };
  const parts = choice.split(" · ");
  const marks = Number(parts.find((p) => /marks$/.test(p))?.match(/\d+/)?.[0]) || stored.params.marks || 40;
  const p: PaperArgs = { ...stored.params, marks, difficulty: DIFF[parts[0]] ?? stored.params.difficulty, ...override };
  try {
    const data = await generateAssessmentPaper(p.grade, p.subject, [p.topic], p.marks, p.difficulty, p.materialId);
    const a = data.assessment as { title?: string; total_marks?: number; duration_minutes?: number; sections?: { questions: unknown[] }[] } | null;
    if (!a) return { result, routes: [], run: { steps: [], blocks: [{ t: "notice", tone: "error", text: "The paper didn't come back complete. Try again." }] } };
    const pref = refs.put({ kind: "paper", data, params: p, route: stored.route });
    const gen = (data as { generation?: { model?: string; provider?: string } }).generation;
    const n = (a.sections ?? []).reduce((x, s) => x + s.questions.length, 0);
    const errs = data.validation?.errors ?? [];
    const ran: ChatRoute[] = stored.route ? [{ ...stored.route, ran_on: gen?.model ? { model: gen.model, provider: gen.provider ?? "" } : undefined }] : [];
    return { result, routes: ran, run: {
      steps: [
        step("Fixing the structure", `Sections and marks set in code first, to total ${p.marks} exactly.`),
        step("Searching your sources", data.grounded_on ? `${data.grounded_on} passage${data.grounded_on === 1 ? "" : "s"} from your material.` : "No matching material, so questions are from general knowledge."),
        step(`Writing ${n} questions`, `${p.difficulty === "easy" ? "Mostly recall" : p.difficulty === "hard" ? "Stretching the top of the class" : "Balanced"}.`),
        step("Checking every question", errs.length ? `${errs.length} thing${errs.length === 1 ? "" : "s"} to look at.` : "Marks add up, and every answer is there."),
      ],
      blocks: [
        ...(data.style_applied?.length ? [{ t: "memory", text: `Set your way: ${data.style_applied.map((s) => s.summary).join("; ")}.`, why: "From the style traits you accepted in Teaching memory." } as Block] : []),
        { t: "text", text: `Your paper is ready: **${a.total_marks ?? p.marks} marks**, ${n} questions${a.duration_minutes ? `, ${a.duration_minutes} minutes` : ""}.${errs.length ? ` One thing to check: ${errs[0]}` : ""}${data.library_id ? " It's saved to your Library." : ""}` },
        { t: "artifact", kind: "paper", ref: pref, libraryId: data.library_id, title: a.title ?? p.topic, meta: `${a.total_marks ?? p.marks} marks · ${n} questions` },
        ...sourcesBlock(data.sources),
        { t: "followups", items: [`Slides on ${p.topic}`, `A worksheet on ${p.topic}`] },
      ],
    } };
  } catch (e) {
    return { result, routes: [], run: failure(e, `A ${p.marks}-mark paper on ${p.topic}`) };
  }
}

/* ── explain, worksheet, plan ── */

async function explain(result: IntentResult, routes: ChatRoute[], first: Step, topic: string, grade: string | undefined, subject: string | undefined, ctx: Ctx): Promise<Reply> {
  const ex = await generateExample({ concept: topic, grade, subject, materialId: ctx.source?.id, language: ctx.profile.language });
  return { result, routes, run: exampleRun(ex, first) };
}

export function exampleRun(ex: ExampleResult, first?: Step): Run {
  if (ex.error || !ex.analogy) return { steps: first ? [first] : [], blocks: [{ t: "notice", tone: "warn", text: ex.error || "I couldn't pin that idea down. Try naming it more exactly." }] };
  return {
    steps: [
      ...(first ? [first] : []),
      step("Searching your sources", ex.grounded_on ? `${ex.grounded_on} passage${ex.grounded_on === 1 ? "" : "s"} in your material.` : "Nothing in your material, so this is from general knowledge."),
      step("Building an analogy", "Checked that every key term maps to one thing in the story."),
    ],
    blocks: [
      { t: "text", text: `Here's a way into **${ex.concept?.concept ?? ex.title}** your class will remember.` },
      { t: "example", data: ex },
      ...(ex.guardrail_warnings?.length ? [{ t: "notice", tone: "warn", text: ex.guardrail_warnings[0] } as Block] : []),
      ...sourcesBlock(ex.sources),
    ],
  };
}

async function worksheet(result: IntentResult, routes: ChatRoute[], first: Step, topic: string, grade?: string, subject?: string): Promise<Reply> {
  const w = await generateWorksheet(topic, 10, grade, subject);
  return { result, routes, run: worksheetRun(w, first) };
}

export function worksheetRun(w: WorksheetResult, first?: Step): Run {
  if (w.error || !w.questions?.length) return { steps: first ? [first] : [], blocks: [{ t: "notice", tone: "warn", text: w.error || "The worksheet came back empty. Try again." }] };
  return {
    steps: [...(first ? [first] : []), step(`Writing ${w.questions.length} questions`, w.grounded_on ? `From ${w.grounded_on} passages of your material.` : "From general knowledge.")],
    blocks: [
      { t: "text", text: `**${w.title}**${w.instructions ? `. ${w.instructions}` : ""}` },
      { t: "bullets", title: "Questions", items: w.questions.map((q, i) => `${i + 1}. ${q.question_text}`) },
      { t: "table", data: { columns: ["#", "Answer"], rows: w.questions.map((q, i) => [String(i + 1), q.answer]), caption: "Answer key" } },
      ...sourcesBlock(w.sources),
    ],
  };
}

async function plan(result: IntentResult, routes: ChatRoute[], first: Step, text: string, topic: string, grade?: string, subject?: string): Promise<Reply> {
  const weeks = Number(text.match(/(\d{1,2})\s*weeks?/i)?.[1]) || 4;
  const r = await generateCoursePlan({ title: topic, grade: grade ?? "", subject: subject ?? "", topics: [topic], durationWeeks: Math.min(12, weeks) });
  return { result, routes, run: planRun(r.course_plan, first) };
}

export function planRun(p: CoursePlan, first?: Step): Run {
  if (p.error || !p.weekly_structure?.length) return { steps: first ? [first] : [], blocks: [{ t: "notice", tone: "warn", text: p.error || "The plan came back empty. Try again." }] };
  return {
    steps: [...(first ? [first] : []), step(`Spacing it over ${p.duration_weeks} weeks`, p.grounded_on ? `Built on ${p.grounded_on} passages of your material.` : "From general knowledge.")],
    blocks: [
      { t: "text", text: `**${p.title}**: ${p.duration_weeks} weeks${p.grade ? `, ${p.grade}` : ""}.` },
      { t: "table", data: { columns: ["Week", "Topic", "Lessons"], rows: p.weekly_structure.map((w) => [String(w.week), w.topic, w.lessons.join("; ")]) } },
      ...sourcesBlock(p.sources),
      { t: "followups", items: [`Slides for week 1: ${p.weekly_structure[0].topic}`] },
    ],
  };
}

/* ───────────────────────── quick actions ───────────────────────── */

export async function transform(msg: BotMsg, action: ActionId, history: Msg[]): Promise<{ run: Run; derived: string; routes: ChatRoute[] }> {
  const intent = msg.intent.intent;
  const lv = LEVELS[intent];
  const label = action === "simplify" ? lv?.simplify ?? "Simplified" : action === "elaborate" ? lv?.elaborate ?? "Elaborated" : ACTIONS[action].label;
  const derived = `${label} · from the answer above`;

  // A paper is made harder or easier by writing it again at that level.
  const paper = msg.run.blocks.find((b) => b.t === "artifact" && b.kind === "paper");
  if (intent === "paper" && paper?.t === "artifact" && (action === "simplify" || action === "elaborate")) {
    const r = await writePaper(paper.ref, "", { difficulty: action === "simplify" ? "easy" : "hard" });
    return { run: r.run, derived, routes: r.routes };
  }
  try {
    const t = await chatTransform({ action, answer: textOf(msg.run), request: msg.request, history: turns(history) });
    const sources = msg.run.blocks.filter((b) => b.t === "sources");
    return { derived, routes: [t.route], run: {
      steps: [step(ACTIONS[action].step, `Using the answer above. ${describeRoute(t.route)}`)],
      blocks: [...fromChat(t.blocks), ...sources],
    } };
  } catch (e) {
    return { derived, routes: [], run: failure(e, ACTIONS[action].label) };
  }
}

export async function improve(text: string, profile: Profile, intent?: Intent) {
  return chatImprove({ text, intent, grade: profile.grade, subject: profile.subject });
}

/* ───────────────────────── text of an answer ───────────────────────── */

/** Plain words for reading aloud, copying, and the quick actions. */
export function textOf(run: Run): string {
  return run.blocks.map((b) => {
    switch (b.t) {
      case "text": return b.text;
      case "bullets": return [b.title, ...b.items].filter(Boolean).join("\n");
      case "table": return [b.data.columns.join(" | "), ...b.data.rows.map((r) => r.join(" | "))].join("\n");
      case "example": {
        const a = b.data.analogy, c = b.data.concept;
        return [c?.one_line, a?.story, ...(a?.mapping ?? []).map((m) => `${m.term}: ${m.in_story}`), a?.where_it_breaks?.length ? `Where it breaks: ${a.where_it_breaks.join(" ")}` : ""].filter(Boolean).join("\n");
      }
      case "outline": return b.slides.map((s, i) => `${i + 1}. ${s.title}: ${s.point}`).join("\n");
      case "artifact": return `${b.title}, ${b.meta}.`;
      case "ask": return b.question;
      case "notice": return b.text;
      case "memory": return b.text;
      default: return "";
    }
  }).filter(Boolean).join("\n\n");
}

export const speakable = (run: Run) => textOf(run).replace(/\*\*|\[S\d+\]/g, "").replace(/\s+/g, " ").trim();

/* ───────────────────────── library items reopened as a chat ───────────────────────── */

export async function runFromLibrary(entry: LibraryEntry): Promise<{ intent: Intent; run: Run } | null> {
  const item = await getLibraryItem(entry.id);
  const c = item.content as Record<string, unknown> | null;
  if (!c) return null;
  if (entry.type === "slides") {
    const ref = refs.put({ kind: "deck", deck: { ...(c as unknown as DeckReady), libraryId: entry.id } });
    const d = c as unknown as DeckReady;
    return { intent: "slides", run: { steps: [], blocks: [{ t: "artifact", kind: "deck", ref, libraryId: entry.id, title: entry.title, meta: `${d.quality?.slides ?? d.placements?.length ?? ""} slides · ${d.context?.gradeLabel ?? ""}` }] } };
  }
  if (entry.type === "assessment") {
    const data = c as unknown as AssessmentGenerateResponse;
    const a = data.assessment as { total_marks?: number; sections?: { questions: unknown[] }[] } | null;
    const params = item.params as { topics?: string[]; grade?: string; subject?: string; total_marks?: number; difficulty?: string };
    const ref = refs.put({ kind: "paper", data, params: { topic: params.topics?.[0] ?? entry.title, grade: params.grade ?? "", subject: params.subject ?? "", marks: params.total_marks ?? a?.total_marks ?? 40, difficulty: params.difficulty ?? "medium" } });
    const n = (a?.sections ?? []).reduce((x, s) => x + s.questions.length, 0);
    return { intent: "paper", run: { steps: [], blocks: [{ t: "artifact", kind: "paper", ref, libraryId: entry.id, title: entry.title, meta: `${a?.total_marks ?? ""} marks · ${n} questions` }] } };
  }
  if (entry.type === "example") return { intent: "explain", run: exampleRun(c as unknown as ExampleResult) };
  if (entry.type === "worksheet") return { intent: "worksheet", run: worksheetRun(c as unknown as WorksheetResult) };
  if (entry.type === "course_plan") return { intent: "plan", run: planRun(c as unknown as CoursePlan) };
  return null;
}
