// The Library and Teaching memory, from the teacher's real data: what they made
// (GET /api/library), the files they gave Vivran (GET /api/sources), and the
// style traits learned from those files (GET /api/memory). The map links them
// through the classes and topics each item names.
import type { LibraryEntry, LibraryKind, Source as SourceRow, StyleTrait } from "@/services/api";

export type ItemKind = "Slides" | "Paper" | "Worksheet" | "Explanation" | "Plan" | "Notes" | "Activity" | "Audio" | "Image" | "Video";

const KIND_FOR: Record<LibraryKind, ItemKind> = {
  slides: "Slides", assessment: "Paper", worksheet: "Worksheet", example: "Explanation", course_plan: "Plan",
  lesson_notes: "Notes", interactive: "Activity", narration: "Audio", image: "Image", video: "Video",
};

export interface LibraryItem {
  id: string; title: string; kind: ItemKind; type: LibraryKind;
  cls: string | null;          // "Class 7 · Science"
  topic: string | null;
  when: number;
  entry: LibraryEntry;
}

/** "Class 7 · Science", from whatever grade and subject an item or file carries. */
export function classOf(grade?: string | null, subject?: string | null): string | null {
  const g = (grade || "").trim(), s = (subject || "").replace(/_/g, " ").trim();
  if (!g && !s) return null;
  const cap = (x: string) => x.replace(/\b\w/g, (c) => c.toUpperCase());
  return [g ? cap(g) : "", s ? cap(s) : ""].filter(Boolean).join(" · ");
}

const titleTopic = (t: string) => t.split(/\s+[·:|–-]\s+/)[0].trim();

export function library(entries: LibraryEntry[]): LibraryItem[] {
  return entries.map((e) => {
    const m = e.meta ?? {};
    const topic = (m.topic || m.concept || m.topics?.[0] || titleTopic(e.title) || "").trim() || null;
    return {
      id: e.id, title: e.title, type: e.type, kind: KIND_FOR[e.type] ?? "Notes",
      cls: classOf(m.grade, m.subject), topic: topic ? topic.charAt(0).toUpperCase() + topic.slice(1) : null,
      when: e.created_at ? Date.parse(e.created_at) : Date.now(), entry: e,
    };
  }).sort((a, b) => b.when - a.when);
}

/* ───────────────────────── the memory graph ───────────────────────── */

export type NodeKind = "you" | "class" | "topic" | "source" | "made" | "pattern";
export interface GNode { id: string; kind: NodeKind; label: string; sub: string; ref?: LibraryItem | SourceRow | StyleTrait }
export interface GEdge { a: string; b: string }

export const KIND_ONE: Record<NodeKind, string> = { you: "You", class: "Class", topic: "Topic", source: "Source", made: "Made", pattern: "Learned pattern" };
export const KIND_LABEL: Record<NodeKind, string> = { you: "You", class: "Classes", topic: "Topics", source: "Sources", made: "Things you made", pattern: "Learned patterns" };

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const TRAIT_STATUS: Record<StyleTrait["status"], string> = { active: "In use", suggested: "To review", dismissed: "Not used", stale: "Out of date" };

export function memoryGraph(name: string, items: LibraryItem[], sources: SourceRow[], traits: StyleTrait[]): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } return n.id; };
  const link = (a: string, b: string) => { if (seen.has(a) && seen.has(b) && a !== b && !edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) edges.push({ a, b }); };

  const me = add({ id: "me", kind: "you", label: name, sub: "Your teaching" });
  const cls = (c: string | null) => {
    if (!c) return me;
    const id = add({ id: `c:${key(c)}`, kind: "class", label: c, sub: "Class" });
    link(id, me);
    return id;
  };
  // A subject alone ("Science") joins the class that already teaches it, if one does.
  const bySubject = (subject?: string | null) => {
    if (!subject) return me;
    const hit = nodes.find((n) => n.kind === "class" && key(n.label).endsWith(key(subject)));
    return hit ? hit.id : cls(classOf("", subject));
  };

  items.forEach((i) => {
    const c = cls(i.cls);
    let parent = c;
    if (i.topic) {
      parent = add({ id: `t:${key(i.topic)}`, kind: "topic", label: i.topic, sub: i.cls ?? "Topic" });
      link(parent, c);
    }
    add({ id: `m:${i.id}`, kind: "made", label: i.title, sub: i.kind, ref: i });
    link(`m:${i.id}`, parent);
  });

  sources.forEach((s) => {
    const id = add({ id: `s:${s.id}`, kind: "source", label: s.title, sub: [s.type?.toUpperCase(), s.facts?.chunks ? `${s.facts.chunks} passages` : s.facts?.status === "PROCESSING" ? "being read" : ""].filter(Boolean).join(" · "), ref: s });
    const c = s.grade || s.subject ? cls(classOf(s.grade, s.subject)) : me;
    // A file whose title names a topic already on the map hangs off that topic.
    const topic = nodes.find((n) => n.kind === "topic" && key(s.title).includes(key(n.label)));
    link(id, topic ? topic.id : c);
  });

  traits.filter((t) => t.status !== "dismissed").forEach((t) => {
    const id = add({ id: `p:${t.id}`, kind: "pattern", label: t.summary, sub: TRAIT_STATUS[t.status], ref: t });
    const from = t.evidence.map((e) => sources.find((s) => s.style?.document_id === e.document_id)).filter(Boolean) as SourceRow[];
    if (from.length) from.forEach((s) => link(id, `s:${s.id}`)); else link(id, bySubject(t.subject));
  });

  return { nodes, edges };
}
