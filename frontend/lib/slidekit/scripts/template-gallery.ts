// Renders the template family to one HTML page for visual review:
// every template filled by the mock model, plus the hand-written golden decks.
//   npx tsx lib/slidekit/scripts/template-gallery.ts <out.html>
import { writeFileSync } from "node:fs";
import { matchDeck } from "../matcher";
import { repairBlock } from "../repair";
import { slideCSS, slideHTML, THEMES, customTheme } from "../render";
import { upstreamUrl } from "../meme";
import { withKnobs } from "../tokens";
import { TEMPLATES, finalDesign, prepareTemplated } from "../templates";
import { mockDeck } from "../test/mockModel";
import { GOLDEN } from "../test/golden";
import type { Block } from "../blocks";
import type { TeacherInput } from "../intent";

const out = process.argv[2] ?? "templates.html";
const SAMPLE: Record<string, TeacherInput> = {
  "concept-intro": { topic: "Democracy", grade: "Class 8", subject: "civics", notes: "add a meme" },
  "problem-solver": { topic: "Newton's second law numericals", grade: "Class 9", subject: "physics", goal: "practice", notes: "solve problems" },
  "how-it-works": { topic: "The water cycle", grade: "Class 6", subject: "science", notes: "make it fun" },
  "story-of-an-era": { topic: "The revolt of 1857", grade: "Class 8", subject: "history" },
  "compare-contrast": { topic: "Mitosis vs Meiosis", grade: "Class 11", subject: "biology" },
  "exam-revision": { topic: "Electrochemistry", grade: "Class 12", subject: "chemistry", goal: "revise", notes: "last minute exam prep" },
  "lab-activity": { topic: "Acids and bases litmus experiment", grade: "Class 7", subject: "science", notes: "hands-on activity in groups" },
  "reading-room": { topic: "The poem Daffodils analysis", grade: "Class 9", subject: "english_literature" },
  "code-lab": { topic: "Python for loops", grade: "BCA", subject: "computer_science" },
  "quiz-round": { topic: "Fractions quiz round", grade: "Class 5", subject: "mathematics", goal: "assess" },
};

function build(input: TeacherInput, blocksFor: (plan: any, ctx: any) => unknown[]) {
  const prep = prepareTemplated(input);
  if (prep.status !== "ready") throw new Error("not ready");
  const raw = blocksFor(prep.plan, prep.context);
  const blocks = raw.map((b, i) => repairBlock(b, prep.plan[i], prep.context.topic).block).filter(Boolean) as Block[];
  const design = finalDesign(prep, blocks);
  const placements = withKnobs(design.knobs, () => matchDeck(blocks, prep.context.grade));
  for (const p of placements) for (const e of p.elements) if (e.t === "picture") e.src = upstreamUrl(e.template, e.lines, 900);
  const theme = design.themeId ? THEMES[design.themeId].theme : design.custom ? customTheme(design.custom.accent, design.custom.dark) : THEMES.paper.theme;
  return { prep, design, placements, theme };
}

const sections: string[] = [];
const css = new Set<string>();
const render = (title: string, sub: string, r: ReturnType<typeof build>) => {
  const scoped = slideCSS(r.theme).replace(/\.slide/g, `.t${sections.length} .slide`);
  css.add(scoped);
  sections.push(`<section class="t${sections.length}"><h2>${title}</h2><p>${sub}</p><div class="grid">${r.placements.map((p, i) =>
    `<figure><div class="frame"><div class="in">${slideHTML(p, "", r.theme, { skin: r.design.skin, index: i, total: r.placements.length, deckTitle: r.prep.context.topic })}</div></div><figcaption>${i + 1} · ${p.layoutId}</figcaption></figure>`).join("")}</div></section>`);
};

for (const g of GOLDEN) {
  const r = build(g.input, () => g.blocks);
  render(`Golden · ${r.prep.template.name}`, `hand-written · skin ${r.design.skin} · theme ${r.design.themeId ?? "custom"} · ${r.design.applied.map(a => a.id).join(", ")}`, r);
}
for (const t of TEMPLATES) {
  const r = build(SAMPLE[t.id], (plan, ctx) => mockDeck(plan, ctx, "typical", t.id).blocks);
  render(`Mock · ${t.name}`, `${r.prep.template.id} (${r.prep.template.how}) · skin ${r.design.skin} · theme ${r.design.themeId ?? "custom"} · ${r.design.applied.map(a => a.id).join(", ")}`, r);
}

writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><title>Template gallery</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<style>body{font:14px Arial;margin:24px;background:#eef2f6;color:#16243a}h2{margin:28px 0 2px}p{margin:0 0 10px;color:#5a6b82}
.grid{display:grid;grid-template-columns:repeat(4,480px);gap:14px}.frame{width:480px;height:270px;position:relative;overflow:hidden;border:1px solid #cbd5e1;border-radius:6px}
.in{width:1920px;height:1080px;transform:scale(.25);transform-origin:0 0}figcaption{font-size:11px;color:#5a6b82;margin-top:3px}
${[...css].join("\n")}</style></head><body>${sections.join("")}
<script>document.querySelectorAll('.fx').forEach(el=>{const t=el.dataset.latex;if(window.katex&&t){el.innerHTML=katex.renderToString(t,{output:'mathml',throwOnError:false,displayMode:true});}});</script></body></html>`);
console.log(`wrote ${out}`);
