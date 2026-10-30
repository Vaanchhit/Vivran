// The beta chat's service layer. Every function here is one backend endpoint
// to be, run locally for now (sample content, browser storage), so the
// interface can be tried before the backend exists and won't change when it
// does. The intended endpoints:
//
//   Prompt Manager        getConfig()            GET    /api/chat/config
//                         starterPrompt()        (server-side template, by starter id)
//   Intent Classifier     classify()             POST   /api/chat/intent          (intent.ts)
//   Response Processor    respond()              POST   /api/chat/messages
//                         transform()            POST   /api/chat/messages/:id/actions
//   Conversation Manager  conversations.*        GET/POST/PATCH/DELETE /api/conversations[/:id]
//                         folders.*              GET/POST/PATCH/DELETE /api/folders[/:id]
//   Saved responses       saved.*                GET/POST/PATCH/DELETE /api/saved[/:id]   (table saved_responses)
//   Search Service        search()               GET    /api/conversations/search?q=&folder=&since=
//   Profile               onboarding.*           PATCH  /api/profile { onboarding_completed }
//   Voice                 voice.ts               browser speech now; POST /api/voice/stt, /api/voice/tts later
import { ACTIONS, COLLECTIONS, LEVELS, PROMPT_CARDS, STARTERS } from "./config";
import {
  CLASS_DATA, COMPARISONS, DECKS, EXPLANATIONS, PAPER, SOURCES, SOURCE_FILE, SUMMARY, WORKSHEET,
  explanationFor, ideasFor, planFor,
} from "./content";
import { classify, resume, titleFor, type Ask } from "./intent";
import type {
  ActionId, Block, BotMsg, Conversation, Digest, Folder, Intent, IntentResult, Msg, Run, Saved, TableData,
} from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

/* ───────────────────────── Prompt Manager ───────────────────────── */

export async function getConfig() {
  await new Promise((r) => setTimeout(r, 120)); // the shape of a fetch
  return { cards: PROMPT_CARDS, starters: STARTERS, collections: COLLECTIONS };
}

export function starterPrompt(starterId: string, input: string, source: string | null): string {
  const s = STARTERS.find((x) => x.id === starterId);
  if (!s) return input;
  const fill = input.trim() || (s.id === "summarise" && source ? "this PDF" : s.id === "analyse" ? "my class results from the last unit test" : "");
  return s.template.replace("{input}", fill).trim();
}

/* ───────────────────────── Response Processor ───────────────────────── */

export type Command = { kind: "writeDeck"; deck: string } | { kind: "writePaper" };
export interface Reply { result: IntentResult; run: Run; ask?: Ask }

const step = (label: string, detail: string, ms: number) => ({ label, detail, ms });

function genericDigest(run: Run): Digest {
  const text = run.blocks.flatMap((b) => (b.t === "text" ? [b.text] : b.t === "bullets" ? b.items : [])).join(" ").replace(/\*\*|\[S\d\]/g, "");
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 12);
  return {
    summary: sentences.slice(0, 3),
    simple: sentences[0] ?? text,
    more: sentences.slice(0, 5),
    examples: ["In the full product, examples come from your own material and are cited to the page."],
    table: { columns: ["Point", "Detail"], rows: sentences.slice(0, 4).map((s) => { const [a, ...b] = s.split(/:\s|,\s/); return [a, b.join(", ") || "—"]; }) },
  };
}

function deckRun(deckId: string, write: boolean): Run {
  const d = DECKS.find((x) => x.id === deckId) ?? DECKS[0];
  const french = d.id === "french-revolution";
  if (!write) return {
    steps: [
      step("Reading your request", `${d.level} · ${d.subject} · slides · about 40 minutes of teaching.`, 1000),
      step("Searching your sources", french ? `Found 5 passages in ${SOURCE_FILE}. Nothing padded.` : "No source attached for this topic, so I'll write from general knowledge and say so.", 1400),
      step("Choosing a lesson shape", `${d.template}: it suits how this topic is usually taught.`, 1100),
      step(`Planning ${d.slides.length} slides`, "One teaching move per slide, opening with the setting and closing on a recap.", 1000),
    ],
    blocks: [
      { t: "text", text: `Here's the plan before I write anything. I picked the **${d.template}** shape${french ? " because the unit moves through events in order [S1]" : ""}. Rename or remove slides, then approve.` },
      { t: "outline", deck: d.id, slides: d.slides },
      ...(french ? [{ t: "sources", items: SOURCES.slice(0, 3) } as Block] : []),
    ],
    digest: { summary: d.slides.slice(1, 4).map((s) => s.title), simple: `${d.slides.length} slides on ${d.title}, from the opener to a recap.`, more: d.slides.map((s) => `${s.move}: ${s.title}`), examples: [], table: { columns: ["#", "Move", "Slide"], rows: d.slides.map((s, i) => [String(i + 1), s.move, s.title]) } },
  };
  return {
    steps: [
      step(`Writing ${d.slides.length} slides`, "Following your approved outline exactly.", 1500),
      step("Fitting every slide", `Measured with the deck's real font: no text overflows at ${d.level} size.`, 1000),
      step("Linking sources", french ? "Every fact on a slide points back to a page of your PDF." : "No sources attached, so nothing is marked as cited.", 800),
    ],
    blocks: [
      { t: "text", text: french ? "Your deck is ready. The Tennis Court Oath slide quotes your textbook directly [S2], and the rights on slide 6 come from page 12 [S3]. The discussion slide has no single right answer, so I left it as a question for the class." : `Your deck on **${d.title}** is ready: ${d.slides.length} slides in the ${d.template} shape, with a quick check before the recap.` },
      { t: "artifact", kind: "deck", deck: d.id, title: d.title, meta: `${d.slides.length} slides · ${d.level} · ${d.template}` },
      ...(french ? [{ t: "sources", items: SOURCES.slice(0, 3) } as Block] : []),
      { t: "followups", items: french ? ["Make a 40-mark test from this unit", "Explain the Reign of Terror simply", "Give me lesson ideas for the French Revolution"] : ["Make a worksheet for this", "Give me lesson ideas for this topic"] },
    ],
    digest: { summary: [`${d.slides.length} slides, ${d.template} shape.`, `Opens on "${d.slides[0].title}", closes on "${d.slides[d.slides.length - 1].title}".`, "PowerPoint download ready."], simple: `Slides on ${d.title}, ready to teach.`, more: d.slides.map((s) => `${s.move}: ${s.title}`), examples: [], table: { columns: ["#", "Move", "Slide"], rows: d.slides.map((s, i) => [String(i + 1), s.move, s.title]) } },
  };
}

function paperRun(write: boolean): Run {
  const qs = PAPER.sections.flatMap((s) => s.qs.map((q) => q.q));
  const digest: Digest = { summary: ["40 marks in four sections.", "17 of 18 questions cite Unit 4.", "Question 14 is flagged for review."], simple: "A 40-mark Class 9 test on the French Revolution.", more: PAPER.sections.map((s) => `${s.name}: ${s.rule}`), examples: qs.slice(0, 3), table: { columns: ["Section", "Marks", "Questions"], rows: PAPER.sections.map((s) => [s.name, s.rule, String(s.qs.length)]) } };
  if (!write) return {
    steps: [step("Reading your request", "A unit test, Class 9 History.", 900), step("Checking your teaching memory", "6 of your 8 recent History papers use the same shape.", 1100)],
    blocks: [
      { t: "memory", text: "Using your usual History format: **4 sections · 40 marks · 90 minutes**, ending with a source-based question.", why: "Learned from 6 of your 8 recent papers. You accepted this in Teaching memory." },
      { t: "text", text: "Two quick choices before I write it:" },
      { t: "choices", submit: "Write the paper", resume: "writePaper", questions: [
        { q: "How hard should it be?", options: ["Mostly recall", "Balanced", "Stretch the top of the class"] },
        { q: "Include an answer key?", options: ["Yes, with marking scheme", "Answers only", "No"] },
      ] },
    ],
  };
  return {
    steps: [
      step("Fixing the structure", "Sections and marks set in code first: 8 + 12 + 10 + 10 = 40, exactly.", 1000),
      step("Searching your sources", "7 passages across 2 files.", 1200),
      step("Writing 18 questions", "Balanced thinking: 45% recall, 35% understanding, 20% higher order.", 1500),
      step("Checking every question", "Marks add up, no repeats, each answer cites a page. 1 needs your eye.", 900),
    ],
    blocks: [
      { t: "text", text: "Your paper is ready: 40 marks in your usual four sections. 17 of 18 questions point back to a page of your material. **One doesn't**: question 14 asks about the Napoleonic Code, which isn't in Unit 4, so I've flagged it rather than hidden it." },
      { t: "artifact", kind: "paper", title: PAPER.title, meta: "40 marks · 90 minutes · 18 questions" },
      { t: "sources", items: SOURCES },
      { t: "followups", items: ["Replace question 14", "Make slides for this unit"] },
    ],
    digest,
  };
}

export function respond(text: string, ctx: { source: string | null; forced?: Intent; command?: Command }): Reply {
  if (ctx.command?.kind === "writeDeck") return { result: { intent: "slides", label: "Slides", confidence: 1, entities: { deck: ctx.command.deck } }, run: deckRun(ctx.command.deck, true) };
  if (ctx.command?.kind === "writePaper") return { result: { intent: "paper", label: "Exam paper", confidence: 1, entities: {} }, run: paperRun(true) };

  const { result, ask } = classify(text, ctx);
  const e = result.entities;
  if (ask) {
    return { result, ask, run: {
      steps: [step("Reading your request", `Looks like: ${result.label.toLowerCase()}. One detail is missing, so I'll ask rather than guess.`, 900)],
      blocks: [{ t: "ask", question: ask.question, options: ask.options, field: ask.field, placeholder: ask.placeholder }],
    } };
  }

  switch (result.intent) {
    case "slides": return { result, run: deckRun(e.deck ?? DECKS[0].id, false) };
    case "paper": return { result, run: paperRun(false) };
    case "explain": {
      const ex = explanationFor(text) ?? null;
      const key = ex ? Object.keys(EXPLANATIONS).find((k) => EXPLANATIONS[k] === ex)! : "";
      if (!ex) return { result, run: {
        steps: [step("Finding the idea", `"${e.topic}"`, 900)],
        blocks: [{ t: "text", text: `In this preview I have sample explanations for the Reign of Terror, inflation, compound interest and photosynthesis. In the full product, **${e.topic}** would be explained from your own material, with an analogy, how it maps, and where it breaks.` },
          { t: "followups", items: ["Explain inflation simply", "Explain compound interest simply"] }],
      } };
      return { result, run: {
        steps: [step("Finding the idea", `${ex.name}, as your material describes it.`, 900), step("Searching your sources", key === "terror" ? `3 passages in ${SOURCE_FILE}.` : "No source attached for this, so it's written from general knowledge.", 1100), step("Building an analogy", "Checking that every key term maps to one thing in the story.", 1300)],
        blocks: [{ t: "text", text: key === "terror" ? "Here's a way into it for Class 9, written from your textbook's own definition [S3]." : `Here's a way into **${ex.name}** your class will remember.` }, { t: "explain", topic: key }],
        digest: ex.digest,
      } };
    }
    case "summarise": {
      const doc = e.doc ?? ctx.source ?? SOURCE_FILE;
      const known = doc === SOURCE_FILE || /unit 4|french/i.test(doc);
      if (/term 1/i.test(doc)) return { result, run: {
        steps: [step("Reading the paper", "Term 1 History paper.docx · 4 sections.", 1100)],
        blocks: [{ t: "bullets", title: "Term 1 History paper", items: ["40 marks, 90 minutes, 4 sections.", "Ends with a source-based question worth 10 marks.", "Mostly recall in Section A; reasoning in Section C.", "This is the format Vivran learned as your usual one."] }],
      } };
      return { result, run: {
        steps: [step("Reading the document", known ? `${SOURCE_FILE} · 18 pages.` : `${doc}`, 1100), step("Picking what matters", "The causes, the turning points and the terms students need.", 1200)],
        blocks: known
          ? [{ t: "text", text: "Here's Unit 4 in five points, each linked to its page:" }, { t: "bullets", items: SUMMARY.bullets }, { t: "table", data: SUMMARY.terms }, { t: "sources", items: SOURCES.slice(0, 3) }]
          : [{ t: "text", text: `In this beta, newly attached files aren't read yet, so I can't summarise **${doc}**. Here's how a summary looks, using Unit 4:` }, { t: "bullets", items: SUMMARY.bullets.slice(0, 3) }],
        digest: SUMMARY.digest,
      } };
    }
    case "compare": {
      const pair = `${e.items?.[0]} ${e.items?.[1]}`;
      const c = COMPARISONS.find((x) => x.keys.test(pair));
      if (c) return { result, run: {
        steps: [step("Lining them up", c.title, 900), step("Choosing what to compare", "Who, what they wanted, what happened to them.", 1100)],
        blocks: [{ t: "text", text: `**${c.title}**, side by side:` }, { t: "table", data: c.table }, { t: "text", text: c.takeaway }],
        digest: c.digest,
      } };
      const [a, b] = e.items ?? ["A", "B"];
      const table: TableData = { columns: ["", a, b], rows: [["What it is", "…", "…"], ["Key feature", "…", "…"], ["An example", "…", "…"], ["Why it matters", "…", "…"]] };
      return { result, run: {
        steps: [step("Lining them up", `${a} and ${b}`, 900)],
        blocks: [{ t: "text", text: `This preview has sample comparisons for a few pairs only. For **${a}** and **${b}**, the full product fills a table like this from your sources:` }, { t: "table", data: table }, { t: "followups", items: ["Compare mitosis and meiosis", "Compare monarchy and republic"] }],
      } };
    }
    case "plan": return { result, run: {
      steps: [step("Reading your request", `A unit plan${e.topic ? ` on ${e.topic}` : ""}.`, 900), step("Spacing it out", "Four weeks: hook, causes, events, why it matters.", 1100)],
      blocks: [{ t: "text", text: "A four-week plan, with a check at the end of each week:" }, { t: "table", data: planFor(e.topic ?? "") }, { t: "followups", items: ["Make slides for week 1", "A 40-mark unit test on the French Revolution"] }],
      digest: { summary: ["Four weeks.", "Hook, causes, events, why it matters.", "A check every week, a test at the end."], simple: "One month: start with a story, then causes, then events, then why it still matters.", more: planFor(e.topic ?? "").rows.map((r) => `Week ${r[0]}: ${r[1]}. ${r[2]}.`), examples: ideasFor(e.topic ?? "").slice(0, 3), table: planFor(e.topic ?? "") },
    } };
    case "ideas": {
      const items = ideasFor(e.topic ?? "");
      return { result, run: {
        steps: [step("Thinking about your class", e.topic ? `Ways in to ${e.topic}.` : "Ways in to this topic.", 1000)],
        blocks: [{ t: "text", text: "Six ideas, from a two-minute opener to an exit ticket:" }, { t: "bullets", items }],
        digest: { summary: items.slice(0, 3), simple: items[0], more: items, examples: items.slice(3), table: { columns: ["Idea", "Time"], rows: items.map((x, i) => [x, ["2 min", "5 min", "15 min", "10 min", "10 min", "3 min"][i]]) } },
      } };
    }
    case "analyse": return { result, run: {
      steps: [step("Reading the results", "Last unit test · 3 sections · 112 students.", 1000), step("Looking for gaps", "Comparing sections question by question.", 1200)],
      blocks: [{ t: "table", data: CLASS_DATA.table }, { t: "bullets", title: "What stands out", items: CLASS_DATA.insights }, { t: "followups", items: ["Explain the Reign of Terror simply", "Give me lesson ideas for the French Revolution"] }],
      digest: { summary: CLASS_DATA.insights, simple: "9B needs help with the Reign of Terror; everyone needs practice with sources.", more: CLASS_DATA.insights, examples: [], table: CLASS_DATA.table },
    } };
    case "worksheet": return { result, run: {
      steps: [step("Reading your request", "A worksheet, Class 9 History.", 900), step("Mixing question types", "Fill-ins, matching, ordering, a source.", 1100)],
      blocks: [{ t: "text", text: "A one-page worksheet on Unit 4, easiest first:" }, { t: "bullets", items: WORKSHEET }, { t: "followups", items: ["A 40-mark unit test on the French Revolution"] }],
    } };
    default:
      if (/replace question\s*14/i.test(text)) return { result: { ...result, label: "Exam paper" }, run: {
        steps: [step("Finding a replacement", "A 5-mark question that Unit 4 actually covers.", 1100)],
        blocks: [{ t: "text", text: "Replaced question 14 with one your chapter covers: **How did the Jacobin government try to control prices in 1793, and why?** (5 marks) It's backed by page 16 of Unit 4. All 18 questions now cite your material." }],
      } };
      return { result, run: {
      steps: [step("Reading your request", "Not sure yet what you'd like, so I'll offer rather than guess.", 800)],
      blocks: [{ t: "text", text: "Happy to help. Here are a few things I can do with **Unit 4 · The French Revolution**:" }, { t: "followups", items: ["Slides for tomorrow's class", "A 40-mark unit test on the French Revolution", "Explain the Reign of Terror simply", "Summarise this PDF"] }],
    } };
  }
}

export function transform(msg: BotMsg, action: ActionId): { run: Run; derived: string } {
  const d = msg.run.digest ?? genericDigest(msg.run);
  const intent = msg.intent.intent;
  const lv = LEVELS[intent];
  const label = action === "simplify" ? lv?.simplify ?? "Simplified" : action === "elaborate" ? lv?.elaborate ?? "Elaborated" : ACTIONS[action].label;
  const steps = [step(ACTIONS[action].step, "Using the answer above and the rest of this conversation.", 900)];
  let blocks: Block[];
  if (intent === "paper" && (action === "simplify" || action === "elaborate")) {
    blocks = action === "simplify"
      ? [{ t: "text", text: "Made easier, same 40 marks: questions 13 and 14 now ask students to **describe** rather than **evaluate**, and Section D gives the extract with two guiding questions." }, { t: "artifact", kind: "paper", title: PAPER.title, meta: "40 marks · easier version" }]
      : [{ t: "text", text: "Made harder, same 40 marks: Section B questions now ask **why**, not **what**, and Section C asks students to weigh two causes against each other." }, { t: "artifact", kind: "paper", title: PAPER.title, meta: "40 marks · harder version" }];
  } else {
    switch (action) {
      case "summarise": blocks = [{ t: "bullets", title: "In short", items: d.summary }]; break;
      case "further": blocks = [{ t: "text", text: "One level deeper:" }, { t: "bullets", items: d.more }]; break;
      case "examples": blocks = [{ t: "bullets", title: "Examples", items: d.examples.length ? d.examples : ["Examples come from your own material in the full product."] }]; break;
      case "bullets": blocks = [{ t: "bullets", items: [...d.summary, ...d.more.slice(d.summary.length)].slice(0, 6) }]; break;
      case "table": blocks = [{ t: "table", data: d.table }]; break;
      case "simplify": blocks = [{ t: "text", text: d.simple }]; break;
      case "elaborate": blocks = [{ t: "text", text: "With more detail, for stronger students:" }, { t: "bullets", items: d.more }]; break;
    }
  }
  return { run: { steps, blocks, digest: d }, derived: `${label} · from the answer above` };
}

/** Plain words for reading an answer aloud. */
export function speakable(run: Run): string {
  return run.blocks.map((b) => {
    if (b.t === "text") return b.text;
    if (b.t === "bullets") return [b.title, ...b.items].filter(Boolean).join(". ");
    if (b.t === "explain") { const x = EXPLANATIONS[b.topic]; return x ? `${x.idea} It's like this: ${x.like} Where it breaks: ${x.breaks}` : ""; }
    if (b.t === "table") return b.data.caption ?? "";
    if (b.t === "artifact") return `${b.title}, ${b.meta}.`;
    if (b.t === "ask") return b.question;
    return "";
  }).join(" ").replace(/\*\*|\[S\d\]/g, "").replace(/\s+/g, " ").trim();
}

export { resume, titleFor };

/* ───────────────────────── storage (stands in for Postgres) ───────────────────────── */

interface DB { conversations: Conversation[]; folders: Folder[]; saved: Saved[]; onboarding_completed: boolean; prefs: { autoRead: boolean } }
const KEY = "vivran_beta_v2";
let db: DB | null = null;

function done(run: Run, result: IntentResult, derived?: string): BotMsg {
  const took = run.steps.reduce((a, s) => a + s.ms, 0) + run.blocks.length * 450;
  return { id: uid(), role: "assistant", run, intent: result, step: run.steps.length, shown: run.blocks.length, live: false, startedAt: 0, tookMs: took, derived };
}

function seed(): DB {
  const now = Date.now(), day = 86400000;
  const f1: Folder = { id: "f-c9", name: "Class 9 · History" };
  const conv = (title: string, msgs: Msg[], ago: number, folderId: string | null, pinned = false): Conversation => ({ id: uid(), title, folderId, pinned, createdAt: now - ago, updatedAt: now - ago, messages: msgs });
  const u = (text: string): Msg => ({ id: uid(), role: "user", text });

  const s1 = respond("Slides on the French Revolution for my Class 9", { source: SOURCE_FILE });
  const s2 = respond("", { source: SOURCE_FILE, command: { kind: "writeDeck", deck: "french-revolution" } });
  const p1 = respond("A 40-mark unit test on the French Revolution", { source: SOURCE_FILE });
  const p2 = respond("", { source: SOURCE_FILE, command: { kind: "writePaper" } });
  const e1 = respond("Explain inflation simply for Class 9", { source: SOURCE_FILE });
  const e1m = done(e1.run, e1.result);
  const e2 = transform(e1m, "simplify");
  const c1 = respond("Compare Girondins and Jacobins", { source: SOURCE_FILE });

  const deck = conv("Slides · The French Revolution", [u("Slides on the French Revolution for my Class 9"), done(s1.run, s1.result), u("Approved. Write the deck."), done(s2.run, s2.result)], 2 * 3600000, f1.id, true);
  const paper = conv("Exam paper · The French Revolution", [u("A 40-mark unit test on the French Revolution"), done(p1.run, p1.result), u("Balanced · Yes, with marking scheme"), done(p2.run, p2.result)], day, f1.id);
  const infl: Conversation = conv("Explanation · Inflation", [u("Explain inflation simply for Class 9"), e1m, done(e2.run, e1.result, e2.derived)], 4 * day, null);
  const comp = conv("Compare: Girondins vs Jacobins", [u("Compare Girondins and Jacobins"), done(c1.run, c1.result)], 12 * day, null);
  const saved: Saved = { id: uid(), messageId: e1m.id, conversationId: infl.id, savedAt: now - 4 * day, collection: "Lessons", note: "Use the samosa example on Monday", title: "Explanation · Inflation", excerpt: EXPLANATIONS.inflation.idea, intent: "explain" };
  return { conversations: [deck, paper, infl, comp], folders: [f1], saved: [saved], onboarding_completed: false, prefs: { autoRead: false } };
}

function load(): DB {
  if (db) return db;
  try { const raw = localStorage.getItem(KEY); if (raw) { db = JSON.parse(raw) as DB; return db; } } catch { /* private mode */ }
  db = seed(); persist(); return db;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ } }

export const conversations = {
  list: () => load().conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt),
  get: (id: string) => load().conversations.find((c) => c.id === id) ?? null,
  create: (title: string): Conversation => { const c: Conversation = { id: uid(), title, folderId: null, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), messages: [] }; load().conversations.push(c); persist(); return c; },
  save: (id: string, patch: Partial<Conversation>) => { const c = load().conversations.find((x) => x.id === id); if (c) { Object.assign(c, patch); if (patch.messages) c.updatedAt = Date.now(); persist(); } },
  remove: (id: string) => { const d = load(); d.conversations = d.conversations.filter((c) => c.id !== id); d.saved = d.saved.filter((s) => s.conversationId !== id); persist(); },
};

export const folders = {
  list: () => load().folders,
  create: (name: string): Folder => { const f = { id: uid(), name }; load().folders.push(f); persist(); return f; },
  rename: (id: string, name: string) => { const f = load().folders.find((x) => x.id === id); if (f) { f.name = name; persist(); } },
  remove: (id: string) => { const d = load(); d.folders = d.folders.filter((f) => f.id !== id); d.conversations.forEach((c) => { if (c.folderId === id) c.folderId = null; }); persist(); },
};

export const saved = {
  list: () => load().saved.slice().sort((a, b) => b.savedAt - a.savedAt),
  isSaved: (messageId: string) => load().saved.some((s) => s.messageId === messageId),
  add: (s: Omit<Saved, "id" | "savedAt">) => { load().saved.push({ ...s, id: uid(), savedAt: Date.now() }); persist(); },
  update: (id: string, patch: Partial<Pick<Saved, "note" | "collection">>) => { const s = load().saved.find((x) => x.id === id); if (s) { Object.assign(s, patch); persist(); } },
  remove: (messageId: string) => { const d = load(); d.saved = d.saved.filter((s) => s.messageId !== messageId); persist(); },
};

export const onboarding = {
  completed: () => load().onboarding_completed,
  complete: () => { load().onboarding_completed = true; persist(); },
  reset: () => { load().onboarding_completed = false; persist(); },
};

export const prefs = {
  get: () => load().prefs,
  set: (p: Partial<DB["prefs"]>) => { Object.assign(load().prefs, p); persist(); },
};

/** Keyword search over titles and everything said. Semantic search would add embeddings here. */
export function search(q: string, f: { folderId?: string | null; since?: "today" | "week" | "older" | "all" }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const now = Date.now(), day = 86400000;
  return conversations.list().filter((c) => {
    if (f.folderId !== undefined && f.folderId !== null && c.folderId !== f.folderId) return false;
    const age = now - c.updatedAt;
    if (f.since === "today" && age > day) return false;
    if (f.since === "week" && age > 7 * day) return false;
    if (f.since === "older" && age <= 7 * day) return false;
    if (!words.length) return true;
    const hay = (c.title + " " + c.messages.map((m) => (m.role === "user" ? m.text : speakable(m.run))).join(" ")).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function resetAll() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } db = null; load(); }
