// ─────────────────────────────────────────────────────────────
// Planner. Decides the lesson's skeleton — how many slides, which
// teaching move on each, in what order — before the LLM is called.
// The model then only writes content into a fixed plan.
// ─────────────────────────────────────────────────────────────
import type { BlockType, Intent } from "./blocks";
import type { LessonContext } from "./intent";
import { SHAPE_BLOCKS } from "./subjects";

export interface PlanItem {
  n: number;
  intent: Intent;
  type: BlockType;
  guidance: string;
  /** If the planned type doesn't genuinely fit the content, the model may use this instead. */
  fallbackType?: BlockType;
}

/** Share of body slides (after fixed open/close) per stage. */
const SPLIT: Record<LessonContext["goal"], { teach: number; apply: number; check: number }> = {
  introduce: { teach: 0.65, apply: 0.15, check: 0.2 },
  revise:    { teach: 0.5,  apply: 0.1,  check: 0.4 },
  practice:  { teach: 0.2,  apply: 0.55, check: 0.25 },
  assess:    { teach: 0,    apply: 0,    check: 1 },
};

/** Max uses per deck, so one structure doesn't dominate. */
const CAP: Partial<Record<BlockType, number>> = {
  definition: 3, vocabulary: 1, concept_map: 1, formula: 2, timeline: 2, comparison: 2, hierarchy: 2,
  cause_effect: 2, process: 3, key_fact: 2, misconception: 2, real_world: 2, code_example: 3, discussion: 2, activity: 2,
};

const GUIDE: Partial<Record<BlockType, string>> = {
  definition: "Define one key term students must know.",
  vocabulary: "3–6 key terms from this lesson with simple meanings.",
  explanation: "Explain the next sub-idea in a few clear points.",
  process: "Show the steps in order. Set isCycle only if it truly loops.",
  comparison: "Compare two or three things students confuse or must distinguish.",
  cause_effect: "Show causes leading to an event or outcome, and its effects.",
  timeline: "Key dated events in order. Only dates from the source or well-established.",
  hierarchy: "Show a classification or part–whole structure.",
  formula: "The core formula with every variable explained.",
  worked_example: "Solve one problem step by step, with the final answer.",
  key_fact: "One striking fact or question that makes students curious.",
  misconception: "A misconception students at this level commonly hold, and the correct idea.",
  real_world: "Connect the idea to something students see in daily life.",
  activity: "A short classroom activity using what was just taught.",
  discussion: "Open questions that make students think, not recall.",
  concept_map: "How the main ideas of the topic connect to one central idea.",
  code_example: "A short, runnable example (≤14 lines) that shows the idea.",
};

export function plan(ctx: LessonContext): PlanItem[] {
  const allowed = new Set(ctx.allowedBlocks);
  const ok = (t: BlockType) => allowed.has(t);
  const used: Partial<Record<BlockType, number>> = {};
  const take = (t: BlockType) => { used[t] = (used[t] ?? 0) + 1; return t; };
  const room = (t: BlockType) => ok(t) && (used[t] ?? 0) < (CAP[t] ?? Infinity);

  // ── fixed open and close ──
  const open: Omit<PlanItem, "n">[] = [{ intent: "hook", type: take("title"), guidance: "Lesson title and a short subtitle." }];
  const n = ctx.slideCount;
  if (ctx.goal === "introduce" && n >= 10)
    open.push({ intent: "hook", type: take("key_fact"), guidance: "A surprising fact or question that opens the topic.", fallbackType: "discussion" });
  if (ctx.goal !== "assess")
    open.push({ intent: "orient", type: take("objectives"), guidance: ctx.objectives.length
      ? "Restate the teacher's objectives in student-friendly words." : "2–4 things students will be able to do after this lesson." });
  const close: Omit<PlanItem, "n">[] = ctx.goal === "assess"
    ? [] : [{ intent: "close", type: take("recap"), guidance: "3–5 takeaways that match the objectives." }];

  const dividers = n >= 16 && ctx.goal !== "assess" ? 2 : 0;
  const body = Math.max(1, n - open.length - close.length - dividers);
  let split = { ...SPLIT[ctx.goal] };
  if (!ctx.include.quiz && ctx.goal !== "assess") { split = { teach: split.teach + split.check, apply: split.apply, check: 0 }; }
  let nCheck = Math.round(body * split.check);
  let nApply = Math.round(body * split.apply);
  // explicitly requested apply-stage slides always get a place
  const mustApply = (["activity", "realWorld"] as const).filter(k => ctx.requested.includes(k)).length;
  if (ctx.goal !== "assess" && nApply < mustApply) nApply = Math.min(mustApply, Math.max(0, body - nCheck - 1));
  if (ctx.goal === "assess") { nCheck = body; nApply = 0; }
  const nTeach = Math.max(0, body - nCheck - nApply);

  // ── teach sequence ──
  const teach: Omit<PlanItem, "n">[] = [];
  const push = (type: BlockType, guidance = GUIDE[type] ?? "", fallbackType?: BlockType) =>
    teach.push({ intent: "teach", type: take(type), guidance, fallbackType });

  if (nTeach > 0) {
    // weighted pool over the topic's shapes
    const pool: { type: BlockType; weight: number }[] = [];
    for (const { shape, score } of ctx.shapes)
      SHAPE_BLOCKS[shape].forEach((t, i) => { if (ok(t)) pool.push({ type: t, weight: score / (i + 1) }); });
    pool.sort((a, b) => b.weight - a.weight);
    // the structure that best expresses the topic's main shape is guaranteed a slot
    const signature = pool.find(p => p.type !== "definition" && p.type !== "explanation")?.type;

    if (ctx.goal === "revise" && room("concept_map") && nTeach >= 2) push("concept_map", "An overview of the whole topic to revise from.");
    else if (ctx.goal === "introduce" && room("definition") && nTeach >= 3) push("definition", "Define the central term of the lesson.");
    if (signature && room(signature) && teach.length < nTeach) {
      const vs = ctx.topic.match(/^(.*?)\s+(?:vs\.?|versus)\s+(.*?)(?:[:(,]|$)/i);
      const guide = signature === "comparison" && vs ? `Compare ${vs[1].trim()} and ${vs[2].trim()} (exactly these two).` : GUIDE[signature];
      push(signature, guide, "explanation");
      pool.find(p => p.type === signature)!.weight *= 0.4; pool.sort((a, b) => b.weight - a.weight);
    }
    if (ctx.include.vocabulary && room("vocabulary") && nTeach - teach.length >= 2) push("vocabulary");

    const miscAt = ctx.include.misconceptions && room("misconception") ? Math.max(teach.length, Math.floor(nTeach * 0.7)) : -1;
    while (teach.length < nTeach) {
      if (teach.length === miscAt) { push("misconception"); continue; }
      const last = teach.slice(-2).map(t => t.type);
      const pick = pool.find(p => room(p.type) && !(last.length === 2 && last.every(t => t === p.type)) && last[last.length - 1] !== p.type)
        ?? pool.find(p => room(p.type));
      if (!pick || pick.type === "explanation") { push("explanation"); continue; }
      // bump used weight down so the next pick rotates
      pick.weight *= 0.4; pool.sort((a, b) => b.weight - a.weight);
      push(pick.type, GUIDE[pick.type], "explanation");
    }
  }

  // ── apply ──
  const apply: Omit<PlanItem, "n">[] = [];
  const applyPool: BlockType[] = [];
  const quanty = ctx.shapes.some(s => ["quantitative", "skill", "computational"].includes(s.shape));
  if (ctx.requested.includes("activity") && ok("activity")) applyPool.push("activity");
  if (ctx.requested.includes("realWorld") && ok("real_world")) applyPool.push("real_world");
  if (quanty && ok("worked_example")) applyPool.push("worked_example");
  if (ctx.include.realWorld && ok("real_world") && !applyPool.includes("real_world")) applyPool.push("real_world");
  if (ctx.include.activity && ok("activity") && !applyPool.includes("activity")) applyPool.push("activity");
  if (ctx.grade !== "primary") applyPool.push("discussion");
  if (!applyPool.length) applyPool.push("explanation");
  for (let i = 0; apply.length < nApply && i < nApply * 4; i++) {
    const t = applyPool[i % applyPool.length];
    if (t === "explanation" || room(t)) apply.push({ intent: "apply", type: take(t), guidance: GUIDE[t] ?? "" });
  }
  while (apply.length < nApply) apply.push({ intent: "apply", type: "explanation", guidance: "Apply the idea to a new example." });

  // ── check: interleave as checkpoints through the teach stage ──
  const checks = Array.from({ length: nCheck }, (_, i) => ({
    intent: "check" as Intent, type: "quiz_mcq" as BlockType,
    guidance: ctx.goal === "assess" ? `Question ${i + 1} of ${nCheck}. Mix recall and application; vary difficulty.` : "",
  }));
  if (ctx.goal !== "assess" && ctx.grade !== "primary" && nCheck >= 3) {
    checks[checks.length - 1] = { intent: "check", type: take("discussion"), guidance: "One or two higher-order questions to close the check." };
  }

  let sequence: Omit<PlanItem, "n">[];
  if (ctx.goal === "assess") sequence = checks;
  else {
    // spread checks: roughly one after every k teach slides; the rest after apply
    const inline = ctx.goal === "introduce" || ctx.goal === "revise" ? Math.min(checks.length, Math.floor(teach.length / 3)) : 0;
    const every = inline ? Math.ceil(teach.length / (inline + 1)) : Infinity;
    sequence = [];
    let placed = 0, sinceCheck = 0;
    teach.forEach((t, i) => {
      sequence.push(t);
      sinceCheck++;
      if (placed < inline && (i + 1) % every === 0 && i < teach.length - 1) {
        sequence.push({ ...checks[placed], guidance: checks[placed].guidance || `Check understanding of the last ${sinceCheck} slides.` });
        placed++; sinceCheck = 0;
      }
    });
    sequence.push(...apply);
    for (const c of checks.slice(placed)) sequence.push({ ...c, guidance: c.guidance || "Check understanding of the whole lesson." });
  }

  // ── section dividers for long decks (budgeted above) ──
  const items = [...open, ...sequence, ...close];
  if (dividers) {
    const firstApply = items.findIndex(i => i.intent === "apply");
    if (firstApply > 0) items.splice(firstApply, 0, { intent: "apply", type: "section", guidance: "Section divider: putting it into practice." });
    else items.splice(items.findIndex(i => i.intent === "close"), 0, { intent: "check", type: "section", guidance: "Section divider: check your understanding." });
    const firstTeach = items.findIndex(i => i.intent === "teach");
    items.splice(firstTeach, 0, { intent: "teach", type: "section", guidance: "Section divider naming the first part of the lesson." });
  }

  return items.slice(0, n).map((it, i) => ({ ...it, n: i + 1 }));
}
