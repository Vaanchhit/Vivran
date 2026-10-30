// Intent classification and ambiguity detection, by rules rather than a model,
// the same way Vivran's own request reader works (lib/slidekit/intent.ts): the
// same words always give the same reading, and anything it can't resolve
// becomes a question instead of a guess. Stands in for POST /api/chat/intent.
import { COMPARE_OPTIONS, DECKS, SOURCE_FILE, deckFor, explanationFor } from "./content";
import type { Intent, IntentResult } from "./types";

const RULES: { intent: Intent; label: string; re: RegExp; weight: number }[] = [
  { intent: "compare", label: "Comparison", re: /\b(compare|comparison|vs\.?|versus|difference between|differences)\b/i, weight: 3 },
  { intent: "summarise", label: "Summary", re: /\b(summari[sz]e|summary|key points|tl;?dr|gist)\b/i, weight: 3 },
  { intent: "analyse", label: "Analysis", re: /\b(analy[sz]e|analysis|results|marks data|performance|scores)\b/i, weight: 3 },
  { intent: "paper", label: "Exam paper", re: /\b(paper|test|exam|quiz|marks|assessment|question paper)\b/i, weight: 2 },
  { intent: "worksheet", label: "Worksheet", re: /\b(worksheet|activity sheet|homework)\b/i, weight: 3 },
  { intent: "slides", label: "Slides", re: /\b(slides?|deck|ppt|powerpoint|presentation)\b/i, weight: 3 },
  { intent: "plan", label: "Unit plan", re: /\b(plan|scheme of work|syllabus|week by week|course)\b/i, weight: 2 },
  { intent: "ideas", label: "Ideas", re: /\b(ideas?|brainstorm|activities|engage|hook|fun)\b/i, weight: 2 },
  { intent: "explain", label: "Explanation", re: /\b(explain|what is|what are|why|how does|simply|understand|meaning of|teach me)\b/i, weight: 2 },
];

export const INTENT_LABEL: Record<Intent, string> = Object.fromEntries(
  RULES.map((r) => [r.intent, r.label]).concat([["general", "General"]]),
) as Record<Intent, string>;

export interface Ask { question: string; options: string[]; field: string; placeholder: string }

function topicOf(text: string): string | undefined {
  const deck = deckFor(text);
  if (deck) return deck.title;
  const ex = explanationFor(text);
  if (ex) return ex.name;
  const m = text.match(/\b(?:on|about|for|explain|of)\s+(?:the\s+)?([a-z0-9 '’-]{3,40}?)(?:\s+(?:for|to|in|simply|class|grade)\b|[?.!]|$)/i);
  const t = m?.[1]?.trim();
  return t && !/^(my|this|that|it|me|class|tomorrow|today|next|a|an)\b/i.test(t) ? t : undefined;
}

function itemsOf(text: string): string[] {
  const m = text.match(/(?:compare|between)\s+(.+?)\s+(?:and|vs\.?|versus|with)\s+(.+?)(?:[?.!]|$)/i)
    || text.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:[?.!]|$)/i);
  return m ? [m[1], m[2]].map((s) => s.replace(/^(the|these|two)\s+/i, "").trim()).filter((s) => s && !/^(these|those|them|companies|things)$/i.test(s)) : [];
}

export function classify(text: string, ctx: { source: string | null; forced?: Intent }): { result: IntentResult; ask?: Ask } {
  const scores = new Map<Intent, number>();
  for (const r of RULES) if (r.re.test(text)) scores.set(r.intent, (scores.get(r.intent) ?? 0) + r.weight);
  let intent: Intent = ctx.forced ?? "general";
  if (!ctx.forced && scores.size) intent = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0][0];
  const total = Array.from(scores.values()).reduce((a, b) => a + b, 0);
  const confidence = ctx.forced ? 1 : total ? Math.min(0.98, (scores.get(intent) ?? 0) / total) : 0.3;

  const grade = text.match(/\b(class|grade)\s*(\d{1,2})\b/i)?.[0];
  const topic = topicOf(text);
  const items = itemsOf(text);
  const deck = deckFor(text)?.id;
  const doc = /\b(this|the|my)\s+(pdf|chapter|document|file|unit)\b/i.test(text) || /unit 4|french revolution/i.test(text) ? ctx.source ?? undefined : undefined;
  const result: IntentResult = { intent, label: INTENT_LABEL[intent], confidence, entities: { topic, items, doc, deck, grade } };

  // what is missing, asked rather than guessed
  if (intent === "compare" && items.length < 2)
    return { result, ask: { question: "Which two would you like me to compare?", options: COMPARE_OPTIONS, field: "items", placeholder: "Or type two things, e.g. monarchy and republic" } };
  if (intent === "summarise" && !doc && !ctx.source)
    return { result, ask: { question: "Which document should I summarise?", options: [SOURCE_FILE, "Term 1 History paper.docx"], field: "doc", placeholder: "Or attach a file with the paperclip" } };
  if (intent === "slides" && !deck && !topic)
    return { result, ask: { question: "Which topic are the slides for?", options: DECKS.map((d) => `${d.title} · ${d.level}`), field: "topic", placeholder: "Or type a topic and class" } };
  if (intent === "explain" && !topic)
    return { result, ask: { question: "Which idea should I explain?", options: ["The Reign of Terror", "Inflation", "Compound interest", "Photosynthesis"], field: "topic", placeholder: "Or type any concept" } };
  return { result };
}

/** The pending request with its missing detail filled in. */
export function resume(pending: { text: string; intent: Intent; field: string }, answer: string): string {
  const a = answer.trim();
  switch (pending.intent) {
    case "compare": return `Compare ${a}`;
    case "summarise": return `Summarise ${a}`;
    case "slides": return `Slides on ${a}`;
    case "explain": return `Explain ${a} simply`;
    default: return `${pending.text} ${a}`;
  }
}

/** A chat title from its first request: "Compare: Girondins vs Jacobins". */
export function titleFor(r: IntentResult, text: string): string {
  const e = r.entities;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (r.intent === "compare" && e.items?.length === 2) return `Compare: ${cap(e.items[0])} vs ${e.items[1]}`;
  if (e.topic) return `${r.label} · ${cap(e.topic)}`;
  return cap(text.length > 42 ? `${text.slice(0, 40).trim()}…` : text);
}
