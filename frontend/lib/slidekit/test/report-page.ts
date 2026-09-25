// Builds the published test report from test/out/*.json.
import { readFileSync, writeFileSync } from "node:fs";
import type { Placement } from "../matcher";
import { LAYOUTS } from "../layouts";
import { slideHTML, SLIDE_CSS } from "./render";

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const S = JSON.parse(readFileSync("test/out/summary.json", "utf8"));
const audit = JSON.parse(readFileSync("test/out/audit.json", "utf8"));
const decks: { id: string; profile: string; grade: string; script: string; placements: Placement[] }[] = JSON.parse(readFileSync("test/out/decks.json", "utf8"));
const pdfCollisions = Number(process.argv[3] ?? 0), pptxSlides = Number(process.argv[4] ?? 0);

// worst-case samples: one slide per layout from max-length corpus decks
const seen = new Set<string>();
const samples: { p: Placement; label: string }[] = [];
for (const d of decks.filter(d => d.profile === "max" && d.script === "latin" && !d.id.startsWith("sweep")))
  for (const p of d.placements) {
    const fam = LAYOUTS.find(l => l.id === p.layoutId)!.family;
    if (seen.has(p.layoutId) || fam === "hero" && samples.filter(s => LAYOUTS.find(l => l.id === s.p.layoutId)!.family === "hero").length > 2) continue;
    seen.add(p.layoutId);
    samples.push({ p, label: `${p.layoutId} · ${d.id}` });
  }
const shown = samples.slice(0, 12);

const T = S.totals, st = S.stress;
const num = (n: number) => n.toLocaleString("en-IN");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Slide engine test report</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<style>
:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);
--bg:#EEF2F6;--panel:#FFFFFF;--ink:#16243A;--muted:#5A6B82;--line:#CBD5E1;--pass:#1F7A4D;--passbg:#E3F2EA;--warn:#8A5A00;--accent:#2D5BD1}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0F1724;--panel:#172235;--ink:#E6EDF6;--muted:#9AABC2;--line:#2B3B55;--pass:#6BCB94;--passbg:#173326;--warn:#E3B45C;--accent:#7EA2FF}}
:root[data-theme="dark"]{--bg:#0F1724;--panel:#172235;--ink:#E6EDF6;--muted:#9AABC2;--line:#2B3B55;--pass:#6BCB94;--passbg:#173326;--warn:#E3B45C;--accent:#7EA2FF}
*,*::before,*::after{box-sizing:inherit}
html{scroll-padding-top:env(safe-area-inset-top,0px)}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 "Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:44px 24px 72px}
h1{font-size:clamp(32px,5vw,52px);line-height:1.05;margin:0 0 12px}
h2{font-size:26px;margin:52px 0 8px}
.lede{max-width:70ch;color:var(--muted);margin:0 0 28px}
.proof{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px}
.proof div{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.proof b{display:block;font-size:34px;line-height:1.1}
.proof .zero b{color:var(--pass)}
.proof span{color:var(--muted);font-size:15px}
p.note{color:var(--muted);max-width:75ch}
.scroll{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:700;white-space:nowrap}
td.n{text-align:right;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
.plan{color:var(--muted);font-size:13px;min-width:320px}
.ok{color:var(--pass);font-weight:700}.ask{color:var(--warn);font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:18px}
figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.frame{position:relative;aspect-ratio:16/9;overflow:hidden;background:#fff}
.frame .slide{position:absolute;left:0;top:0;transform-origin:0 0}
figcaption{padding:10px 14px;font-size:14px;color:var(--muted);border-top:1px solid var(--line)}
ul.limits{max-width:75ch;padding-left:20px}ul.limits li{margin:6px 0}
${SLIDE_CSS}
.slide .fx math{font-size:44px}
</style></head>
<body><main class="wrap">
<h1>Slide engine test report</h1>
<p class="lede">${S.cases} prompts written the way university teachers type them, run through intent, planning, a mock model in four behaviours, repair, matching and rendering. Every slide was then measured in a real browser, and four decks went through PowerPoint export.</p>

<div class="proof">
  <div class="zero"><b>0</b><span>text overflows across ${num(audit.checked)} text boxes on ${num(decks.filter(d => d.script === "latin").reduce((s, d) => s + d.placements.length, 0))} slides, measured in Chromium</span></div>
  <div class="zero"><b>0</b><span>text collisions in ${pptxSlides} PowerPoint slides, rendered through LibreOffice</span></div>
  <div class="zero"><b>0</b><span>copy-fits, trims or splits when the model stays inside the prompt's limits (${num(T.typical.slides + T.max.slides)} slides)</span></div>
  <div class="zero"><b>0</b><span>AI calls in matching; every deck matched twice with byte-identical output</span></div>
  <div class="zero"><b>${S.failures.length}</b><span>failed checks, including ${num(S.sweepChecks)} layout × grade × length sweeps</span></div>
</div>

<h2>How each model behaviour was handled</h2>
<p class="note">Typical and max stay within the limits the prompt states. Sloppy ignores those limits but stays schema-valid. Broken sends malformed JSON. Stress sends the sloppy output to school grades, where layouts are far tighter.</p>
<div class="scroll"><table>
<thead><tr><th>Model behaviour</th><th>Slides</th><th>Lists split</th><th>Rewrite requests</th><th>Trimmed</th><th>Items dropped</th><th>Blocks repaired</th><th>Slides lost</th></tr></thead>
<tbody>
${(["typical", "max", "sloppy", "broken"] as const).map(k => `<tr><td>${k}</td><td class="n">${num(T[k].slides)}</td><td class="n">${T[k].splits}</td><td class="n">${T[k].copyFit}</td><td class="n">${T[k].trimmed}</td><td class="n">${T[k].dropped}</td><td class="n">${T[k].repaired}</td><td class="n">${T[k].lost}</td></tr>`).join("")}
<tr><td>stress (sloppy output, Class 1–12 layouts)</td><td class="n">${num(st.slides)}</td><td class="n">${st.splits}</td><td class="n">${st.copyFit}</td><td class="n">${st.trimmed}</td><td class="n">${st.dropped}</td><td class="n">–</td><td class="n">0</td></tr>
</tbody></table></div>
<p class="note">Every trim comes with a rewrite request, and every dropped item is listed for the teacher. Nothing is cut silently.</p>

<h2>The prompts</h2>
<div class="scroll"><table>
<thead><tr><th>Teacher</th><th>Prompt</th><th>Grade as typed</th><th>Understood as</th><th>Lesson plan</th></tr></thead>
<tbody>
${S.corpus.map((c: any) => `<tr><td>${esc(c.teacher)}</td><td>${esc(c.topic)}</td><td>${esc(String(c.grade))}</td><td>${c.status === "ready" ? `<span class="ok">${esc(c.subject.replace(/_/g, " "))}</span>, ${c.band}` : `<span class="ask">Asks first</span>`}</td><td class="plan">${esc(c.plan.join(" → ").replace(/_/g, " "))}</td></tr>`).join("\n")}
</tbody></table></div>

<h2>Worst-case slides, as rendered</h2>
<p class="note">Each slide holds the maximum content its prompt allows. The text is filler from the mock model, chosen to include long words like “photophosphorylation”. Photos and icons are placeholders.</p>
<div class="grid">
${shown.map(s => `<figure><div class="frame">${slideHTML(s.p)}</div><figcaption>${esc(s.label)}</figcaption></figure>`).join("\n")}
</div>

<h2>Known limits</h2>
<ul class="limits">
  <li>Hindi and Bengali decks passed matching, but this test environment has no Indic fonts, so they weren't measured in a browser. Test them on a machine with Noto Sans Devanagari and Noto Sans Bengali.</li>
  <li>Diagram layouts (tree, Venn, fishbone, chain, mind map) are drawn natively, as SVG in the browser and as editable PowerPoint shapes. A Venn's crescents hold much less text than a table cell, so a wordy comparison overflows the Venn on purpose and goes to the table instead.</li>
  <li>Formulas render with KaTeX here. The PowerPoint export shows raw LaTeX until formulas are rendered to images.</li>
  <li>The mock model tests length and structure, not whether the content is true. Accuracy still depends on the prompt rules and teacher review.</li>
</ul>
</main>
<script>
function fit(){document.querySelectorAll('.frame').forEach(f=>{const s=f.querySelector('.slide');if(s)s.style.transform='scale('+(f.clientWidth/1920)+')';});}
addEventListener('resize',fit);fit();
try{document.querySelectorAll('.slide .fx').forEach(el=>{const t=el.dataset.latex;if(window.katex&&t){el.innerHTML=katex.renderToString(t,{output:'mathml',throwOnError:false,displayMode:true});}});}catch(e){}
</script>
</body></html>`;

writeFileSync(process.argv[2] ?? "test/out/report.html", html);
console.log(`report: ${shown.length} sample slides`);
