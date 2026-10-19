// ─────────────────────────────────────────────────────────────
// A tiny condition language, so every "if" in the template family lives in
// JSON a backend engineer can edit, not in code.
//
//   { "all": [ ... ] }  { "any": [ ... ] }  { "not": { ... } }
//   leaf:  { "fact": "grade", "is": "primary" }
//          { "fact": "grade", "in": ["primary","middle"] }     notIn
//          { "fact": "slideCount", "gte": 7 }                  lte
//          { "fact": "shapes", "has": "chronological" }        hasAny: [..]
//          { "fact": "wantsMeme", "truthy": true }
//
// Facts are plain values (see facts.ts). An unknown fact name is a load-time
// error, not a silent false, so a typo in a rule cannot quietly disable it.
// ─────────────────────────────────────────────────────────────
import { z } from "zod";

export type Scalar = string | number | boolean | undefined;
export type FactValue = Scalar | Scalar[];
export type Facts = Record<string, FactValue>;

export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { fact: string; is: Scalar }
  | { fact: string; in: Scalar[] }
  | { fact: string; notIn: Scalar[] }
  | { fact: string; gte: number }
  | { fact: string; lte: number }
  | { fact: string; has: Scalar }
  | { fact: string; hasAny: Scalar[] }
  | { fact: string; truthy: boolean };

const scalar = z.union([z.string(), z.number(), z.boolean()]);
export const CondSchema: z.ZodType<Cond> = z.lazy(() => z.union([
  z.object({ all: z.array(CondSchema).min(1) }).strict(),
  z.object({ any: z.array(CondSchema).min(1) }).strict(),
  z.object({ not: CondSchema }).strict(),
  z.object({ fact: z.string(), is: scalar }).strict(),
  z.object({ fact: z.string(), in: z.array(scalar).min(1) }).strict(),
  z.object({ fact: z.string(), notIn: z.array(scalar).min(1) }).strict(),
  z.object({ fact: z.string(), gte: z.number() }).strict(),
  z.object({ fact: z.string(), lte: z.number() }).strict(),
  z.object({ fact: z.string(), has: scalar }).strict(),
  z.object({ fact: z.string(), hasAny: z.array(scalar).min(1) }).strict(),
  z.object({ fact: z.string(), truthy: z.boolean() }).strict(),
]));

const asList = (v: FactValue): Scalar[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

export function evalCond(c: Cond, facts: Facts): boolean {
  if ("all" in c) return c.all.every(x => evalCond(x, facts));
  if ("any" in c) return c.any.some(x => evalCond(x, facts));
  if ("not" in c) return !evalCond(c.not, facts);
  const v = facts[c.fact];
  if ("is" in c) return v === c.is;
  if ("in" in c) return !Array.isArray(v) && c.in.includes(v);
  if ("notIn" in c) return Array.isArray(v) || !c.notIn.includes(v);
  if ("gte" in c) return typeof v === "number" && v >= c.gte;
  if ("lte" in c) return typeof v === "number" && v <= c.lte;
  if ("has" in c) return asList(v).includes(c.has);
  if ("hasAny" in c) return c.hasAny.some(x => asList(v).includes(x));
  return Boolean(v) === c.truthy;
}

/** Every fact name a condition reads, for load-time validation. */
export function factsIn(c: Cond, out = new Set<string>()): Set<string> {
  if ("all" in c) c.all.forEach(x => factsIn(x, out));
  else if ("any" in c) c.any.forEach(x => factsIn(x, out));
  else if ("not" in c) factsIn(c.not, out);
  else out.add(c.fact);
  return out;
}
