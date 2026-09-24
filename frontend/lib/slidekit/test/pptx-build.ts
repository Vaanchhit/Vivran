import { readFileSync } from "node:fs";
import { exportPptx } from "./pptx";
const decks = JSON.parse(readFileSync("test/out/decks.json", "utf8"));
const out = process.argv[2] ?? "test/out";
for (const [id, profile] of [["fin-capm", "typical"], ["hist-swadeshi", "typical"], ["cs-recursion", "typical"], ["sweep-college", "max"]]) {
  const d = decks.find((x: any) => x.id === id && x.profile === profile);
  await exportPptx(d.placements, id, `${out}/${id}-${profile}.pptx`);
  console.log(`${id}: ${d.placements.length} slides`);
}
