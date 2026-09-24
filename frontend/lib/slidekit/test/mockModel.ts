// ─────────────────────────────────────────────────────────────
// Mock model. Stands in for the free-tier LLM so tests are
// repeatable and free. Four behaviours:
//   typical — obeys the prompt, medium lengths
//   max     — obeys the prompt exactly at every limit (worst legal case)
//   sloppy  — ignores the prompt budgets but stays schema-valid
//   broken  — malformed JSON values a real small model produces
// ─────────────────────────────────────────────────────────────
import { Blocks, type BlockType } from "../blocks";
import { budgetFor, type Budget } from "../budgets";
import type { LessonContext } from "../intent";
import type { PlanItem } from "../planner";

export type Profile = "typical" | "max" | "sloppy" | "broken";

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

const WORDS = ("the of a to and in is that for on as with by it are from this be at an which can was when rate cost risk value market firm model price demand supply return capital theory effect change process system structure function energy pressure flow cell reaction bond state law court right duty contract offer notice evidence policy growth output income debt equity asset liability interest period cash flow measure sample mean error test student lesson example because therefore however increases decreases depends relation between each other result condition").split(" ");
const LONG = ["heteroskedasticity", "photophosphorylation", "internationalisation", "electroencephalogram", "constitutionality", "multicollinearity", "decarboxylation", "counterintuitively", "characterisation", "intergovernmental"];

function makeText(max: number, fill: number, r: () => number, topicWords: string[]): string {
  const target = Math.max(1, Math.floor(max * fill));
  const pool = [...WORDS, ...topicWords, ...topicWords];
  let out = "";
  let guard = 0;
  while (guard++ < 400) {
    const w = r() < 0.06 ? LONG[Math.floor(r() * LONG.length)] : pool[Math.floor(r() * pool.length)];
    const next = out ? `${out} ${w}` : w;
    if (next.length > target) break;
    out = next;
  }
  if (!out) out = pool[0].slice(0, target);
  return out[0].toUpperCase() + out.slice(1);
}

const LATEX: Record<string, string[]> = {
  finance: ["E(R_i) = R_f + \\beta_i\\,(E(R_m) - R_f)", "C = S_0 N(d_1) - K e^{-rT} N(d_2)", "WACC = \\frac{E}{V}R_e + \\frac{D}{V}R_d(1-T_c)"],
  engineering: ["P_1 + \\tfrac{1}{2}\\rho v_1^2 + \\rho g h_1 = P_2 + \\tfrac{1}{2}\\rho v_2^2 + \\rho g h_2", "\\sum_k I_k = 0", "\\sum_k V_k = 0"],
  mathematics: ["t = \\frac{\\bar{x} - \\mu_0}{s/\\sqrt{n}}", "z = \\frac{\\bar{x} - \\mu_0}{\\sigma/\\sqrt{n}}"],
  default: ["Y = C + I + G", "k = \\frac{1}{1 - MPC}", "E_d = \\frac{\\%\\Delta Q}{\\%\\Delta P}"],
};

const CODE = `def factorial(n):
    """Return n! for n >= 0."""
    if n == 0:
        return 1
    return n * factorial(n - 1)

print(factorial(5))  # 120`;

const LONG_CODE = Array.from({ length: 24 }, (_, i) =>
  `    result_${i} = compute_intermediate_value(parameter_alpha, parameter_beta, iteration=${i})  # step ${i}`).join("\n");

const unwrap = (s: any) => { while (s?._zod?.def?.innerType) s = s._zod.def.innerType; return s; };
const isOptional = (s: any) => { while (s?._zod?.def?.innerType) { if (["optional", "default"].includes(s._zod.def.type)) return true; s = s._zod.def.innerType; } return false; };
const check = (s: any, n: string) => s?._zod?.def?.checks?.find((c: any) => c._zod.def.check === n)?._zod.def;

export function mockBlock(item: PlanItem, ctx: Pick<LessonContext, "grade" | "topic" | "subject" | "grounding">, profile: Profile, seed: string,
  opts: { budget?: Budget; force?: string[] } = {}): any {
  const r = rng(seed);
  const type: BlockType = item.type;
  const bud = opts.budget ?? budgetFor(type, ctx.grade);
  const topicWords = ctx.topic.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(w => w.length > 2);
  const fillText = () => (profile === "typical" ? 0.35 + r() * 0.4 : 1);

  const gen = (schema: any, path: string, key: string): any => {
    const s = unwrap(schema);
    const t = s._zod.def.type;
    if (isOptional(schema) && profile === "typical" && r() < 0.35 && !opts.force?.includes(key)) return undefined;
    if (t === "string") {
      const schemaMax = check(s, "max_length")?.maximum ?? 100;
      const max = profile === "sloppy" ? schemaMax : Math.min(bud.chars[path] ?? schemaMax, schemaMax);
      if (key === "date") return ["1905", "Oct 1905", "c. 1200 BCE", "1911", "7 Aug 1905", "1947"][Math.floor(r() * 6)].slice(0, max);
      if (key === "latex") {
        const list = LATEX[ctx.subject] ?? LATEX.default;
        return profile === "sloppy" ? list.join(" \\quad ").slice(0, schemaMax) : list[Math.floor(r() * list.length)];
      }
      if (key === "code") return profile === "sloppy" ? LONG_CODE.slice(0, 900) : CODE;
      if (key === "language") return "Python";
      if (key === "symbol") return ["β", "R_f", "V", "ρ", "k", "t", "n"][Math.floor(r() * 7)];
      if (key === "value") return ["7:6", "1973", "60%", "₹4.2 cr", "3.5×"][Math.floor(r() * 5)];
      return makeText(max, fillText(), r, topicWords);
    }
    if (t === "number") { const lo = check(s, "greater_than")?.value ?? 0, hi = check(s, "less_than")?.value ?? 10; return key === "minutes" ? 10 + Math.floor(r() * 10) : lo + Math.floor(r() * (hi - lo + 1)); }
    if (t === "boolean") return key === "isCycle" ? /cycle/i.test(ctx.topic) : false;
    if (t === "enum") { const k = Object.keys(s._zod.def.entries); return k[Math.floor(r() * k.length)]; }
    if (t === "literal") return s._zod.def.values[0];
    if (t === "array") {
      const lo = check(s, "min_length")?.minimum ?? 0, hi = check(s, "max_length")?.maximum ?? 4;
      const [blo, bhi] = !path.includes("[].") && bud.items[key] ? bud.items[key] : [lo, hi];
      const n = profile === "sloppy" ? hi : profile === "max" ? bhi : blo + Math.floor(r() * (bhi - blo + 1));
      return Array.from({ length: n }, () => gen(s._zod.def.element, `${path}[]`, key));
    }
    if (t === "object") {
      const o: any = {};
      for (const [k, v] of Object.entries(s._zod.def.shape as Record<string, any>)) {
        if (["intent", "source", "icon", "notes", "imageQuery"].includes(k)) continue;
        const val = gen(v, path ? `${path}.${k}` : k, k);
        if (val !== undefined) o[k] = val;
      }
      return o;
    }
    return undefined;
  };

  const b = gen(Blocks[type], "", "");
  b.type = type;
  b.intent = item.intent;
  b.source = ctx.grounding === "strict" ? "input" : "model";
  if (r() < 0.5) b.imageQuery = `${topicWords.slice(0, 2).join(" ") || "classroom"} photo`;
  if (type === "comparison" && /exactly these two/.test(item.guidance) && profile !== "sloppy") b.subjects = b.subjects.slice(0, 2);
  if (type === "comparison") b.rows.forEach((row: any) => { row.values = row.values.slice(0, b.subjects.length); while (row.values.length < b.subjects.length) row.values.push(makeText(40, 1, r, topicWords)); });
  if (type === "hierarchy" && profile !== "sloppy") b.children.forEach((c: any) => { if (c.items) c.items = c.items.slice(0, 4); });

  for (const f of opts.force ?? []) {
    if (f === "imageQuery") b.imageQuery = "sample photo";
    if (f === "isCycle") b.isCycle = true;
  }
  if (profile === "broken") breakIt(b, r, item);
  return b;
}

/** Realistic ways small models get JSON wrong. */
function breakIt(b: any, r: () => number, item: PlanItem) {
  const pick = Math.floor(r() * 9);
  switch (pick) {
    case 0: if (b.heading) b.heading = b.heading + " — " + "a very long heading that keeps going well beyond any sensible limit for a slide title, because models do this"; break;
    case 1: { const arr = Object.keys(b).find(k => Array.isArray(b[k]) && typeof b[k][0] === "string"); if (arr) b[arr] = b[arr].join("; "); break; } // array as one string
    case 2: if (b.type === "quiz_mcq") b.answer = "B"; else if (b.type === "activity") { b.minutes = "15 minutes"; b.grouping = "Pairs "; } else b.intent = "lecture"; break;
    case 3: b.type = item.fallbackType ?? b.type; if (item.fallbackType) { delete b.steps; delete b.events; delete b.rows; b.points = ["A point", "Another point"]; b.heading = b.heading ?? "Heading"; } break;
    case 4: { const arr = Object.keys(b).find(k => Array.isArray(b[k]) && b[k].length > 3); if (arr) b[arr] = [...b[arr], ...b[arr], ...b[arr]]; break; } // too many items
    case 5: if (b.type === "comparison") b.rows[0].values = b.rows[0].values.slice(0, 1); else b.extraField = { nested: true }; break;
    case 6: { const s = Object.keys(b).find(k => typeof b[k] === "string" && !["type", "intent", "source"].includes(k)); if (s) b[s] = "   "; break; } // blank required text
    case 7: b.type = b.type.toUpperCase(); break;
    case 8: { const s = Object.keys(b).find(k => typeof b[k] === "string" && !["type", "intent", "source"].includes(k)); if (s) b[s] = b[s] + " " + "x".repeat(400); break; }
  }
}

export function mockDeck(plan: PlanItem[], ctx: LessonContext, profile: Profile, caseId: string) {
  return { lessonTitle: ctx.topic.slice(0, 80), blocks: plan.map(p => mockBlock(p, ctx, profile, `${caseId}:${profile}:${p.n}`)) };
}
