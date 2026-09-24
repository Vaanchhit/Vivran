// ─────────────────────────────────────────────────────────────
// Budgets. What we ask the model for is derived from the layouts,
// not written by hand: every character and item limit in the prompt
// is one the grade's fallback layout is verified to hold. If the
// model obeys the prompt, the content fits — by construction.
// ─────────────────────────────────────────────────────────────
import { Blocks, type BlockType } from "./blocks";
import { fallbackFor, type LayoutSpec } from "./layouts";
import { GRADE_PROFILES, type GradeBand } from "./tokens";

const CHARS_PER_WORD = 6.5;
const BASE_KEYS = new Set(["intent", "source", "imageQuery", "icon", "notes", "type"]);

export interface Budget {
  /** Max characters by path pattern, e.g. "steps[].label", "points[]", "meaning". */
  chars: Record<string, number>;
  /** Item count range by array key. */
  items: Record<string, [number, number]>;
  code?: { lines: number; cols: number };
}

function unwrap(s: any): { s: any; optional: boolean } {
  let optional = false;
  while (s?._zod?.def?.innerType) { if (["optional", "default"].includes(s._zod.def.type)) optional = true; s = s._zod.def.innerType; }
  return { s, optional };
}
const check = (s: any, name: string) => s?._zod?.def?.checks?.find((c: any) => c._zod.def.check === name)?._zod.def;

/** Limits a layout is verified to hold at a grade. Defaults to the type's fallback layout. */
export function budgetFor(type: BlockType, g: GradeBand, l: LayoutSpec = fallbackFor(type)): Budget {
  const gp = GRADE_PROFILES[g];
  const cap = Math.floor(gp.maxWordsPerItem * CHARS_PER_WORD);
  const chars: Record<string, number> = {};
  const items: Record<string, [number, number]> = {};
  const b: Budget = { chars, items };

  for (const s of l.slots) {
    if (s.kind === "text") chars[s.bind] = s.maxChars;
    if (s.kind === "repeat") for (const f of s.fields) {
      const key = f.bind === "." ? `${s.bind}[]` : `${s.bind}[].${f.bind}${f.list ? "[]" : ""}`;
      chars[key] = f.role === "title" ? f.maxChars : Math.min(f.maxChars, cap);
    }
    if (s.kind === "table") {
      chars[`${s.header}[]`] = 30;
      chars[`${s.bind}[].attribute`] = Math.min(s.attr.maxChars, cap);
      chars[`${s.bind}[].values[]`] = Math.min(s.cell.maxChars, cap);
    }
    if (s.kind === "code") b.code = { lines: s.maxLines, cols: 60 };
  }
  for (const [key, [lo, hi]] of Object.entries(l.capacity))
    items[key] = [lo, Math.max(lo, Math.min(hi, gp.maxItems))];
  return b;
}

/** One-line JSON-ish shape for the prompt, with this grade's limits filled in. */
export function hintFor(type: BlockType, g: GradeBand): string {
  const bud = budgetFor(type, g);
  const shape = (Blocks[type] as any).shape as Record<string, any>;

  const render = (schema: any, path: string): string => {
    const { s, optional } = unwrap(schema);
    const q = optional ? "?" : "";
    const t = s._zod.def.type;
    if (t === "string") {
      const max = Math.min(bud.chars[path] ?? Infinity, check(s, "max_length")?.maximum ?? Infinity);
      return `"≤${max}${q}"`;
    }
    if (t === "literal") return JSON.stringify(s._zod.def.values[0]);
    if (t === "boolean") return `bool${q}`;
    if (t === "number") {
      const lo = check(s, "greater_than")?.value, hi = check(s, "less_than")?.value;
      return `int${lo !== undefined ? ` ${lo}-${hi}` : ""}${q}`;
    }
    if (t === "enum") return `"${Object.keys(s._zod.def.entries).join("|")}"${q}`;
    if (t === "array") {
      const key = path.replace(/\[\]$/, "").split(".").pop()!;
      const lo = check(s, "min_length")?.minimum ?? 0, hi = check(s, "max_length")?.maximum ?? 99;
      const [blo, bhi] = bud.items[key] && !path.includes("[].") ? bud.items[key] : [lo, hi];
      return `[${render(s._zod.def.element, `${path}[]`)}, ${blo === bhi ? blo : `${blo}-${Math.min(bhi, hi)}`} items]${q}`;
    }
    if (t === "object") {
      const inner = Object.entries(s._zod.def.shape as Record<string, any>)
        .filter(([k]) => !BASE_KEYS.has(k))
        .map(([k, v]) => `"${k}":${render(v, path ? `${path}.${k}` : k)}`);
      return `{${inner.join(",")}}`;
    }
    return "?";
  };

  const body = Object.entries(shape).filter(([k]) => !BASE_KEYS.has(k)).map(([k, v]) => `"${k}":${render(v, k)}`);
  let hint = `{"type":"${type}",${body.join(",")}}`;
  if (bud.code) hint += ` — code: ≤${bud.code.lines} lines, ≤${bud.code.cols} characters per line`;
  if (type === "comparison") hint += " — values: exactly one per subject";
  return hint;
}
