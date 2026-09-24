// ─────────────────────────────────────────────────────────────
// End-to-end test run over the university corpus.
//   npx tsx test/run.ts
// ─────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync } from "node:fs";
import { LAYOUTS } from "../layouts";
import { matchDeck, type Placement } from "../matcher";
import { prepareLesson } from "../index";
import { repairBlock } from "../repair";
import { CANVAS, SAFE } from "../tokens";
import { CORPUS } from "./corpus";
import { mockBlock, mockDeck, type Profile } from "./mockModel";
import { budgetFor } from "../budgets";
import { matchBlock, tryLayout } from "../matcher";
import type { Block } from "../blocks";

const PROFILES: Profile[] = ["typical", "max", "sloppy", "broken"];
const failures: string[] = [];
const fail = (id: string, msg: string) => failures.push(`${id}: ${msg}`);
const usage: Record<string, number> = Object.fromEntries(LAYOUTS.map(l => [l.id, 0]));
const rows: string[] = [];
const stress = { slides: 0, splits: 0, copyFit: 0, trimmed: 0, dropped: 0 };
const decks: { id: string; profile: Profile; grade: string; script: string; placements: Placement[] }[] = [];
const totals: Record<Profile, { slides: number; splits: number; copyFit: number; trimmed: number; dropped: number; repaired: number; converted: number; lost: number }> =
  Object.fromEntries(PROFILES.map(p => [p, { slides: 0, splits: 0, copyFit: 0, trimmed: 0, dropped: 0, repaired: 0, converted: 0, lost: 0 }])) as any;

function geometry(id: string, ps: Placement[]) {
  ps.forEach((p, i) => {
    const texts = p.elements.filter(e => e.t === "text") as Extract<Placement["elements"][number], { t: "text" }>[];
    for (const e of p.elements) {
      if (!("w" in e)) continue;
      const bg = e.t === "image" && e.bg || (e.t === "box" && e.tone === "inverse");
      const bounds = bg ? { x: 0, y: 0, w: CANVAS.w, h: CANVAS.h } : SAFE;
      if (e.x < bounds.x - 1 || e.y < bounds.y - 1 || e.x + e.w > bounds.x + bounds.w + 1 || e.y + e.h > bounds.y + bounds.h + 1)
        fail(id, `slide ${i + 1} (${p.layoutId}): ${e.t} ${"path" in e ? e.path : ""} leaves the safe area`);
    }
    for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
      const A = texts[a], B = texts[b];
      if (A.x < B.x + B.w - 1 && B.x < A.x + A.w - 1 && A.y < B.y + B.h - 1 && B.y < A.y + A.h - 1)
        fail(id, `slide ${i + 1} (${p.layoutId}): text "${A.path}" overlaps "${B.path}"`);
    }
  });
}

for (const c of CORPUS) {
  const r = prepareLesson(c.input);
  const ctx = r.context;
  const e = c.expect;
  if (r.status !== e.status) fail(c.id, `status ${r.status}, expected ${e.status}`);
  if (e.subject && ctx.subject !== e.subject) fail(c.id, `subject ${ctx.subject}, expected ${e.subject}`);
  if (e.band && ctx.grade !== e.band) fail(c.id, `grade ${ctx.grade} (from "${c.input.grade}"), expected ${e.band}`);
  if (e.asks && !ctx.questions.some(q => q.blocking && q.field === e.asks)) fail(c.id, `no blocking question about ${e.asks}`);
  if (e.warns && !ctx.warnings.some(w => e.warns!.test(w))) fail(c.id, `missing warning ${e.warns}`);
  if (e.grounding && ctx.grounding !== e.grounding) fail(c.id, `grounding ${ctx.grounding}, expected ${e.grounding}`);
  if (r.status !== "ready") { rows.push(`| ${c.id} | ${ctx.subject} | ${ctx.grade} | asks: ${r.questions.map(q => q.field).join(", ")} | – | – | – |`); continue; }
  for (const t of e.planHas ?? []) if (!r.plan.some(p => p.type === t)) fail(c.id, `plan lacks ${t}: ${r.plan.map(p => p.type).join(" → ")}`);
  if (r.plan.length !== ctx.slideCount) fail(c.id, `plan has ${r.plan.length} slides, expected ${ctx.slideCount}`);

  const perProfile: string[] = [];
  for (const profile of PROFILES) {
    const T = totals[profile];
    const raw = mockDeck(r.plan, ctx, profile, c.id);
    const blocks = [];
    for (let i = 0; i < raw.blocks.length; i++) {
      const rep = repairBlock(raw.blocks[i], r.plan[i], ctx.topic);
      if (rep.fixes.length) T.repaired++;
      if (rep.converted) T.converted++;
      if (!rep.block) { T.lost++; if (profile !== "broken") fail(c.id, `${profile}: block ${i + 1} (${r.plan[i].type}) unrepairable: ${rep.fixes.join("; ")}`); continue; }
      if (rep.fixes.length && profile !== "broken") fail(c.id, `${profile}: block ${i + 1} needed repair: ${rep.fixes.join("; ")}`);
      blocks.push(rep.block);
    }
    let ps: Placement[];
    try { ps = matchDeck(blocks, ctx.grade); }
    catch (err) { fail(c.id, `${profile}: matcher threw ${(err as Error).message}`); continue; }
    const again = matchDeck(blocks, ctx.grade);
    if (JSON.stringify(ps) !== JSON.stringify(again)) fail(c.id, `${profile}: matcher is not deterministic`);
    geometry(`${c.id}/${profile}`, ps);

    const splits = ps.filter(p => p.part && p.part.index === 1).length;
    const cf = ps.reduce((s, p) => s + p.copyFit.length, 0), tr = ps.reduce((s, p) => s + p.trimmed.length, 0), dr = ps.reduce((s, p) => s + p.dropped.length, 0);
    Object.assign(T, { slides: T.slides + ps.length, splits: T.splits + splits, copyFit: T.copyFit + cf, trimmed: T.trimmed + tr, dropped: T.dropped + dr });
    if (profile === "typical" || profile === "max") {
      if (cf || tr || dr) fail(c.id, `${profile}: content within prompt budgets still needed copy-fit ${cf}, trim ${tr}, drop ${dr} → ${ps.filter(p => p.copyFit.length).map(p => `${p.layoutId}:${p.copyFit.map(o => o.path).join(",")}`).join(" ")}`);
      if (splits) fail(c.id, `${profile}: content within prompt budgets was split ${splits}×`);
      ps.forEach(p => usage[p.layoutId]++);
      decks.push({ id: c.id, profile, grade: ctx.grade, script: ctx.script, placements: ps });
    }
    // variety: never the same layout three slides running when an alternative existed
    for (let i = 2; i < ps.length; i++)
      if (ps[i].layoutId === ps[i - 1].layoutId && ps[i].layoutId === ps[i - 2].layoutId && !ps[i].part)
        fail(c.id, `${profile}: ${ps[i].layoutId} used 3× in a row at slide ${i + 1}`);
    perProfile.push(`${ps.length}${splits ? ` (${splits} split)` : ""}${cf ? ` · ${cf} fit` : ""}${tr ? ` · ${tr} trim` : ""}${dr ? ` · ${dr} drop` : ""}`);
  }
  rows.push(`| ${c.id} | ${ctx.subject} | ${ctx.grade} | ${r.plan.length} planned | ${perProfile.join(" | ")} |`);

  // stress: the same sloppy output forced onto every lower grade (much tighter layouts)
  for (const g of ["primary", "middle", "secondary"] as const) {
    const raw = mockDeck(r.plan, { ...ctx, grade: "college" }, "sloppy", c.id);
    const blocks = raw.blocks.map((b: any, i: number) => repairBlock(b, r.plan[i], ctx.topic).block).filter(Boolean) as Block[];
    try {
      const ps = matchDeck(blocks.filter(b => !(g === "primary" && b.type === "code_example")), g);
      geometry(`${c.id}/stress@${g}`, ps);
      decks.push({ id: c.id, profile: "stress" as Profile, grade: g, script: ctx.script, placements: ps });
      stress.slides += ps.length; stress.splits += ps.filter(p => p.part?.index === 1).length;
      stress.copyFit += ps.reduce((s, p) => s + p.copyFit.length, 0); stress.trimmed += ps.reduce((s, p) => s + p.trimmed.length, 0);
      stress.dropped += ps.reduce((s, p) => s + p.dropped.length, 0);
      for (const p of ps) if ((p.trimmed.length || p.dropped.length) && !p.copyFit.length && !p.dropped.length) fail(c.id, `stress@${g}: trimmed without a copy-fit request`);
    } catch (err) { fail(c.id, `stress@${g}: matcher threw ${(err as Error).message}`); }
  }
}

// ── layout sweep: every layout, every grade it claims, at typical and at its own maximum ──
let sweepChecks = 0;
for (const g of ["primary", "middle", "secondary", "college"] as const) {
  for (const profile of ["typical", "max"] as const) {
    const placements: Placement[] = [];
    for (const l of LAYOUTS.filter(x => x.gradeFit.includes(g))) {
      const ctx = { grade: g, topic: "Sample topic for layout sweep", subject: "general" as const, grounding: "open" as const };
      const item = { n: 1, intent: "teach" as const, type: l.accepts, guidance: "" };
      const raw = mockBlock(item, ctx, profile, `sweep:${l.id}:${g}:${profile}`, { budget: budgetFor(l.accepts, g, l), force: l.requires ?? [] });
      const rep = repairBlock(raw, item, ctx.topic);
      sweepChecks++;
      if (!rep.block || rep.fixes.length) { fail(`sweep/${l.id}@${g}`, `${profile} content invalid: ${rep.fixes.join("; ")}`); continue; }
      const a = tryLayout(rep.block as Block, l, g);
      if (!a.ok) fail(`sweep/${l.id}@${g}`, `${profile}: layout rejects content inside its own budget → ${JSON.stringify({ missing: a.missing, capacity: a.capacity, overflows: a.overflows.map(o => `${o.path} ${o.chars}>${o.budget}`) })}`);
      else placements.push({ layoutId: l.id, block: rep.block, elements: a.els, score: 0, copyFit: a.soft, trimmed: [], dropped: [], notes: [], why: "sweep" });
      matchBlock(rep.block as Block, g); // must never throw
    }
    geometry(`sweep@${g}/${profile}`, placements);
    decks.push({ id: `sweep-${g}`, profile, grade: g, script: "latin", placements });
  }
}

mkdirSync("test/out", { recursive: true });
writeFileSync("test/out/decks.json", JSON.stringify(decks));
writeFileSync("test/out/summary.json", JSON.stringify({ cases: CORPUS.length, sweepChecks, totals, stress, failures, usage,
  corpus: CORPUS.map(c => { const r = prepareLesson(c.input); return { id: c.id, teacher: c.teacher, topic: c.input.topic, grade: c.input.grade ?? "—",
    subject: r.context.subject, band: r.context.grade, status: r.status, plan: r.status === "ready" ? r.plan.map(p => p.type) : r.questions.map(q => `asks ${q.field}`) }; }) }));
const unused = Object.entries(usage).filter(([, n]) => n === 0).map(([id]) => id);
const report = [
  `# Test run`,
  ``,
  `${CORPUS.length} university prompts × ${PROFILES.length} model behaviours, plus a sweep of ${sweepChecks} layout × grade × length combinations.`,
  ``,
  `| Case | Subject | Grade | Plan | typical | max | sloppy | broken |`,
  `|---|---|---|---|---|---|---|---|`,
  ...rows,
  ``,
  `## Totals`,
  ``,
  `| Profile | Slides | Splits | Copy-fit requests | Trimmed | Dropped items | Blocks repaired | Converted | Lost |`,
  `|---|---|---|---|---|---|---|---|---|`,
  ...PROFILES.map(p => { const t = totals[p]; return `| ${p} | ${t.slides} | ${t.splits} | ${t.copyFit} | ${t.trimmed} | ${t.dropped} | ${t.repaired} | ${t.converted} | ${t.lost} |`; }),
  `| stress (sloppy output at school grades) | ${stress.slides} | ${stress.splits} | ${stress.copyFit} | ${stress.trimmed} | ${stress.dropped} | – | – | – |`,
  ``,
  `## Layout usage (typical + max)`,
  ``,
  Object.entries(usage).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(" · "),
  ``,
  unused.length ? `Never chosen: ${unused.join(", ")}` : `Every layout was chosen at least once.`,
  ``,
  `## Failures`,
  ``,
  failures.length ? failures.map(f => `- ${f}`).join("\n") : "None.",
].join("\n");
writeFileSync("test/out/report.md", report);
console.log(report.split("## Layout usage")[0].split("## Totals")[1]);
console.log(unused.length ? `Never chosen: ${unused.join(", ")}` : "Every layout chosen at least once.");
console.log(`\n${failures.length} failure(s)`);
failures.slice(0, 60).forEach(f => console.log(" ✗ " + f));
process.exit(failures.length ? 1 : 0);
