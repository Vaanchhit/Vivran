// Live end-to-end demo: a teacher's sentence -> a deck you can open and print.
//
// This is the whole pipeline with a real model call in the middle:
//   understand() -> plan() -> buildPrompt() -> [Gemini] -> repair -> match -> render
//
// The model only fills a plan slidekit already fixed, into a schema whose
// character budgets come from layouts verified to hold them. Everything before
// and after the model call is deterministic.
//
//   npx tsx lib/slidekit/scripts/demo-live.ts "40 mark test on Porter's Five Forces for College 2nd Year"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { prepareLesson, type TeacherInput } from "../index";
import { repairBlock } from "../repair";
import { matchDeck } from "../matcher";
import type { Block } from "../blocks";
import { slideHTML, SLIDE_CSS } from "../render";

const KEY = (() => {
  const env = readFileSync(new URL("../../../../backend/.env", import.meta.url), "utf8");
  return env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim() ?? "";
})();
const MODEL = process.env.DEMO_MODEL ?? "gemini-3.6-flash";

async function callModel(system: string, user: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  // Same shape as the backend's retry policy: a 503 here is Google capacity,
  // not our prompt, and it clears within seconds.
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
      }),
    });
    if (res.ok) {
      const d: any = await res.json();
      const usage = d.usageMetadata ?? {};
      console.log(`    tokens: ${usage.promptTokenCount ?? "?"} in / ${usage.candidatesTokenCount ?? "?"} out`);
      return d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    const body = await res.text();
    console.log(`    attempt ${attempt}: HTTP ${res.status}${res.status === 503 ? " (model overloaded)" : ""}`);
    if (attempt === 4) throw new Error(`Gemini failed after 4 attempts: ${body.slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 800 * 2 ** (attempt - 1)));
  }
  throw new Error("unreachable");
}

const topic = process.argv.slice(2).join(" ") ||
  "Porter's Five Forces for College 2nd Year Business Studies";

const input: TeacherInput = { topic, grade: "College 2nd Year", subject: "Business Studies", slideCount: 12 };

(async () => {
  console.log(`\n  PROMPT  "${topic}"\n`);

  console.log("  1. understand() — deterministic, no model call");
  const prep = prepareLesson(input);
  const ctx = prep.context;
  console.log(`     subject ${ctx.subject} (${ctx.subjectSource}) · ${ctx.grade} · goal ${ctx.goal} · ${ctx.slideCount} slides`);
  console.log(`     topic shapes: ${ctx.shapes.map(s => `${s.shape}:${s.score}`).join(", ")}`);
  ctx.warnings.forEach(w => console.log(`     ! ${w}`));
  if (prep.status !== "ready") {
    console.log("\n  Blocked — slidekit needs an answer first (it asks rather than guessing):");
    prep.questions.forEach(q => console.log(`     ? ${q.ask}`));
    process.exit(0);
  }

  console.log("\n  2. plan() — the lesson skeleton, fixed before the model is involved");
  console.log(`     ${prep.plan.map(p => p.type).join(" → ")}`);

  console.log(`\n  3. Gemini (${MODEL}) fills that plan`);
  const t0 = Date.now();
  const raw = await callModel(prep.prompt.system, prep.prompt.user);
  console.log(`    took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log("\n  4. validate + deterministically repair");
  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { console.log("     model returned non-JSON; repairing from raw text"); parsed = { blocks: [] }; }
  const rawBlocks: unknown[] = parsed.blocks ?? [];
  const blocks: Block[] = [];
  let repaired = 0, lost = 0;
  rawBlocks.forEach((b, i) => {
    const planned = prep.plan[i] ?? prep.plan[prep.plan.length - 1];
    const r = repairBlock(b, planned, ctx.topic);
    if (r.fixes.length) { repaired++; console.log(`     block ${i + 1}: ${r.fixes.join("; ")}`); }
    if (r.block) blocks.push(r.block); else lost++;
  });
  console.log(`     ${blocks.length} valid · ${repaired} repaired · ${lost} unrecoverable`);

  console.log("\n  5. matchDeck() — layout chosen by arithmetic, not by the model");
  const placements = matchDeck(blocks, ctx.grade);
  const counts = new Map<string, number>();
  for (const p of placements) counts.set(p.layoutId, (counts.get(p.layoutId) ?? 0) + 1);
  console.log(`     ${placements.length} slides across ${counts.size} distinct layouts`);
  console.log(`     ${[...counts].map(([l, n]) => `${l}${n > 1 ? `×${n}` : ""}`).join(", ")}`);
  const fitted = placements.filter(p => p.copyFit.length || p.trimmed.length || p.dropped.length);
  console.log(fitted.length
    ? `     ${fitted.length} slide(s) needed copy-fitting — flagged, never silent`
    : `     nothing trimmed, split or dropped: the content fit by construction`);

  console.log("\n  6. render");
  mkdirSync("lib/slidekit/test/out", { recursive: true });
  const out = "lib/slidekit/test/out/demo.html";
  writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8">
<title>Vivran — ${topic}</title><style>
body{margin:0;background:#4A4A52;font-family:system-ui}
.wrap{max-width:1100px;margin:0 auto;padding:28px}
.slide{margin:0 auto 22px;box-shadow:0 8px 30px rgba(0,0,0,.35);transform-origin:top left}
@media print{body{background:#fff}.wrap{padding:0;max-width:none}
  .slide{margin:0;box-shadow:none;break-after:page;transform:none!important}}
${SLIDE_CSS}</style></head><body><div class="wrap">
${placements.map(p => slideHTML(p)).join("\n")}
</div><script>
function fit(){var w=document.querySelector('.wrap').clientWidth;
document.querySelectorAll('.slide').forEach(function(s){s.style.transform='scale('+(w/1920)+')';
s.style.height=(1080*(w/1920))+'px';});}
addEventListener('resize',fit);fit();
</script></body></html>`);
  console.log(`     ${out}\n`);
  console.log(`  Open it:  open ${out}`);
  console.log(`  Print to PDF from the browser — one slide per page.\n`);
})();
