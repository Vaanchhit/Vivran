// ─────────────────────────────────────────────────────────────
// Design decisions: which theme and which layout knobs this deck gets, from
// the data-driven rules in design-rules.json. Pure function of the facts.
// The teacher's own choices always win later (a saved theme is never
// overridden by this; see deck-view), and every decision is returned with the
// rule that made it, so nothing about the look is unexplained.
// ─────────────────────────────────────────────────────────────
import type { DesignKnobs } from "../tokens";
import { evalCond, type Facts } from "./cond";
import { DESIGN_RULES } from "./registry";
import type { DesignSet } from "./schema";

export interface DesignDecision {
  /** Preset theme id, when one was chosen. */
  themeId?: string;
  /** Or a custom accent, when a rule set one without a preset. */
  custom?: { accent: string; dark: boolean };
  knobs: DesignKnobs;
  /** Which rule decided what, with its reason. Shown to the teacher. */
  applied: { id: string; why: string; set: string[] }[];
}

/** Resolve rules into one decision. Plan rules always run; fill rules only when `phase` is "fill". */
export function decideDesign(facts: Facts, base: DesignSet | undefined, phase: "plan" | "fill"): DesignDecision {
  const matching = DESIGN_RULES
    .filter(r => (r.phase === "plan" || phase === "fill") && evalCond(r.when, facts))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  // The template's own design is the weakest layer: any matching rule overrides it.
  const layers: { id: string; why: string; set: DesignSet }[] = [
    ...matching.map(r => ({ id: r.id, why: r.why, set: r.set })),
    ...(base ? [{ id: "template-default", why: "This template's own look.", set: base }] : []),
  ];

  const out: DesignDecision = { knobs: {}, applied: [] };
  const won = new Map<string, Set<string>>();
  const note = (id: string, key: string) => { (won.get(id) ?? won.set(id, new Set()).get(id)!).add(key); };
  const families = new Set<string>();

  for (const { id, set } of layers) {
    if (set.theme !== undefined && out.themeId === undefined && out.custom === undefined) { out.themeId = set.theme; note(id, "theme"); }
    else if (set.accent !== undefined && out.themeId === undefined && out.custom === undefined) { out.custom = { accent: set.accent, dark: !!set.dark }; note(id, "accent"); }
    for (const key of ["minFont", "maxDensity", "maxItems"] as const)
      if (set[key] !== undefined && out.knobs[key] === undefined) { (out.knobs as Record<string, unknown>)[key] = set[key]; note(id, key); }
    for (const f of set.preferFamilies ?? []) { if (!families.has(f)) note(id, "preferFamilies"); families.add(f); }
  }
  if (families.size) out.knobs.preferFamilies = [...families];
  out.applied = layers.filter(l => won.has(l.id)).map(l => ({ id: l.id, why: l.why, set: [...won.get(l.id)!] }));
  return out;
}
