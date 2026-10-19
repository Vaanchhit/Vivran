// ─────────────────────────────────────────────────────────────
// Template selection: score every template against the facts, pick the
// best, and keep the reasons so the teacher (and the engineer reading a log)
// can see WHY. Deterministic: same request, same template.
// ─────────────────────────────────────────────────────────────
import { evalCond, type Facts } from "./cond";
import { TEMPLATES, defaultTemplate, templateById } from "./registry";
import type { Template } from "./schema";

export interface Scored { template: Template; score: number; reasons: string[] }
export interface Selection {
  template: Template;
  score: number;
  /** Plain-language reasons, for the teacher. */
  reasons: string[];
  /** "teacher" = they named it; "scored" = best match; "default" = nothing matched. */
  how: "teacher" | "scored" | "default";
  /** The rest, best first, so a UI can offer "or try…". */
  alternatives: { id: string; name: string; score: number }[];
}

/** Below this total a template is not a real match; the default is used instead. */
export const MIN_SCORE = 2;

export function rank(facts: Facts): Scored[] {
  return TEMPLATES
    .filter(t => !t.requires || evalCond(t.requires, facts))
    .map(t => {
      const hit = t.signals.filter(s => evalCond(s.when, facts));
      return { template: t, score: +hit.reduce((a, s) => a + s.weight, 0).toFixed(2), reasons: hit.filter(s => s.weight > 0).map(s => s.why) };
    })
    .sort((a, b) => b.score - a.score); // stable: ties keep registry order
}

export function selectTemplate(facts: Facts, forced?: string): Selection {
  const ranked = rank(facts);
  const alt = (skip: string) => ranked.filter(r => r.template.id !== skip).slice(0, 3).map(r => ({ id: r.template.id, name: r.template.name, score: r.score }));
  const named = forced ? templateById(forced) : undefined;
  if (named) return { template: named, score: ranked.find(r => r.template.id === named.id)?.score ?? 0, reasons: ["you chose this template"], how: "teacher", alternatives: alt(named.id) };
  const top = ranked[0];
  if (!top || top.score < MIN_SCORE) {
    const d = defaultTemplate();
    return { template: d, score: top?.score ?? 0, reasons: ["nothing matched strongly, so the general lesson shape is used"], how: "default", alternatives: alt(d.id) };
  }
  return { template: top.template, score: top.score, reasons: top.reasons, how: "scored", alternatives: alt(top.template.id) };
}
