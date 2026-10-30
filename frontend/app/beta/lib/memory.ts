// My sources, the Library and Teaching memory. Sample files and patterns stand
// in for GET /api/sources and GET /api/memory; the Library and the memory graph
// are derived live from the conversations in api.ts, so anything made in a
// chat shows up in both.
import type { BotMsg, Conversation, Intent, Saved } from "./types";
import { DECKS, SOURCE_FILE } from "./content";

/* ───────────────────────── classes and topics ───────────────────────── */

export const CLASSES = [
  { id: "c-9h", name: "Class 9 · History" },
  { id: "c-9e", name: "Class 9 · Economics" },
  { id: "c-8m", name: "Class 8 · Maths" },
  { id: "c-7s", name: "Class 7 · Science" },
  { id: "c-11b", name: "Class 11 · Biology" },
  { id: "c-11e", name: "Class 11 · Economics" },
  { id: "c-bca", name: "BCA Year 1 · Computer Science" },
];

export const TOPICS: { id: string; name: string; cls: string; parent?: string; re: RegExp }[] = [
  { id: "t-fr", name: "The French Revolution", cls: "c-9h", re: /french revolution/i },
  { id: "t-estates", name: "The three estates", cls: "c-9h", parent: "t-fr", re: /estate/i },
  { id: "t-terror", name: "The Reign of Terror", cls: "c-9h", parent: "t-fr", re: /terror|robespierre/i },
  { id: "t-jac", name: "Girondins and Jacobins", cls: "c-9h", parent: "t-fr", re: /girondin|jacobin/i },
  { id: "t-rights", name: "Rights of Man", cls: "c-9h", parent: "t-fr", re: /rights of man|declaration/i },
  { id: "t-infl", name: "Inflation", cls: "c-9e", re: /inflation/i },
  { id: "t-ci", name: "Compound interest", cls: "c-8m", re: /compound interest/i },
  { id: "t-photo", name: "Photosynthesis", cls: "c-7s", re: /photosynth/i },
  { id: "t-mit", name: "Mitosis and meiosis", cls: "c-11b", re: /mitosis|meiosis/i },
  { id: "t-ds", name: "Demand and supply", cls: "c-11e", re: /demand|supply/i },
  { id: "t-loops", name: "for loops", cls: "c-bca", re: /\bloops?\b|python/i },
];

const topicsIn = (text: string) => {
  const hits = TOPICS.filter((t) => t.re.test(text));
  // A subtopic hit is more specific than its parent, so drop the parent.
  return hits.filter((t) => !hits.some((h) => h.parent === t.id)).map((t) => t.id);
};

/* ───────────────────────── My sources ───────────────────────── */

export interface SourceFile {
  id: string; name: string; kind: "PDF" | "Word" | "PowerPoint" | "YouTube";
  cls: string; added: string; size: string;
  facts: number | null;        // passages indexed for answering
  style: string | null;        // what it teaches about how you write, if anything
  topics: string[];
}

export const SOURCE_FILES: SourceFile[] = [
  { id: "s-unit4", name: SOURCE_FILE, kind: "PDF", cls: "c-9h", added: "2 days ago", size: "24 pages", facts: 86, style: null, topics: ["t-fr", "t-estates", "t-rights", "t-terror"] },
  { id: "s-term1", name: "Term 1 History paper.docx", kind: "Word", cls: "c-9h", added: "3 weeks ago", size: "6 pages", facts: 22, style: "Exam paper", topics: ["t-fr"] },
  { id: "s-rev25", name: "Unit test · Revolutions 2025.docx", kind: "Word", cls: "c-9h", added: "3 weeks ago", size: "4 pages", facts: 15, style: "Exam paper", topics: ["t-fr", "t-terror"] },
  { id: "s-half", name: "Half-yearly History 2025.pdf", kind: "PDF", cls: "c-9h", added: "1 month ago", size: "8 pages", facts: 27, style: "Exam paper", topics: ["t-fr", "t-jac"] },
  { id: "s-syl", name: "Class 9 History syllabus 2026.pdf", kind: "PDF", cls: "c-9h", added: "1 month ago", size: "12 pages", facts: 31, style: null, topics: ["t-fr"] },
  { id: "s-yt", name: "Inflation, explained (YouTube lecture)", kind: "YouTube", cls: "c-9e", added: "1 week ago", size: "14 min", facts: 18, style: null, topics: ["t-infl"] },
  { id: "s-ncert", name: "NCERT Class 7 Science · Chapter 1.pdf", kind: "PDF", cls: "c-7s", added: "2 weeks ago", size: "16 pages", facts: 40, style: null, topics: ["t-photo"] },
  { id: "s-cell", name: "Cell division notes.pptx", kind: "PowerPoint", cls: "c-11b", added: "1 month ago", size: "18 slides", facts: 24, style: "Slides", topics: ["t-mit"] },
];

/* ───────────────────────── learned patterns ───────────────────────── */

export interface Pattern { id: string; name: string; detail: string; evidence: string; status: "In use" | "To review"; from: string[]; applies: Intent[] }

export const PATTERNS: Pattern[] = [
  { id: "p-paper", name: "Your History paper format", detail: "4 sections · 40 marks · 90 minutes, ending with a source-based question.", evidence: "Seen in 6 of your 8 recent papers", status: "In use", from: ["s-term1", "s-rev25", "s-half"], applies: ["paper"] },
  { id: "p-local", name: "Everyday Indian examples", detail: "You explain with samosas, cricket and train fares before giving the definition.", evidence: "From 5 explanations you kept", status: "In use", from: [], applies: ["explain"] },
  { id: "p-recap", name: "Opens with a recap question", detail: "Your decks start by asking what the class remembers from last lesson.", evidence: "Seen in 4 of your decks", status: "To review", from: ["s-cell"], applies: ["slides"] },
];

/* ───────────────────────── Library ───────────────────────── */

export type ItemKind = "Slides" | "Paper" | "Worksheet" | "Explanation" | "Comparison" | "Plan" | "Ideas" | "Summary" | "Analysis" | "Chat";

const KIND_FOR: Record<Intent, ItemKind> = {
  slides: "Slides", paper: "Paper", worksheet: "Worksheet", explain: "Explanation", compare: "Comparison",
  plan: "Plan", ideas: "Ideas", summarise: "Summary", analyse: "Analysis", general: "Chat",
};

export interface LibraryItem {
  id: string; title: string; kind: ItemKind; cls: string | null; topics: string[];
  when: number; deck?: string; conversationId?: string; sources: string[]; patterns: string[];
  note?: string;
  prompt?: string;         // reopens an item made before chats existed
}

const DAY = 86400000;
/** Made before this preview's chats existed: the rest of the sample decks, and a couple of others. */
const EARLIER: Omit<LibraryItem, "when">[] = [
  ...DECKS.filter((d) => d.id !== "french-revolution").map((d) => {
    const t = TOPICS.find((x) => x.re.test(d.title));
    return { id: `l-${d.id}`, title: d.title, kind: "Slides" as const, cls: t?.cls ?? null, topics: t ? [t.id] : [], deck: d.id,
      sources: d.id === "photosynthesis" ? ["s-ncert"] : d.id === "mitosis-meiosis" ? ["s-cell"] : [], patterns: d.id === "mitosis-meiosis" ? ["p-recap"] : [] };
  }),
  { id: "l-ws", title: "Worksheet · The French Revolution", kind: "Worksheet", cls: "c-9h", topics: ["t-fr", "t-estates"], sources: ["s-unit4"], patterns: [], prompt: "A worksheet on the French Revolution" },
  { id: "l-ci", title: "Explanation · Compound interest", kind: "Explanation", cls: "c-8m", topics: ["t-ci"], sources: [], patterns: ["p-local"], prompt: "Explain compound interest simply" },
  { id: "l-terror", title: "Discussion · Was the Terror necessary?", kind: "Ideas", cls: "c-9h", topics: ["t-terror"], sources: ["s-unit4"], patterns: [], prompt: "Give me lesson ideas for the Reign of Terror" },
];
const EARLIER_AGE = [9, 15, 21, 30, 6, 18, 11];

export function library(convs: Conversation[], saved: Saved[]): LibraryItem[] {
  const fromChats = convs.map((c): LibraryItem => {
    const bots = c.messages.filter((m): m is BotMsg => m.role === "assistant");
    const main = bots.find((b) => b.intent.intent !== "general") ?? bots[0];
    const intent = main?.intent.intent ?? "general";
    const deck = bots.flatMap((b) => b.run.blocks).find((b) => b.t === "artifact" && b.deck);
    const text = [c.title, ...c.messages.map((m) => (m.role === "user" ? m.text : m.intent.entities.topic ?? ""))].join(" ");
    const topics = topicsIn(text);
    const cited = bots.some((b) => b.run.blocks.some((x) => x.t === "sources"));
    const note = saved.find((s) => s.conversationId === c.id)?.note;
    return {
      id: c.id, title: c.title, kind: KIND_FOR[intent], cls: topics.length ? TOPICS.find((t) => t.id === topics[0])!.cls : null, topics,
      when: c.updatedAt, deck: deck && deck.t === "artifact" ? deck.deck : undefined, conversationId: c.id,
      sources: cited || intent === "summarise" ? ["s-unit4"] : [],
      patterns: PATTERNS.filter((p) => p.applies.includes(intent) && (intent !== "paper" || topics.some((t) => TOPICS.find((x) => x.id === t)?.cls === "c-9h"))).map((p) => p.id),
      note: note || undefined,
    };
  });
  const now = Date.now();
  return [...fromChats, ...EARLIER.map((e, i) => ({ ...e, when: now - EARLIER_AGE[i % EARLIER_AGE.length] * DAY }))].sort((a, b) => b.when - a.when);
}

/* ───────────────────────── the memory graph ───────────────────────── */

export type NodeKind = "you" | "class" | "topic" | "source" | "made" | "pattern";
export interface GNode { id: string; kind: NodeKind; label: string; sub: string; ref?: LibraryItem | SourceFile | Pattern }
export interface GEdge { a: string; b: string }

export const KIND_ONE: Record<NodeKind, string> = { you: "You", class: "Class", topic: "Topic", source: "Source", made: "Made", pattern: "Learned pattern" };
export const KIND_LABEL: Record<NodeKind, string> = { you: "You", class: "Classes", topic: "Topics", source: "Sources", made: "Things you made", pattern: "Learned patterns" };

export function memoryGraph(items: LibraryItem[]): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  const link = (a: string, b: string) => { if (seen.has(a) && seen.has(b) && a !== b) edges.push({ a, b }); };

  const used = new Set<string>([...items.flatMap((i) => i.topics), ...SOURCE_FILES.flatMap((s) => s.topics)]);
  TOPICS.forEach((t) => { if (t.parent && used.has(t.id)) used.add(t.parent); });
  const classes = new Set(TOPICS.filter((t) => used.has(t.id)).map((t) => t.cls));

  // The teacher sits at the centre, so every class hangs off one hub.
  add({ id: "me", kind: "you", label: "Ms. Anjali Rao", sub: "Your teaching" });
  CLASSES.filter((c) => classes.has(c.id)).forEach((c) => { add({ id: c.id, kind: "class", label: c.name, sub: "Class" }); link(c.id, "me"); });
  TOPICS.filter((t) => used.has(t.id)).forEach((t) => {
    add({ id: t.id, kind: "topic", label: t.name, sub: CLASSES.find((c) => c.id === t.cls)?.name ?? "Topic" });
    link(t.id, t.parent ?? t.cls);
  });
  SOURCE_FILES.forEach((s) => { add({ id: s.id, kind: "source", label: s.name, sub: `${s.kind} · ${s.size}`, ref: s }); s.topics.forEach((t) => link(s.id, t)); });
  PATTERNS.forEach((p) => { add({ id: p.id, kind: "pattern", label: p.name, sub: p.status, ref: p }); p.from.forEach((s) => link(p.id, s)); });
  items.forEach((i) => {
    add({ id: i.id, kind: "made", label: i.title, sub: i.kind, ref: i });
    if (i.topics.length) i.topics.forEach((t) => link(i.id, t)); else if (i.cls) link(i.id, i.cls);
    i.sources.forEach((s) => link(i.id, s));
    i.patterns.forEach((p) => link(i.id, p));
  });
  return { nodes, edges };
}

/* ───────────────────────── Obsidian export ───────────────────────── */

const safe = (s: string) => s.replace(/\s*·\s*/g, " - ").replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim();
const FOLDER: Record<NodeKind, string> = { you: "", class: "Classes", topic: "Topics", source: "Sources", made: "Made", pattern: "Patterns" };
const TAG: Record<NodeKind, string> = { you: "you", class: "class", topic: "topic", source: "source", made: "made", pattern: "pattern" };
// Obsidian stores graph colours as 0xRRGGBB integers.
const OB_COLOURS: Record<NodeKind, number> = { you: 0xf4efe7, class: 0x6b5d52, topic: 0xd2552a, source: 0x2f9e80, made: 0xd09a2c, pattern: 0x7471e0 };

/** One markdown note per node, linked with [[wikilinks]], plus a graph.json that colours the groups. */
export function obsidianVault(g: { nodes: GNode[]; edges: GEdge[] }): { path: string; text: string }[] {
  const name = new Map(g.nodes.map((n) => [n.id, safe(n.label)]));
  const nbrs = (id: string) => g.edges.flatMap((e) => (e.a === id ? [e.b] : e.b === id ? [e.a] : []));
  const root = "Vivran memory";
  const files = g.nodes.map((n) => {
    const lines = ["---", `type: ${TAG[n.kind]}`, `tags: [vivran/${TAG[n.kind]}]`, "---", "", `# ${n.label}`, "", `*${n.sub}*`, ""];
    if (n.kind === "pattern" && n.ref) { const r = n.ref as Pattern; lines.push(r.detail, "", `> ${r.evidence}`, ""); }
    if (n.kind === "source" && n.ref) { const r = n.ref as SourceFile; lines.push(...[`- Added ${r.added}`, r.facts ? `- ${r.facts} passages used for facts` : "", r.style ? `- Teaches your style: ${r.style}` : ""].filter(Boolean), ""); }
    if (n.kind === "made" && n.ref) {
      const r = n.ref as LibraryItem;
      lines.push(`- Made ${new Date(r.when).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`);
      if (r.note) lines.push(`- Your note: ${r.note}`);
      lines.push("");
    }
    const linked = nbrs(n.id).map((id) => g.nodes.find((x) => x.id === id)!).filter(Boolean);
    if (linked.length) lines.push("## Connected", "", ...linked.map((x) => `- ${KIND_ONE[x.kind]}: [[${name.get(x.id)}]]`), "");
    return { path: `${root}/${FOLDER[n.kind] ? FOLDER[n.kind] + "/" : ""}${name.get(n.id)}.md`, text: lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n") };
  });
  files.push({ path: `${root}/Start here.md`, text: `# Vivran teaching memory\n\nExported from Vivran on ${new Date().toLocaleDateString("en-IN")}. Open the graph view (Ctrl/Cmd + G) to see how your classes, topics, sources and lessons connect.\n\n${(Object.keys(FOLDER) as NodeKind[]).filter((k) => k !== "you").map((k) => `- **${KIND_LABEL[k]}**: ${g.nodes.filter((n) => n.kind === k).length}`).join("\n")}\n` });
  files.push({ path: `${root}/.obsidian/graph.json`, text: JSON.stringify({
    colorGroups: (Object.keys(TAG) as NodeKind[]).map((k) => ({ query: `tag:#vivran/${TAG[k]}`, color: { a: 1, rgb: OB_COLOURS[k] } })),
    showTags: false, showAttachments: false, hideUnresolved: true, showArrow: false, nodeSizeMultiplier: 1.2, lineSizeMultiplier: 1,
  }, null, 2) });
  return files;
}

/** A minimal uncompressed .zip, enough for a few dozen notes without a library. */
export function zip(files: { path: string; text: string }[]): Blob {
  const enc = new TextEncoder();
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const head = (size: number) => { const b = new Uint8Array(size); return { b, v: new DataView(b.buffer) }; };
  for (const f of files) {
    const name = enc.encode(f.path), data = enc.encode(f.text), c = crc(data);
    const l = head(30); l.v.setUint32(0, 0x04034b50, true); l.v.setUint16(4, 20, true); l.v.setUint16(6, 0x0800, true);
    l.v.setUint32(14, c, true); l.v.setUint32(18, data.length, true); l.v.setUint32(22, data.length, true); l.v.setUint16(26, name.length, true);
    const h = head(46); h.v.setUint32(0, 0x02014b50, true); h.v.setUint16(4, 20, true); h.v.setUint16(6, 20, true); h.v.setUint16(8, 0x0800, true);
    h.v.setUint32(16, c, true); h.v.setUint32(20, data.length, true); h.v.setUint32(24, data.length, true); h.v.setUint16(28, name.length, true); h.v.setUint32(42, offset, true);
    parts.push(l.b, name, data); central.push(h.b, name); offset += 30 + name.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const e = head(22); e.v.setUint32(0, 0x06054b50, true); e.v.setUint16(8, files.length, true); e.v.setUint16(10, files.length, true); e.v.setUint32(12, size, true); e.v.setUint32(16, offset, true);
  return new Blob([...parts, ...central, e.b] as BlobPart[], { type: "application/zip" });
}
