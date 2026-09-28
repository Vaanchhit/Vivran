// The slidekit pipeline, run server-side: the PRODUCE step.
//
//   understand -> [approved outline | plan] -> buildPrompt -> [backend: grounding + model]
//   -> repair -> matchDeck -> placements
//
// When the teacher approved an outline (app/api/deck/outline), it replaces the
// deterministic plan, after being re-validated against the lesson's allowed
// block types. Everything except the bracketed step is deterministic and runs
// here; the bracketed step lives in Python because that is where the API key,
// pgvector, retry/backoff, error masking, pacing and token accounting are.
//
// This is a Node route handler, not an edge one: slidekit imports zod and does
// real work, and none of it should ship to the browser.
import { NextResponse } from "next/server";
import { buildPrompt, prepareLesson, type TeacherInput } from "@/lib/slidekit";
import { repairBlock } from "@/lib/slidekit/repair";
import { matchDeck } from "@/lib/slidekit/matcher";
import { outlineToPlan, validateOutline } from "@/lib/slidekit/outline";
import type { Block } from "@/lib/slidekit/blocks";
import { buildSourceMaterial, resolveCitations, toSubjectId } from "@/lib/slidekit-bridge";
import { callModel, fetchGrounding } from "@/lib/deck-server";

export const runtime = "nodejs";

const withoutImage = (b: Block): Block => {
  const { imageQuery: _unused, ...rest } = b as Block & { imageQuery?: string };
  return rest as Block;
};

export async function POST(req: Request) {
  let body: TeacherInput & { materialId?: string; outline?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const { outline, materialId, ...rest } = body;

  // 1. Understand — deterministic. May come back with questions instead of a
  //    plan, which is the point: slidekit asks rather than guessing.
  const input: TeacherInput = {
    ...rest,
    subject: rest.subject ? (toSubjectId(rest.subject) ?? rest.subject) : undefined,
  };
  let prep;
  try {
    prep = prepareLesson(input);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that request." }, { status: 400 });
  }
  if (prep.status !== "ready") {
    return NextResponse.json({ status: "needs_input", questions: prep.questions, warnings: prep.context.warnings });
  }
  const ctx = prep.context;

  // 2. Grounding. Strict mode (citation tags) turns on when anything was retrieved.
  const chunks = await fetchGrounding(req, ctx, materialId);
  const { sourceText, tagToChunk } = buildSourceMaterial(chunks);
  const grounded = prepareLesson({ ...input, sourceText: sourceText || undefined });
  if (grounded.status !== "ready") {
    return NextResponse.json({ status: "needs_input", questions: grounded.questions });
  }

  // 3. The plan: the teacher's approved outline when there is one.
  let plan = grounded.plan;
  let prompt = grounded.prompt;
  if (outline !== undefined) {
    const approved = validateOutline(outline, grounded.context.allowedBlocks);
    if (!approved) {
      return NextResponse.json({ error: "That outline has a slide this lesson can't use. Please check it and try again." }, { status: 400 });
    }
    plan = outlineToPlan(approved);
    prompt = buildPrompt(grounded.context, plan);
  }

  // 4. The one non-deterministic step.
  const res = await callModel(req, "/content/blocks", prompt);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  // 5. Validate + deterministically repair. Never invents content; a block it
  //    cannot rescue is reported, not silently dropped.
  let parsed: { blocks?: unknown[] } = {};
  try {
    parsed = JSON.parse(res.raw);
  } catch {
    return NextResponse.json({ error: "The generator returned something unreadable. Please try again." }, { status: 502 });
  }
  const blocks: Block[] = [];
  const repairs: string[] = [];
  let lost = 0;
  (parsed.blocks ?? []).forEach((b, i) => {
    const planned = plan[i] ?? plan[plan.length - 1];
    const r = repairBlock(b, planned, ctx.topic);
    if (r.fixes.length) repairs.push(`slide ${i + 1}: ${r.fixes.join("; ")}`);
    if (r.block) blocks.push(r.block);
    else lost++;
  });
  if (!blocks.length) {
    return NextResponse.json({ error: "That didn't produce a usable deck. Try rephrasing the topic." }, { status: 502 });
  }

  // 6. Layout, by arithmetic. Nothing generates photos yet, so an image
  //    query would render as a labelled placeholder box. Dropping it lets the
  //    matcher pick the text layout for that block instead.
  const placements = matchDeck(blocks.map(withoutImage), ctx.grade);
  const { cited, invented } = resolveCitations(blocks, tagToChunk);

  return NextResponse.json({
    status: "ready",
    placements,
    plan: plan.map(p => p.type),
    context: {
      topic: ctx.topic,
      subject: ctx.subject,
      grade: ctx.grade,
      gradeLabel: ctx.gradeLabel,
      goal: ctx.goal,
      language: ctx.language,
      warnings: ctx.warnings,
    },
    grounding: {
      retrieved: chunks.length,
      cited: cited.length,
      sources: cited,
      // Surfaced, not swallowed: this is the hallucinated-citation rate and it
      // is unobservable if dropped silently.
      inventedCitations: invented,
    },
    quality: {
      slides: placements.length,
      repaired: repairs,
      unrecoverable: lost,
      copyFit: placements.flatMap(p => p.copyFit.map(o => o.path)),
      trimmed: placements.flatMap(p => p.trimmed),
      dropped: placements.flatMap(p => p.dropped),
    },
    ...res.meta,
  });
}
