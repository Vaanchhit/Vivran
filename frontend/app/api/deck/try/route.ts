// Public "try it" for the landing page.
//   GET  ?q=…            typo-tolerant suggestions from a curated syllabus list
//   POST { id, level }   the lesson shape, why, the slide plan and the real cover slide
// Only topics on the list (lib/slidekit/try-topics.ts) can be planned, so a visitor
// always sees a sensible plan or a helpful suggestion, never one built on slang,
// a typo or nonsense. Entirely deterministic: no model call, no database, no login.
import { NextResponse } from "next/server";
import { prepareTemplated } from "@/lib/slidekit/templates";
import { TYPE_LABELS } from "@/lib/slidekit/outline";
import { matchDeck } from "@/lib/slidekit/matcher";
import { slideCSS, slideHTML, THEMES } from "@/lib/slidekit/render";
import { SKIN_LABELS } from "@/lib/slidekit/skin";
import { SUBJECTS, resolveSubject } from "@/lib/slidekit/subjects";
import { withKnobs } from "@/lib/slidekit/tokens";
import { LEVELS, LEVEL_LABELS, isBlocked, matchTopics, topicById, type Level } from "@/lib/slidekit/try-topics";
import type { Block } from "@/lib/slidekit/blocks";

export const runtime = "nodejs";

const subjectLabel = (s: string) => SUBJECTS[resolveSubject(s) ?? (s as keyof typeof SUBJECTS)]?.label ?? s;

const hits = new Map<string, { n: number; at: number }>();
function limited(req: Request, max: number) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.at > 60_000) { hits.set(ip, { n: 1, at: now }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > max;
}

/** What each slide does, in a teacher's words (the plan's guidance is written for the model, not for people). */
const PURPOSE: Record<string, string> = {
  title: "Opens the lesson", section: "Starts a new part", objectives: "What students will be able to do", definition: "The key term, defined",
  vocabulary: "Words to know", explanation: "The idea, step by step", process: "The steps, in order", comparison: "Side by side",
  cause_effect: "Why it happened, what followed", timeline: "Events in order", hierarchy: "The parts and how they group",
  formula: "The formula, every symbol explained", worked_example: "A problem solved step by step", key_fact: "A hook to spark curiosity",
  misconception: "A common mistake, corrected", real_world: "Where it shows up in real life", quiz_mcq: "A quick check",
  activity: "Students do something", discussion: "Questions to think about", recap: "What to remember",
  code_example: "Short code to read and run", concept_map: "How the ideas connect", flowchart: "The decision, as a flowchart", meme: "A light moment",
};

const SUGGEST = ["Photosynthesis", "Quadratic equations", "The French Revolution", "Python for loops", "Demand and supply"];

export async function GET(req: Request) {
  if (limited(req, 240)) return NextResponse.json({ matches: [] });
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 80) ?? "";
  if (isBlocked(q)) return NextResponse.json({ matches: [], note: "Let's keep it classroom-friendly. Try a topic you teach." });
  const matches = matchTopics(q).map(m => ({
    id: m.topic.id, topic: m.topic.topic, subject: subjectLabel(m.topic.subject),
    levels: m.topic.levels.map(l => ({ value: l, label: LEVEL_LABELS[l] })),
  }));
  return NextResponse.json({
    matches,
    note: !matches.length && q.trim().length >= 3 ? "We don't have that one in the demo. Try a school or college topic, for example:" : undefined,
    examples: !matches.length ? SUGGEST : undefined,
  });
}

export async function POST(req: Request) {
  if (limited(req, 40)) return NextResponse.json({ error: "Slow down a little, then try again." }, { status: 429 });
  let body: { id?: string; level?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
  const t = topicById(String(body.id ?? ""));
  if (!t) return NextResponse.json({ error: "Pick a topic from the list." }, { status: 400 });
  const level: Level = LEVELS.includes(body.level as Level) && t.levels.includes(body.level as Level) ? (body.level as Level) : t.levels[0];

  const prep = prepareTemplated({ topic: t.topic, grade: level, subject: t.subject });
  if (prep.status !== "ready") return NextResponse.json({ error: "That one can't be planned right now. Try another topic." }, { status: 422 });

  const ctx = prep.context;
  const theme = THEMES[prep.design.themeId ?? "paper"]?.theme ?? THEMES.paper.theme;
  const skin = prep.design.skin ?? "classic";
  const cover = { type: "title", intent: "hook", source: "model", title: t.topic, subtitle: `${LEVEL_LABELS[level]} · ${SUBJECTS[ctx.subject].label}` } as Block;
  const [placement] = withKnobs(prep.design.knobs, () => matchDeck([cover], ctx.grade));

  return NextResponse.json({
    topic: t.topic, level: LEVEL_LABELS[level], subject: SUBJECTS[ctx.subject].label,
    template: { name: prep.template.name, reasons: prep.template.reasons },
    look: { skin: SKIN_LABELS[skin], theme: THEMES[prep.design.themeId ?? "paper"]?.name ?? "Vivran Paper", accent: theme.accent },
    plan: prep.plan.map(p => ({ n: p.n, kind: TYPE_LABELS[p.type], what: PURPOSE[p.type] ?? "" })),
    cover: { css: slideCSS(theme).replace(/\.slide/g, ".try-cover .slide"), html: slideHTML(placement, "", theme, { skin, index: 0, total: prep.plan.length, deckTitle: t.topic }) },
  }, { headers: { "Cache-Control": "no-store" } });
}
