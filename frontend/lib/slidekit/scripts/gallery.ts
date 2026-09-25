// Draws every layout straight from its spec, so the gallery can't drift from the code.
import { writeFileSync } from "node:fs";
import { BLOCK_TYPES } from "../blocks";
import { LAYOUTS, type LayoutSpec, type Slot } from "../layouts";
import { CANVAS, GRID, SAFE, areaToBox, itemBoxes, type Box } from "../tokens";
import { verifyLibrary } from "../verify";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const KIND_CLASS: Record<Slot["kind"], string> = {
  text: "k-text", repeat: "k-rep", table: "k-rep", image: "k-img", icon: "k-img",
  formula: "k-math", code: "k-math", diagram: "k-dia", meta: "k-text",
};

function label(b: Box, t: string, size = 46) {
  return `<text x="${b.x + 18}" y="${b.y + size + 12}" font-size="${size}" font-weight="700">${esc(t)}</text>`;
}
function rect(b: Box, cls: string, r = 14) {
  return `<rect class="${cls}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${r}"/>`;
}

function drawSlot(s: Slot, l: LayoutSpec): string {
  const box = areaToBox(s.area);
  const cls = KIND_CLASS[s.kind];
  const opt = s.optional ? " opt" : "";
  if (s.kind === "repeat") {
    const [lo, hi] = l.capacity[s.bind] ?? [3, 3];
    const n = Math.max(lo, Math.min(hi, 8));
    const inner = s.label ? { ...box, y: box.y + 44, h: box.h - 44 } : box;
    const items = itemBoxes(inner, s.arrange, n, s.cols);
    let out = s.label ? `<text class="cap" x="${box.x}" y="${box.y + 32}" font-size="30">${esc(s.label)}</text>` : "";
    if (s.arrange === "axis-h") { const y = inner.y + inner.h / 2; out += `<line class="axis" x1="${inner.x}" y1="${y}" x2="${inner.x + inner.w}" y2="${y}"/>`; }
    if (s.arrange === "axis-v") out += `<line class="axis" x1="${inner.x + 110}" y1="${inner.y}" x2="${inner.x + 110}" y2="${inner.y + inner.h}"/>`;
    if (s.arrange === "radial") out += `<ellipse class="axis" cx="${inner.x + inner.w / 2}" cy="${inner.y + inner.h / 2}" rx="${inner.w / 2 - 210}" ry="${inner.h / 2 - 120}"/>`;
    items.forEach((it, i) => {
      out += rect(it, cls + opt, s.card ? 16 : 6);
      const nx = items[i + 1];
      if (s.connector === "arrow" && nx && Math.abs(nx.y - it.y) < 1) {
        const y = it.y + it.h / 2, x1 = it.x + it.w + 2, x2 = nx.x - 2;
        out += `<path class="arr" d="M${x1} ${y}L${x2} ${y}M${x2 - 10} ${y - 9}L${x2} ${y}L${x2 - 10} ${y + 9}"/>`;
      }
      if (s.marker && s.marker !== "none") {
        const m = s.marker === "number" ? String(i + 1) : s.marker === "letter" ? "ABCD"[i] ?? "" : s.marker === "check" ? "✓" : "•";
        out += `<circle class="mk" cx="${it.x + 34}" cy="${it.y + 34}" r="22"/><text class="mkt" x="${it.x + 34}" y="${it.y + 44}" font-size="28" text-anchor="middle">${m}</text>`;
      }
      if (i === 0) out += label({ ...it, x: it.x + (s.marker && s.marker !== "none" ? 60 : 0) }, s.fields.map(f => f.bind === "." ? s.bind : f.bind).join(" + "), 40);
    });
    return out;
  }
  if (s.kind === "table") {
    const cols = (l.capacity[s.header]?.[1] ?? 2) + (s.mode === "table" ? 1 : 0);
    const rows = (l.capacity[s.bind]?.[1] ?? 4) + 1;
    let out = rect(box, cls, 10);
    for (let c = 1; c < cols; c++) { const x = box.x + (box.w / cols) * c; out += `<line class="grid-l" x1="${x}" y1="${box.y}" x2="${x}" y2="${box.y + box.h}"/>`; }
    for (let r = 1; r < rows; r++) { const y = box.y + (box.h / rows) * r; out += `<line class="grid-l" x1="${box.x}" y1="${y}" x2="${box.x + box.w}" y2="${y}"/>`; }
    return out + label(box, `${s.mode === "table" ? "table" : "columns"}: ${s.header} × ${s.bind}`, 40);
  }
  if (s.kind === "diagram") return rect(box, cls, 18) + label(box, `${s.diagram} diagram`);
  if (s.kind === "image") return rect(box, cls + opt, 12) +
    `<path class="x" d="M${box.x} ${box.y}L${box.x + box.w} ${box.y + box.h}M${box.x + box.w} ${box.y}L${box.x} ${box.y + box.h}"/>` + label(box, "photo");
  if (s.kind === "icon") return rect(box, cls + opt, 12) + label(box, "icon");
  if (s.kind === "formula") return rect(box, cls, 12) + label(box, "formula (KaTeX)");
  if (s.kind === "code") return rect(box, cls, 12) + label(box, `code ≤${s.maxLines} lines`);
  if (s.kind === "meta") return rect(box, cls, 30) + label(box, "time + grouping", 36);
  // text
  const t = s as Extract<Slot, { kind: "text" }>;
  const tone = t.tone && t.tone !== "neutral" ? ` t-${t.tone}` : "";
  return rect(box, cls + opt + tone, t.card ? 16 : 6) + label(box, `${t.label ? t.label + ": " : ""}${t.bind} · ≤${t.maxChars}`, box.h < 100 ? 40 : 46);
}

function svg(l: LayoutSpec): string {
  let guides = "";
  for (let c = 0; c < GRID.cols; c++) { const b = areaToBox({ c, cs: 1, r: 0, rs: GRID.rows }); guides += `<rect class="col" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`; }
  const bg = l.slots.filter(s => s.layer === "bg").map(s => drawSlot(s, l)).join("");
  const fg = l.slots.filter(s => s.layer !== "bg").map(s => drawSlot(s, l)).join("");
  return `<svg viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" role="img" aria-label="Wireframe of ${esc(l.id)}">
<rect class="slide" width="${CANVAS.w}" height="${CANVAS.h}"/>${guides}
<rect class="safe" x="${SAFE.x}" y="${SAFE.y}" width="${SAFE.w}" height="${SAFE.h}"/>${bg}${fg}</svg>`;
}

const issues = verifyLibrary();
const typeName = (t: string) => t.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());

const sections = BLOCK_TYPES.map(t => {
  const ls = LAYOUTS.filter(l => l.accepts === t);
  return `<section id="${t}"><h2>${typeName(t)} <span>${ls.length}</span></h2><div class="cards">${ls.map(l => `
  <article class="card" data-grades="${l.gradeFit.join(" ")}">
    ${svg(l)}
    <div class="meta">
      <h3>${esc(l.id)}${l.fallback ? ' <em title="Guaranteed-safe layout for this type">fallback</em>' : ""}</h3>
      <p>${esc(l.description)}</p>
      <dl>
        <div><dt>Family</dt><dd>${l.family}</dd></div>
        <div><dt>Density</dt><dd>${l.density}</dd></div>
        ${Object.entries(l.capacity).map(([k, [a, b]]) => `<div><dt>${esc(k)}</dt><dd>${a === b ? a : `${a}–${b}`}</dd></div>`).join("")}
        ${l.requires?.length ? `<div><dt>Needs</dt><dd>${l.requires.join(", ")}</dd></div>` : ""}
        <div><dt>Grades</dt><dd>${l.gradeFit.length === 4 ? "all" : l.gradeFit.join(", ")}</dd></div>
      </dl>
    </div>
  </article>`).join("")}</div></section>`;
}).join("\n");

const nav = BLOCK_TYPES.map(t => `<a href="#${t}">${typeName(t)}</a>`).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Slide layout library</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);
--bg:#EEF2F6;--panel:#FFFFFF;--ink:#16243A;--muted:#5A6B82;--line:#CBD5E1;--slide:#FFFFFF;--guide:#EAF0F7;
--text-f:#E4ECF8;--text-s:#4A6FA5;--rep-f:#E5F1E2;--rep-s:#4F8A4A;--img-f:#F5EADC;--img-s:#A8703C;
--math-f:#FFF4CC;--math-s:#A88A12;--dia-f:#EDE6F6;--dia-s:#7453A3;--pos:#2F8F5B;--neg:#C2463E;--accent:#2D5BD1}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0F1724;--panel:#172235;--ink:#E6EDF6;--muted:#9AABC2;--line:#2B3B55;--slide:#1D2A40;--guide:#223350;
--text-f:#22375A;--text-s:#7FA3DB;--rep-f:#223D2A;--rep-s:#83C27C;--img-f:#3E2F20;--img-s:#D9A26E;--math-f:#3D3615;--math-s:#E0C34F;--dia-f:#33284A;--dia-s:#B79AE3;--pos:#5CC48B;--neg:#F07F77;--accent:#7EA2FF}}
:root[data-theme="dark"]{--bg:#0F1724;--panel:#172235;--ink:#E6EDF6;--muted:#9AABC2;--line:#2B3B55;--slide:#1D2A40;--guide:#223350;
--text-f:#22375A;--text-s:#7FA3DB;--rep-f:#223D2A;--rep-s:#83C27C;--img-f:#3E2F20;--img-s:#D9A26E;--math-f:#3D3615;--math-s:#E0C34F;--dia-f:#33284A;--dia-s:#B79AE3;--pos:#5CC48B;--neg:#F07F77;--accent:#7EA2FF}
*,*::before,*::after{box-sizing:inherit}
html{scroll-padding-top:calc(env(safe-area-inset-top,0px) + 120px)}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 "Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",sans-serif}
header{max-width:1320px;margin:0 auto;padding:48px 24px 8px}
h1{font-size:clamp(34px,5vw,56px);line-height:1.05;margin:0 0 12px;letter-spacing:-.01em}
.lede{max-width:68ch;color:var(--muted);margin:0 0 20px}
.status{display:inline-block;padding:6px 14px;border-radius:999px;border:1.5px solid ${issues.length ? "var(--neg)" : "var(--pos)"};color:${issues.length ? "var(--neg)" : "var(--pos)"};font-weight:700;font-size:15px}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.bar-in{max-width:1320px;margin:0 auto;padding:12px 24px;display:flex;flex-direction:column;gap:10px}
.grades{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.grades span{color:var(--muted);font-size:15px;margin-right:4px}
.grades button{font:inherit;font-size:15px;padding:6px 14px;border-radius:999px;border:1.5px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
.grades button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.grades button:focus-visible,nav a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
nav{display:flex;gap:6px 16px;overflow-x:auto;padding-bottom:2px;scrollbar-width:thin}
nav a{color:var(--muted);text-decoration:none;white-space:nowrap;font-size:15px}
nav a:hover{color:var(--ink)}
.key{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:14px;color:var(--muted);max-width:1320px;margin:0 auto;padding:16px 24px 0}
.key i{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:6px;border:2px solid}
main{max-width:1320px;margin:0 auto;padding:8px 24px 64px}
section{padding-top:36px}
h2{font-size:26px;margin:0 0 14px;display:flex;align-items:baseline;gap:10px}
h2 span{font-size:16px;color:var(--muted);font-weight:400}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr));gap:20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;transition:opacity .2s}
.card.dim{opacity:.28}
.card svg{display:block;width:100%;height:auto;border-bottom:1px solid var(--line)}
.meta{padding:14px 16px 16px}
h3{margin:0 0 4px;font-size:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
h3 em{font-style:normal;font-size:13px;font-weight:700;color:var(--pos);border:1.5px solid var(--pos);border-radius:6px;padding:0 7px}
.meta p{margin:0 0 10px;color:var(--muted);font-size:15px}
dl{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0;font-size:14px}
dl div{display:flex;gap:5px}dt{color:var(--muted)}dd{margin:0;font-weight:700}
svg text{font-family:"Atkinson Hyperlegible",system-ui,sans-serif;fill:var(--ink)}
.slide{fill:var(--slide)}.col{fill:var(--guide);opacity:.55}.arr{fill:none;stroke:var(--rep-s);stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.safe{fill:none;stroke:var(--line);stroke-width:3;stroke-dasharray:14 10}
.k-text{fill:var(--text-f);stroke:var(--text-s);stroke-width:3}.k-rep{fill:var(--rep-f);stroke:var(--rep-s);stroke-width:3}
.k-img{fill:var(--img-f);stroke:var(--img-s);stroke-width:3}.k-math{fill:var(--math-f);stroke:var(--math-s);stroke-width:3}
.k-dia{fill:var(--dia-f);stroke:var(--dia-s);stroke-width:3}
.opt{stroke-dasharray:12 8}.t-positive{stroke:var(--pos);stroke-width:5}.t-negative{stroke:var(--neg);stroke-width:5}.t-accent{stroke:var(--accent);stroke-width:5}
.x{stroke:var(--img-s);stroke-width:2;opacity:.45}.axis{fill:none;stroke:var(--muted);stroke-width:4;stroke-dasharray:4 10}
.grid-l{stroke:var(--rep-s);stroke-width:2;opacity:.6}.mk{fill:var(--ink)}.mkt{fill:var(--slide)!important;font-weight:700}
.cap{fill:var(--muted)!important;font-weight:700}
@media (prefers-reduced-motion:reduce){.card{transition:none}}
</style></head>
<body>
<header>
  <h1>Slide layout library</h1>
  <p class="lede">${LAYOUTS.length} layouts across ${BLOCK_TYPES.length} content types, drawn directly from the layout specs on a 12-column grid. Dashed boxes are optional; the dashed outline is the safe area.</p>
  <span class="status">${issues.length ? `${issues.length} fit issue(s) found` : "Every layout fits its content at each grade it's marked for"}</span>
</header>
<div class="bar"><div class="bar-in">
  <div class="grades" role="group" aria-label="Filter by grade"><span>Show layouts for</span>
    ${["all", "primary", "middle", "secondary", "college"].map((g, i) => `<button type="button" data-g="${g}" aria-pressed="${i === 0}">${g === "all" ? "All grades" : g[0].toUpperCase() + g.slice(1)}</button>`).join("")}
  </div>
  <nav aria-label="Content types">${nav}</nav>
</div></div>
<div class="key">
  <span><i style="background:var(--text-f);border-color:var(--text-s)"></i>Text</span>
  <span><i style="background:var(--rep-f);border-color:var(--rep-s)"></i>Repeated items / table</span>
  <span><i style="background:var(--img-f);border-color:var(--img-s)"></i>Photo / icon</span>
  <span><i style="background:var(--math-f);border-color:var(--math-s)"></i>Formula / code</span>
  <span><i style="background:var(--dia-f);border-color:var(--dia-s)"></i>Natively drawn diagram</span>
</div>
<main>${sections}</main>
<script>
document.querySelectorAll('.grades button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.grades button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  const g=b.dataset.g;
  document.querySelectorAll('.card').forEach(c=>c.classList.toggle('dim',g!=='all'&&!c.dataset.grades.split(' ').includes(g)));
}));
</script>
</body></html>`;

const out = process.argv[2] ?? "gallery.html";
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB), ${issues.length} issues`);
