// Public "try it" for the landing page: type a topic, see which template Vivran
// picks, why, and the 8-slide plan, plus the real cover slide in the chosen look.
// Entirely deterministic (understand → select → plan → design → layout): no
// model call, no database, no login, so it costs nothing to run. Rate-limited
// per address so it can't be used as a free load generator.
import { NextResponse } from "next/server";
import { prepareTemplated } from "@/lib/slidekit/templates";
import { TYPE_LABELS } from "@/lib/slidekit/outline";
import { matchDeck } from "@/lib/slidekit/matcher";
import { slideCSS, slideHTML, THEMES } from "@/lib/slidekit/render";
import { SKIN_LABELS } from "@/lib/slidekit/skin";
import { SUBJECTS } from "@/lib/slidekit/subjects";
import { withKnobs } from "@/lib/slidekit/tokens";
import type { Block } from "@/lib/slidekit/blocks";

export const runtime = "nodejs";

const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, t.lastIndexOf(" ", n - 1)).replace(/[,;:]$/, "")}…`);

const hits = new Map<string, { n: number; at: number }>();
function limited(ip: string) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.at > 60_000) { hits.set(ip, { n: 1, at: now }); if (hits.size > 5000) hits.clear(); return false; }
  h.n++;
  return h.n > 30;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (limited(ip)) return NextResponse.json({ error: "Slow down a little, then try again." }, { status: 429 });
  let body: { topic?: string; grade?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
  const typed = String(body.topic ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (typed.length < 3) return NextResponse.json({ error: "Type a topic, like “Photosynthesis for Class 7”." }, { status: 400 });
  // The grade can come from the topic itself ("… for Class 7"); otherwise a sensible default.
  const LEVEL = /\b(class|grade|std\.?)\s*\d{1,2}\b|\b(b\.?\s?com|bca|bba|mba|llb|b\.?tech|m\.?tech|college|ug|pg)\b/i;
  const fromTopic = typed.match(LEVEL)?.[0];
  // "Photosynthesis for Class 7" → topic "Photosynthesis", level "Class 7".
  const topic = fromTopic ? typed.replace(new RegExp(`[,\\s]*(for|in|·|-)?\\s*${fromTopic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), "").replace(/[,\s]+$/, "").trim() || typed : typed;
  const grade = String(body.grade ?? "").trim().slice(0, 40) || fromTopic || "Class 9";

  let prep;
  try { prep = prepareTemplated({ topic, grade }); } catch { return NextResponse.json({ error: "Couldn't read that. Try a shorter topic." }, { status: 400 }); }
  if (prep.status !== "ready") return NextResponse.json({ error: prep.questions[0]?.ask ?? "Try a more specific topic." }, { status: 422 });

  const ctx = prep.context;
  const theme = THEMES[prep.design.themeId ?? "paper"]?.theme ?? THEMES.paper.theme;
  const skin = prep.design.skin ?? "classic";
  const cover = { type: "title", intent: "hook", source: "model", title: topic.slice(0, 70), subtitle: [ctx.gradeLabel === "unspecified" ? "" : ctx.gradeLabel, ctx.subject === "general" ? "" : SUBJECTS[ctx.subject].label].filter(Boolean).join(" · ") || undefined } as Block;
  const [placement] = withKnobs(prep.design.knobs, () => matchDeck([cover], ctx.grade));

  return NextResponse.json({
    template: { name: prep.template.name, reasons: prep.template.reasons, how: prep.template.how },
    look: { skin: SKIN_LABELS[skin], theme: THEMES[prep.design.themeId ?? "paper"]?.name ?? "Vivran Paper", accent: theme.accent },
    level: ctx.gradeLabel === "unspecified" ? "" : ctx.gradeLabel, subject: ctx.subject === "general" ? "" : SUBJECTS[ctx.subject].label,
    plan: prep.plan.map(p => ({ n: p.n, kind: TYPE_LABELS[p.type], what: clip(p.guidance.split(". ")[0], 120) })),
    cover: { css: slideCSS(theme).replace(/\.slide/g, ".try-cover .slide"), html: slideHTML(placement, "", theme, { skin, index: 0, total: prep.plan.length, deckTitle: topic }) },
  }, { headers: { "Cache-Control": "no-store" } });
}
