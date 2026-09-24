// ─────────────────────────────────────────────────────────────
// Repair. When the model's JSON is wrong and the retry is also
// wrong (or we can't afford a retry on a free tier), coerce it into
// a valid block deterministically. Never invents content: it trims,
// drops and converts, and records every change for the teacher.
// ─────────────────────────────────────────────────────────────
import { Blocks, validateBlock, type Block, type BlockType } from "./blocks";
import { trimToBudget } from "./fit";
import type { PlanItem } from "./planner";

const unwrapType = (s: any) => { while (s?._zod?.def?.innerType) s = s._zod.def.innerType; return s?._zod?.def?.type; };
const check = (s: any, name: string) => s?._zod?.def?.checks?.find((c: any) => c._zod.def.check === name)?._zod.def;

function coerce(schema: any, v: any, path: string, fixes: string[]): any {
  let s = schema, optional = false, dflt: any;
  while (s?._zod?.def?.innerType) {
    if (s._zod.def.type === "optional") optional = true;
    if (s._zod.def.type === "default") { optional = true; dflt = s._zod.def.defaultValue; }
    s = s._zod.def.innerType;
  }
  const t = s._zod.def.type;
  const missing = v === undefined || v === null || v === "";
  if (missing) return optional ? dflt : undefined;

  switch (t) {
    case "string": {
      let out = typeof v === "string" ? v : typeof v === "number" ? String(v) : Array.isArray(v) ? v.join(", ") : JSON.stringify(v);
      out = path === "code" ? out.replace(/\t/g, "  ").replace(/\s+$/, "") : out.replace(/\s+/g, " ").trim();
      const max = check(s, "max_length")?.maximum;
      if (max && out.length > max) { out = trimToBudget(out, max); fixes.push(`trimmed ${path}`); }
      return out || (optional ? undefined : out);
    }
    case "number": {
      let n = typeof v === "number" ? v : parseInt(String(v), 10);
      if (Number.isNaN(n)) return optional ? dflt : undefined;
      const lo = check(s, "greater_than")?.value, hi = check(s, "less_than")?.value;
      if (lo !== undefined && n < lo) { n = lo; fixes.push(`clamped ${path}`); }
      if (hi !== undefined && n > hi) { n = hi; fixes.push(`clamped ${path}`); }
      return Math.round(n);
    }
    case "boolean": return v === true || v === "true" || v === 1;
    case "enum": {
      const keys = Object.keys(s._zod.def.entries);
      const hit = keys.find(k => k.toLowerCase() === String(v).toLowerCase().trim());
      if (hit) return hit;
      fixes.push(`reset ${path}`);
      return dflt ?? keys[keys.length - 1];
    }
    case "literal": return s._zod.def.values[0];
    case "array": {
      // "a; b; c" or a bulleted string where a list was expected
      let arr = Array.isArray(v) ? v
        : typeof v === "string" && unwrapType(s._zod.def.element) === "string" && /[;\n•]/.test(v)
          ? (fixes.push(`split ${path} into a list`), v.split(/\s*(?:;|\n|•)\s*/).filter(Boolean))
          : [v];
      arr = arr.map((x: any, i: number) => coerce(s._zod.def.element, x, `${path}[${i}]`, fixes)).filter((x: any) => x !== undefined);
      const max = check(s, "max_length")?.maximum;
      if (max && arr.length > max) { fixes.push(`dropped ${arr.length - max} item(s) from ${path}`); arr = arr.slice(0, max); }
      return arr;
    }
    case "object": {
      if (typeof v !== "object" || Array.isArray(v)) return undefined;
      const out: any = {};
      for (const [k, sub] of Object.entries(s._zod.def.shape as Record<string, any>)) {
        const c = coerce(sub, v[k], path ? `${path}.${k}` : k, fixes);
        if (c !== undefined) out[k] = c;
      }
      return out;
    }
  }
  return v;
}

export interface Repaired { block: Block | null; fixes: string[]; converted?: BlockType }

/** Label-like fields that may fall back to the lesson topic when blank. Content fields never do. */
const LABEL_FIELDS = ["title", "heading", "concept", "center", "root"];

export function repairBlock(raw: unknown, planned: Pick<PlanItem, "type" | "intent" | "fallbackType">, topic?: string): Repaired {
  const direct = validateBlock(raw);
  if (direct.ok) return { block: direct.block, fixes: [] };
  if (!raw || typeof raw !== "object") return { block: null, fixes: ["not an object"] };

  const r: any = { ...(raw as any) };
  const allowed = [planned.type, planned.fallbackType].filter(Boolean);
  if (!allowed.includes(r.type)) r.type = planned.type;
  r.intent = planned.intent;
  const fixes: string[] = [];
  if (topic) for (const k of LABEL_FIELDS)
    if (k in (Blocks[r.type as BlockType] as any).shape && typeof r[k] === "string" && !r[k].trim()) { r[k] = topic; fixes.push(`blank ${k} set to the lesson topic`); }
    else if (k in (Blocks[r.type as BlockType] as any).shape && r[k] === undefined && !["root", "center"].includes(k)) { r[k] = topic; fixes.push(`missing ${k} set to the lesson topic`); }
  const b = coerce(Blocks[r.type as BlockType], r, "", fixes);

  // comparison: every row needs one value per subject; drop rows that don't (never invent values)
  if (r.type === "comparison" && b?.rows && b?.subjects) {
    const n = b.subjects.length;
    const before = b.rows.length;
    b.rows = b.rows.map((row: any) => ({ ...row, values: row.values?.slice(0, n) })).filter((row: any) => row.values?.length === n);
    if (b.rows.length < before) fixes.push(`dropped ${before - b.rows.length} incomplete comparison row(s)`);
  }
  const v = validateBlock(b);
  if (v.ok) return { block: v.block, fixes };

  // last resort: turn whatever text exists into an explanation slide
  const texts: string[] = [];
  const walk = (x: any) => { if (typeof x === "string") texts.push(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") Object.entries(x).forEach(([k, y]) => { if (!["type", "intent", "source", "imageQuery", "icon", "notes"].includes(k)) walk(y); }); };
  walk(raw);
  const clean = texts.map(t => t.replace(/\s+/g, " ").trim()).filter(t => t.length > 2);
  const heading = topic ?? clean[0];
  const points = (topic ? clean : clean.slice(1)).filter(t => t !== heading).slice(0, 6);
  if (heading && points.length >= 2) {
    const e = validateBlock({
      type: "explanation", intent: planned.intent, heading: trimToBudget(heading, 60),
      points: points.map(t => trimToBudget(t, 140)), source: r.source === "input" ? "input" : "model",
    });
    if (e.ok) return { block: e.block, fixes: [...fixes, `converted ${r.type} to explanation`], converted: "explanation" };
  }
  return { block: null, fixes: [...fixes, ...v.errors] };
}
