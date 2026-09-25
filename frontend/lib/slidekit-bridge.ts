// ─────────────────────────────────────────────────────────────
// Bridge between Vivran's teacher-facing vocabulary and slidekit's.
//
// Vivran's dropdowns (lib/constants.ts) are the words a teacher picks.
// slidekit's SubjectId drives which block types the planner may use and
// which topic shapes it favours, so getting it wrong doesn't error — it
// quietly produces a lesson shaped for the wrong discipline.
// ─────────────────────────────────────────────────────────────
import { inferSubject, resolveSubject, type SubjectId } from "./slidekit/subjects";

/**
 * Every subject in SUBJECT_OPTIONS, mapped explicitly.
 *
 * This table exists because slidekit's inference is wrong on four of them,
 * and wrong silently:
 *   "Organisational Behaviour" matched biology (on "organ"),
 *   "Marketing" matched economics,
 *   "Income Tax Law" and "Auditing" matched nothing and fell back to general,
 *   losing the quantitative/skill priors that make them teachable.
 * Inference stays as the fallback for custom subjects a teacher types in
 * (the "Other — type it…" escape hatch), where no table can help.
 */
export const SUBJECT_MAP: Record<string, SubjectId> = {
  // Commerce — the beta's core audience, and where inference failed worst.
  "Business Studies": "business_studies",
  "Economics": "economics",
  "Accountancy": "accountancy",
  "Accounting & Finance": "accountancy",
  "Marketing": "business_studies",
  "Entrepreneurship": "business_studies",
  "Organisational Behaviour": "business_studies",
  // Indian commerce curricula teach both as computation-heavy accountancy
  // papers, not as jurisprudence — accountancy's quantitative + skill priors
  // give the planner worked examples, which is what these actually need.
  "Income Tax Law": "accountancy",
  "Auditing": "accountancy",
  // ...but a general business-law paper really is law.
  "Business Law": "law",

  "Statistics": "mathematics",
  "Mathematics": "mathematics",
  "Physics": "physics",
  "Chemistry": "chemistry",
  "Biology": "biology",
  "Science": "science",
  "History": "history",
  "Geography": "geography",
  "Computer Science": "computer_science",
  // Vivran's "English" is the school subject (grammar + comprehension), which
  // is slidekit's `language`. Literature is a separate id it can infer from
  // the topic when a teacher types one.
  "English": "language",
};

/** Resolve a teacher's subject to a SubjectId, or null to let slidekit ask. */
export function toSubjectId(subject: string | null | undefined): SubjectId | null {
  if (!subject) return null;
  const exact = SUBJECT_MAP[subject.trim()];
  if (exact) return exact;
  // Custom subject typed by the teacher: fall back to slidekit's own
  // resolution, and only accept a guess it is confident about — below that
  // threshold `understand()` asks the teacher instead, which is the
  // behaviour we want (see prompt_compiler.py's never-guess rule).
  const resolved = resolveSubject(subject);
  if (resolved) return resolved;
  const guessed = inferSubject(subject);
  return guessed && guessed.confidence >= 0.75 ? guessed.id : null;
}

// ─────────────────────────────────────────────────────────────
// Citation round-trip.
//
// The model never sees a real chunk id — it sees excerpts labelled S1, S2…
// and cites those tags. We map them back here and drop anything we did not
// issue, which is what makes a hallucinated citation structurally impossible
// rather than merely unlikely. Mirrors the approach already proven in
// backend/app/generation/assessments.py.
// ─────────────────────────────────────────────────────────────

export interface SourceChunk {
  chunk_id: string;
  excerpt: string;
  source_material?: string | null;
  page_number?: number | null;
}

/** Label retrieved chunks S1..Sn and return the prompt text plus the tag map. */
export function buildSourceMaterial(chunks: SourceChunk[]): {
  sourceText: string;
  tagToChunk: Map<string, SourceChunk>;
} {
  const tagToChunk = new Map<string, SourceChunk>();
  const parts: string[] = [];
  chunks.forEach((c, i) => {
    const tag = `S${i + 1}`;
    tagToChunk.set(tag, c);
    const where = [c.source_material, c.page_number ? `p.${c.page_number}` : null]
      .filter(Boolean).join(" · ");
    parts.push(`[${tag}]${where ? ` (${where})` : ""} ${c.excerpt}`);
  });
  return { sourceText: parts.join("\n\n"), tagToChunk };
}

export interface Grounding {
  /** Chunks actually cited, deduped and in first-cited order. */
  cited: SourceChunk[];
  /** Tags the model emitted that we never issued. Kept for telemetry: this is
   *  the hallucinated-citation rate, and it is unobservable if silently dropped. */
  invented: string[];
}

/** Resolve every sourceIds tag across a deck's blocks to real chunks. */
export function resolveCitations(
  blocks: { sourceIds?: string[] }[],
  tagToChunk: Map<string, SourceChunk>,
): Grounding {
  const cited: SourceChunk[] = [];
  const seen = new Set<string>();
  const invented: string[] = [];
  for (const b of blocks) {
    for (const tag of b.sourceIds ?? []) {
      const chunk = tagToChunk.get(tag.trim().toUpperCase());
      if (!chunk) { invented.push(tag); continue; }
      if (seen.has(chunk.chunk_id)) continue;
      seen.add(chunk.chunk_id);
      cited.push(chunk);
    }
  }
  return { cited, invented };
}
