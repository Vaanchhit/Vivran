// The landing page's Try it must turn typos into the right topic and give junk nothing.
//   npx tsx lib/slidekit/test/try-topics.ts
import { TRY_TOPICS, isBlocked, matchTopics } from "../try-topics";
import { prepareTemplated } from "../templates";
const fails: string[] = [];
const top = (q: string) => matchTopics(q)[0]?.topic.topic ?? null;
const expect: [string, string | null][] = [
  ["fotosynthesis", "Photosynthesis"], ["photosynthsis for class 7", "Photosynthesis"], ["mitosis meosis", "Mitosis vs meiosis"],
  ["newtons law", "Newton's laws of motion"], ["pythagorus", "Pythagoras theorem"], ["quadratic eqn", "Quadratic equations"],
  ["french revolutoin", "The French Revolution"], ["python loop", "Python for loops"], ["demand suply", "Demand and supply"],
  ["trignometry", "Trigonometry basics"], ["ww2", "World War II"], ["the heart", "The human heart"],
  ["lol bro", null], ["asdfgh", null], ["wassup bro", null], ["xyz", null], ["ok", null],
];
for (const [q, want] of expect) if (top(q) !== want) fails.push(`"${q}" → ${top(q)}, expected ${want}`);
for (const q of ["fuck this", "wtf is this shit", "bc mc"]) if (!isBlocked(q)) fails.push(`"${q}" not blocked`);
for (const q of ["Photosynthesis", "Bank reconciliation"]) if (isBlocked(q)) fails.push(`"${q}" wrongly blocked`);
const ids = new Set<string>();
for (const t of TRY_TOPICS) {
  if (ids.has(t.id)) fails.push(`duplicate id ${t.id}`); ids.add(t.id);
  for (const l of t.levels) {
    const r = prepareTemplated({ topic: t.topic, grade: l, subject: t.subject });
    if (r.status !== "ready") fails.push(`${t.topic} @ ${l}: ${r.status}`);
  }
}
console.log(`${TRY_TOPICS.length} topics, ${fails.length} failure(s)`); fails.forEach(f => console.log("  ✗", f));
if (fails.length) process.exit(1);
