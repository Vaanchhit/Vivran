// The PLAN step: propose a deck outline for the teacher to approve.
//
// The planning model (Groq gpt-oss-120b, Gemini as backup; see
// backend/app/ai/cheap_model.py::generate_planner) improves slidekit's
// deterministic draft. If it fails or returns something unusable, the teacher
// still gets the deterministic draft to edit, so this step never blocks them.
import { NextResponse } from "next/server";
import { prepareLesson, type TeacherInput } from "@/lib/slidekit";
import { TYPE_LABELS, buildOutlinePrompt, draftOutline, parseOutline } from "@/lib/slidekit/outline";
import { MAX_SLIDES } from "@/lib/slidekit/intent";
import { buildSourceMaterial, toSubjectId } from "@/lib/slidekit-bridge";
import { callModel, fetchGrounding } from "@/lib/deck-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: TeacherInput & { materialId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const { materialId, ...rest } = body;
  const input: TeacherInput = { ...rest, subject: rest.subject ? (toSubjectId(rest.subject) ?? rest.subject) : undefined };

  let prep;
  try {
    prep = prepareLesson(input);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that request." }, { status: 400 });
  }
  if (prep.status !== "ready") {
    return NextResponse.json({ status: "needs_input", questions: prep.questions, warnings: prep.context.warnings });
  }

  const chunks = await fetchGrounding(req, prep.context, materialId);
  const { sourceText } = buildSourceMaterial(chunks);
  const grounded = prepareLesson({ ...input, sourceText: sourceText || undefined });
  if (grounded.status !== "ready") return NextResponse.json({ status: "needs_input", questions: grounded.questions });
  const ctx = grounded.context;
  const allowed = ctx.allowedBlocks;

  const res = await callModel(req, "/content/outline", buildOutlinePrompt(ctx, grounded.plan));
  const proposed = res.ok ? parseOutline(res.raw, allowed) : null;

  return NextResponse.json({
    status: "outline",
    outline: proposed ?? draftOutline(grounded.plan, ctx),
    // "draft" tells the UI the planning model was unavailable, so this is slidekit's own plan.
    plannedBy: proposed ? (res.ok ? res.meta.provider : "draft") : "draft",
    maxSlides: MAX_SLIDES,
    types: allowed.map(t => ({ type: t, label: TYPE_LABELS[t] })),
    context: { topic: ctx.topic, gradeLabel: ctx.gradeLabel, grounded: chunks.length > 0 },
  });
}
