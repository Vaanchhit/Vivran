// QA for the designer export: golden decks + mock decks that cover every block type.
//   NODE_PATH=../tools/showcase/node_modules npx tsx lib/slidekit/scripts/designer-qa.ts <outdir>
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DESIGNS, designFor, exportDesigned } from "../designer";
import { finalDesign, prepareTemplated } from "../templates";
import { repairBlock } from "../repair";
import { matchDeck } from "../matcher";
import { withKnobs } from "../tokens";
import { GOLDEN } from "../test/golden";
import { mockDeck } from "../test/mockModel";
import type { Block } from "../blocks";
import type { TeacherInput } from "../intent";

const req = createRequire(process.env.NODE_PATH + "/x.js");
const sharp = req("sharp"), React = req("react"), { renderToStaticMarkup } = req("react-dom/server"), fa = req("react-icons/fa6");
const MAP: Record<string, string> = { target: "FaBullseye", check: "FaCheck", bulb: "FaLightbulb", book: "FaBookOpen", arrow: "FaArrowRight", x: "FaXmark", people: "FaUsers", globe: "FaEarthAsia", layers: "FaLayerGroup", clock: "FaClock" };
const icon = async (name: string, color: string) => {
  const svg = renderToStaticMarkup(React.createElement(fa[MAP[name]], { color: "#" + color, size: 256 }));
  return "image/png;base64," + (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
};

const out = process.argv[2];
const runs: { id: string; input: TeacherInput; blocks?: Record<string, unknown>[] }[] = [
  ...GOLDEN.map((g, i) => ({ id: `golden-${i}`, input: g.input, blocks: g.blocks })),
  { id: "mock-history", input: { topic: "The revolt of 1857", grade: "Class 8", subject: "history" } },
  { id: "mock-compare", input: { topic: "Mitosis vs Meiosis", grade: "Class 11", subject: "biology" } },
  { id: "mock-code", input: { topic: "Python for loops", grade: "BCA", subject: "Computer Science" } },
  { id: "mock-revision", input: { topic: "Electrochemistry", grade: "Class 12", subject: "chemistry", goal: "revise", notes: "last minute exam prep" } },
  { id: "mock-derivation", input: { topic: "Derive the equations of motion", grade: "Class 11", subject: "physics" } },
  { id: "mock-lab", input: { topic: "Acids and bases litmus experiment", grade: "Class 7", subject: "science", notes: "hands-on activity in groups" } },
];
(async () => {
  for (const r of runs) {
    const prep = prepareTemplated(r.input);
    if (prep.status !== "ready") continue;
    const raw = r.blocks ?? mockDeck(prep.plan, prep.context, "typical", r.id).blocks;
    const blocks = raw.map((b, i) => repairBlock(b, prep.plan[i], prep.context.topic).block).filter(Boolean) as Block[];
    const placements = withKnobs(finalDesign(prep, blocks).knobs, () => matchDeck(blocks, prep.context.grade));
    const meta = { title: prep.context.topic, level: prep.context.gradeLabel, subject: prep.context.subject.replace(/_/g, " ") };
    const buf = await exportDesigned(placements, meta, designFor(meta.subject), { icon });
    writeFileSync(`${out}/${r.id}.pptx`, Buffer.from(buf as ArrayBuffer));
    console.log(r.id, designFor(meta.subject).id, placements.map((p) => p.block.type).join(","));
  }
  console.log("designs:", Object.keys(DESIGNS).join(", "));
})();
