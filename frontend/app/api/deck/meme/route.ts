// Add a meme slide to an existing deck, from the deck viewer.
//
//   GET   the allowed formats, each with a signed preview image.
//   POST  { suggest: true, topic, grade, subject, context }  → a meme block the
//         model proposes for the current slide. ONE small model call, only when
//         the teacher presses "Suggest". The teacher edits it before adding.
//   POST  { block, grade }  → the laid-out slide (a placement), image signed.
//
// Formats, caption cleaning and the image proxy are the same safeguards the
// template pipeline uses (lib/slidekit/meme.ts); a teacher's own captions go
// through them too.
import { NextResponse } from "next/server";
import { understand, type TeacherInput } from "@/lib/slidekit/intent";
import { buildPrompt } from "@/lib/slidekit/prompt";
import { repairBlock } from "@/lib/slidekit/repair";
import { matchDeck } from "@/lib/slidekit/matcher";
import { validateBlock } from "@/lib/slidekit/blocks";
import { MEME_FORMATS, cleanCaption, memeLines, memeSrc } from "@/lib/slidekit/meme";
import type { GradeBand } from "@/lib/slidekit/tokens";
import { toSubjectId } from "@/lib/slidekit-bridge";
import { callModel } from "@/lib/deck-server";

export const runtime = "nodejs";

const BANDS: GradeBand[] = ["primary", "middle", "secondary", "college"];
const SAMPLE = ["Top caption", "Bottom caption", "Third caption", "Fourth caption"];

export async function GET() {
  return NextResponse.json({
    formats: MEME_FORMATS.map(f => ({ id: f.id, name: f.name, lines: f.lines, use: f.use, preview: memeSrc(f.id, SAMPLE.slice(0, f.lines)) })),
  });
}

export async function POST(req: Request) {
  let body: {
    suggest?: boolean; topic?: string; grade?: string | number; band?: string; subject?: string; language?: string; context?: string;
    block?: { template?: string; lines?: string[]; takeaway?: string };
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 }); }

  if (body.suggest) {
    const topic = (body.topic ?? "").trim();
    if (topic.length < 2) return NextResponse.json({ error: "The deck needs a topic." }, { status: 400 });
    const input: TeacherInput = {
      topic, grade: body.grade ?? "Class 8", subject: body.subject ? (toSubjectId(body.subject) ?? body.subject) : undefined,
      language: body.language || "English", include: { meme: true },
      notes: body.context ? `The meme goes after this slide: ${body.context.slice(0, 600)}` : undefined,
    };
    let ctx;
    try { ctx = understand(input); } catch { return NextResponse.json({ error: "Could not read that deck's details." }, { status: 400 }); }
    const plan = [{ n: 1, intent: "teach" as const, type: "meme" as const, fallbackType: undefined,
      guidance: `A classroom meme about ${topic}${body.context ? " that lands the idea of the slide described in TEACHER NOTES" : ""}. Pick one format from MEME FORMATS that fits, write captions a ${ctx.gradeLabel} student finds funny and that make the correct idea easier to remember.` }];
    const res = await callModel(req, "/content/blocks", buildPrompt(ctx, plan));
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    let raw: { blocks?: unknown[] } = {};
    try { raw = JSON.parse(res.raw); } catch { return NextResponse.json({ error: "The suggestion came back unreadable. Try again, or write your own." }, { status: 502 }); }
    const r = repairBlock((raw.blocks ?? [])[0], plan[0], topic);
    if (!r.block || r.block.type !== "meme") return NextResponse.json({ error: "No usable suggestion this time. Try again, or write your own." }, { status: 502 });
    return NextResponse.json({ block: { template: r.block.template, lines: r.block.lines, takeaway: r.block.takeaway } });
  }

  // Build the slide from the teacher's (possibly edited) meme.
  const b = body.block ?? {};
  const lines = memeLines(b.template, (b.lines ?? []).map(l => cleanCaption(l)));
  if (!lines) return NextResponse.json({ error: "Pick a format and write at least one caption (no links or rude words)." }, { status: 400 });
  const takeaway = cleanCaption(b.takeaway, 140);
  if (!takeaway) return NextResponse.json({ error: "Add the idea this meme helps students remember." }, { status: 400 });
  const v = validateBlock({ type: "meme", intent: "teach", source: "model", template: b.template, lines, takeaway });
  if (!v.ok) return NextResponse.json({ error: v.errors.join("; ") }, { status: 400 });
  const band = BANDS.includes(body.band as GradeBand) ? (body.band as GradeBand) : "secondary";
  const [placement] = matchDeck([v.block], band);
  if (!placement) return NextResponse.json({ error: "That meme could not be laid out." }, { status: 422 });
  for (const e of placement.elements) if (e.t === "picture") e.src = memeSrc(e.template, e.lines) ?? undefined;
  return NextResponse.json({ placement });
}
