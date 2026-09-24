// ─────────────────────────────────────────────────────────────
// Text fitting. Pure arithmetic, no AI, no DOM: greedy word wrap
// using per-role average glyph widths. The render audit checks
// these estimates against a real browser.
// ─────────────────────────────────────────────────────────────
import { BOLD_ROLES, GLYPH, GRADE_PROFILES, LINE_HEIGHT, ROLE_SIZES, WRAP_SLACK, WRAP_WORD, type GradeBand, type TypeRole } from "./tokens";
import { textWidth } from "./metrics";

/** Sizes a role may use at this grade, largest first. The grade minimum overrides the role ladder. */
export function sizesFor(role: TypeRole, grade: GradeBand): number[] {
  const min = GRADE_PROFILES[grade].minFont;
  const ok = ROLE_SIZES[role].filter(s => s >= min);
  return ok.length ? ok : [min];
}

/** Browsers and PowerPoint differ by a pixel or two per line in kerning and rounding; never fill the last 2%. */
const WIDTH_SAFETY = 0.98;

/** Lines needed to wrap text greedily at a size, using real glyph widths. Null if a single word is wider than the box. */
export function wrapLines(text: string, size: number, width: number, role: TypeRole): number | null {
  const weight = role === "mono" ? "mono" : BOLD_ROLES.has(role) ? "bold" : "regular";
  const w0 = width * WIDTH_SAFETY;
  const space = textWidth(" ", size, weight);
  let lines = 0;
  for (const para of text.split("\n")) {
    lines++;
    let cur = 0;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = textWidth(word, size, weight);
      if (w > w0) return null;
      if (cur === 0) cur = w;
      else if (cur + space + w <= w0) cur += space + w;
      else { lines++; cur = w; }
    }
  }
  return lines;
}

export interface TextFit { size: number; lines: number; height: number; rank: number }

/** Largest allowed size at which text fits within maxLines and maxHeight. */
export function fitText(text: string, role: TypeRole, grade: GradeBand, width: number, maxHeight: number, maxLines: number): TextFit | null {
  const sizes = sizesFor(role, grade);
  for (let i = 0; i < sizes.length; i++) {
    const r = fitAtStep(text, role, grade, i, width, maxLines);
    if (r && r.height <= maxHeight) return r;
  }
  return null;
}

/** Fit at a specific step down the role's size ladder (clamped to the smallest size). */
export function fitAtStep(text: string, role: TypeRole, grade: GradeBand, step: number, width: number, maxLines: number): TextFit | null {
  const sizes = sizesFor(role, grade);
  const i = Math.min(step, sizes.length - 1);
  const size = sizes[i];
  const n = wrapLines(text, size, width, role);
  if (n === null || n > maxLines) return null;
  return { size, lines: n, height: Math.ceil(n * size * LINE_HEIGHT), rank: sizes.length > 1 ? i / (sizes.length - 1) : 0 };
}

/** Conservative character budget for a box at the grade's smallest size (used for copy-fit requests). */
export function charBudget(role: TypeRole, grade: GradeBand, width: number, height: number, maxLines: number): number {
  const size = Math.min(...sizesFor(role, grade));
  const lines = Math.max(1, Math.min(maxLines, Math.floor(height / (size * LINE_HEIGHT))));
  const g = GLYPH[role] * size;
  return Math.max(8, Math.floor((lines * Math.min(width * WRAP_SLACK, width - WRAP_WORD * g)) / g));
}

/** Cut text to a budget at a word boundary. Deterministic; used only as a last resort and always flagged. */
export function trimToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const cut = text.slice(0, Math.max(1, budget - 1));
  const at = cut.lastIndexOf(" ");
  return (at > budget * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:.–-]+$/, "") + "…";
}
