// The slidekit pipeline, run server-side.
//
//   understand -> plan -> buildPrompt -> [backend: grounding + model] -> repair
//   -> matchDeck -> placements
//
// Everything except the bracketed step is deterministic and runs here. The
// bracketed step lives in Python because that is where the API key, pgvector,
// the retry/backoff, the error masking, the request pacing and the token
// accounting already are — see backend/app/api/content.py's slidekit seam.
//
// This is a Node route handler, not an edge one: slidekit imports zod and does
// real work, and none of it should ship to the browser.
import { NextResponse } from "next/server";
import { prepareLesson, type TeacherInput } from "@/lib/slidekit";
import { repairBlock } from "@/lib/slidekit/repair";
import { matchDeck } from "@/lib/slidekit/matcher";
import type { Block } from "@/lib/slidekit/blocks";
import {
  buildSourceMaterial,
  resolveCitations,
  toSubjectId,
  type SourceChunk,
} from "@/lib/slidekit-bridge";

export const runtime = "nodejs";

const withoutImage = (b: Block): Block => {
  const { imageQuery: _unused, ...rest } = b as Block & { imageQuery?: string };
  return rest as Block;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/** Forward the caller's own credentials; this route never holds any of its own. */
function authHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const auth = req.headers.get("authorization");
  const ws = req.headers.get("workspace-id");
  if (auth) h["Authorization"] = auth;
  if (ws) h["Workspace-Id"] = ws;
  return h;
}

export async function POST(req: Request) {
  let body: TeacherInput & { materialId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // 1. Understand — deterministic. May come back with questions instead of a
  //    plan, which is the point: slidekit asks rather than guessing.
  const input: TeacherInput = {
    ...body,
    subject: body.subject ? (toSubjectId(body.subject) ?? body.subject) : undefined,
  };
  let prep;
  try {
    prep = prepareLesson(input);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read that request." },
      { status: 400 },
    );
  }
  if (prep.status !== "ready") {
    return NextResponse.json({
      status: "needs_input",
      questions: prep.questions,
      warnings: prep.context.warnings,
    });
  }
  const ctx = prep.context;

  // 2. Grounding — best effort. An ungrounded deck is a worse deck, not a
  //    failed one, so a retrieval failure never blocks generation.
  let chunks: SourceChunk[] = [];
  try {
    const q = `Teaching material about ${ctx.topic} for a ${ctx.gradeLabel} ${ctx.subject} course`;
    const r = await fetch(`${API}/content/grounding`, {
      method: "POST",
      headers: authHeaders(req),
      body: JSON.stringify({ query: q, material_id: body.materialId, limit: 6 }),
    });
    if (r.ok) chunks = (await r.json()).chunks ?? [];
  } catch {
    // fall through ungrounded
  }

  // 3. Plan + prompt. Grounding flips the prompt into strict mode, which is
  //    what turns on citation tags.
  const { sourceText, tagToChunk } = buildSourceMaterial(chunks);
  const grounded = prepareLesson({ ...input, sourceText: sourceText || undefined });
  if (grounded.status !== "ready") {
    return NextResponse.json({ status: "needs_input", questions: grounded.questions });
  }

  // 4. The one non-deterministic step.
  let raw = "";
  let meta: Record<string, unknown> = {};
  try {
    const r = await fetch(`${API}/content/blocks`, {
      method: "POST",
      headers: authHeaders(req),
      body: JSON.stringify({
        system_prompt: grounded.prompt.system,
        user_prompt: grounded.prompt.user,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // The backend already translated this into something a teacher can read.
      return NextResponse.json(
        { error: d?.detail ?? "Could not generate that deck." },
        { status: r.status },
      );
    }
    raw = d.content ?? "";
    meta = { provider: d.provider, model: d.model_name, usage: d.usage };
  } catch {
    return NextResponse.json(
      { error: "Could not reach the generator. Please try again." },
      { status: 502 },
    );
  }

  // 5. Validate + deterministically repair. Never invents content; a block it
  //    cannot rescue is reported, not silently dropped.
  let parsed: { blocks?: unknown[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "The generator returned something unreadable. Please try again." },
      { status: 502 },
    );
  }
  const blocks: Block[] = [];
  const repairs: string[] = [];
  let lost = 0;
  (parsed.blocks ?? []).forEach((b, i) => {
    const planned = grounded.plan[i] ?? grounded.plan[grounded.plan.length - 1];
    const r = repairBlock(b, planned, ctx.topic);
    if (r.fixes.length) repairs.push(`slide ${i + 1}: ${r.fixes.join("; ")}`);
    if (r.block) blocks.push(r.block);
    else lost++;
  });
  if (!blocks.length) {
    return NextResponse.json(
      { error: "That didn't produce a usable deck. Try rephrasing the topic." },
      { status: 502 },
    );
  }

  // 6. Layout, by arithmetic. Nothing generates photos yet, so an image
  //    query would render as a labelled placeholder box. Dropping it lets the
  //    matcher pick the text layout for that block instead.
  const placements = matchDeck(blocks.map(withoutImage), ctx.grade);
  const { cited, invented } = resolveCitations(blocks, tagToChunk);

  return NextResponse.json({
    status: "ready",
    placements,
    plan: grounded.plan.map(p => p.type),
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
    ...meta,
  });
}
