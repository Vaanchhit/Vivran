// Builds test/out/audit.html: every typical/max/sweep slide, for the browser audit.
import { readFileSync, writeFileSync } from "node:fs";
import type { Placement } from "../matcher";
import { slideHTML, SLIDE_CSS } from "./render";
const decks: { id: string; profile: string; grade: string; script: string; placements: Placement[] }[] = JSON.parse(readFileSync("test/out/decks.json", "utf8"));
const latin = decks.filter(d => d.script === "latin");
const slides = latin.flatMap(d => d.placements.map((p, i) => slideHTML(p, `${d.id}/${d.profile}@${d.grade}#${i + 1}`)));
writeFileSync("test/out/audit.html", `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}${SLIDE_CSS}.slide{content-visibility:visible}</style></head><body>${slides.join("\n")}</body></html>`);
console.log(`${slides.length} slides from ${latin.length} decks (${decks.length - latin.length} non-Latin decks skipped: no Indic fonts in this sandbox)`);
