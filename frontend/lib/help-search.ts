/**
 * Help search: ranks hand-written help entries against a teacher's question.
 * No AI. It is keyword search with the rough edges sanded off:
 *
 *   normalise   lowercase, strip accents and punctuation, join known two-word
 *               phrases ("question paper"), map synonyms ("paper", "exam" ->
 *               "test"), drop filler words (English and Hinglish), light stem
 *   index       each entry is a bag of terms weighted by where they appear:
 *               keywords x3, the question and its other phrasings x2, the
 *               answer x1, each scaled by how rare the term is (IDF)
 *   typos       an unknown word of 4+ letters matches the nearest known word
 *               within one edit (two for 6+ letters), at 0.7 of the weight
 *   prefixes    a word that isn't a whole word yet ("slid", "uplo") matches
 *               every known word it starts, at a lower weight
 *   shape       a character-trigram overlap between the question and each
 *               entry's phrasings, so "arrange an exam for my class" still
 *               finds "test" even though no word is shared
 *   score       sum over the question's words, softened for long questions
 *
 * lookup() answers in three tiers instead of all-or-nothing:
 *   answer      the score clears MIN_SCORE: show it, plus related answers
 *   suggest     it doesn't, but up to three entries clear SUGGEST_SCORE:
 *               "closest matches", so a vague or half-typed question still
 *               gets somewhere to go
 *   none        nothing is close (off-topic): offer a person
 * A one- or two-word question made only of filler ("what", "how do i") has
 * nothing to score, so it lists the questions that start that way.
 *
 * Pure and dependency-free so it runs (and is tested) outside React.
 */

export interface SearchableEntry {
  id: string;
  section: string;
  q: string;
  a: string;
  alt?: string[];
  keywords: string[];
  /** Numbered how-to steps, and bulleted points. Searched like the answer. */
  steps?: string[];
  points?: string[];
}

export interface HelpMatch<E extends SearchableEntry> {
  entry: E;
  score: number;
  /** Share of the question's words this entry speaks to, 0 to 1. */
  coverage: number;
}

/** Below this the best match is more likely wrong than right. Tuned against
 * the phrasings in scripts/help-search-check.mjs; retune when entries change. */
export const MIN_SCORE = 1.5;
/** Below MIN_SCORE but at least this: worth offering as a "closest match". */
export const SUGGEST_SCORE = 0.5;
/** Of the question's words that the help recognises at all, an answer must
 * speak to at least half and a closest match to at least a third. Words the
 * help has never heard of ("yesterday", a name) are chatter, not evidence. */
export const ANSWER_COVERAGE = 0.5;
export const SUGGEST_COVERAGE = 0.33;
export const MAX_SUGGESTIONS = 3;
/** "Related" answers must be at least this share of the best one. */
export const RELATED_SHARE = 0.5;

const PHRASES: Record<string, string> = {
  "question paper": "test",
  "practice sheet": "worksheet",
  "practice set": "worksheet",
  "answer key": "answer",
  "answer sheet": "answer",
  "marking scheme": "answer",
  "multiple choice": "mcq",
  "true false": "truefalse",
  "fill blank": "fillblank",
  "fill blanks": "fillblank",
  "course plan": "plan",
  "lesson plan": "plan",
  "lesson notes": "notes",
  "class activities": "activity",
  "teaching style": "style",
  "past papers": "past",
  "old papers": "past",
  "previous papers": "past",
  "case study": "case",
  "my materials": "material",
  "speaker notes": "notes",
  "voice over": "narration",
  "speak to": "contact",
  "talk to": "contact",
  "speak with": "contact",
  "talk with": "contact",
  "no source": "nosource",
  "without source": "nosource",
  "not from": "nosource",
  "no suggestion": "nosuggest",
  "no suggestions": "nosuggest",
  "nothing suggested": "nosuggest",
};

/** What the teacher wants to DO outweighs what they want to do it to: in
 * "rename a worksheet" the answer is about renaming, not worksheets. */
const ACTION_TERMS = new Set(["edit", "delete", "rename", "export", "training", "cost", "contact", "error", "mic", "language", "nosource", "nosuggest"]);
const ACTION_BOOST = 1.5;

const SYNONYMS: Record<string, string> = {
  paper: "test", exam: "test", examination: "test", tests: "test", papers: "test", unit: "test",
  homework: "worksheet", assignment: "worksheet", worksheets: "worksheet",
  ppt: "slides", pptx: "slides", deck: "slides", presentation: "slides", powerpoint: "slides", slide: "slides",
  upload: "material", uploads: "material", uploaded: "material", file: "material", files: "material",
  pdf: "material", document: "material", chapter: "material", textbook: "material", book: "material", materials: "material",
  grounded: "source", grounding: "source", cite: "source", citation: "source", citations: "source", ungrounded: "source", sources: "source", excerpt: "source", excerpts: "source",
  download: "export", print: "export", printable: "export", tally: "export", form: "export", link: "export", share: "export",
  delete: "delete", remove: "delete", hatao: "delete", erase: "delete", rename: "rename",
  mcqs: "mcq", objective: "mcq", options: "mcq",
  mark: "marks", score: "marks", total: "marks", add: "marks",
  answers: "answer", solution: "answer", solutions: "answer", key: "answer",
  regenerate: "edit", redo: "edit", replace: "edit", change: "edit", modify: "edit", swap: "edit", edit: "edit", harder: "edit", easier: "edit",
  privacy: "privacy", private: "privacy", data: "privacy", safe: "privacy", secure: "privacy", security: "privacy",
  train: "training", trained: "training", training: "training", ai: "training",
  free: "cost", price: "cost", pricing: "cost", cost: "cost", pay: "cost", paid: "cost", charge: "cost", money: "cost", subscription: "cost",
  contact: "contact", support: "contact", whatsapp: "contact", call: "contact", phone: "contact", email: "contact", reach: "contact", talk: "contact",
  memory: "style", habits: "style", pattern: "style", patterns: "style",
  hindi: "language", tamil: "language", telugu: "language", bengali: "language", marathi: "language", gujarati: "language",
  kannada: "language", malayalam: "language", punjabi: "language", urdu: "language", english: "language", languages: "language",
  voice: "mic", speak: "mic", microphone: "mic", dictate: "mic", record: "mic", bolkar: "mic",
  syllabus: "plan", term: "plan", weeks: "plan", schedule: "plan",
  clip: "video", videos: "video", animation: "video",
  time: "long", duration: "long", minutes: "long", takes: "long",
  picture: "image", diagram: "image", photo: "image", illustration: "image", images: "image",
  audio: "narration", narrate: "narration", podcast: "narration",
  activities: "activity", activity: "activity", game: "activity", games: "activity",
  saved: "library", history: "library", previous: "library", made: "library", find: "library",
  account: "account", profile: "settings", preferences: "settings", default: "settings", defaults: "settings",
  error: "error", failed: "error", fail: "error", broken: "error", stuck: "error", wrong: "error", slow: "error", busy: "error",
  student: "student", students: "student", child: "student", children: "student", kids: "student",
  difficult: "difficulty", hard: "difficulty", easy: "difficulty", level: "difficulty", tough: "difficulty",
  // Broader everyday wording, so a question needn't use our words to find our answers.
  assessment: "test", evaluation: "test", evaluate: "test", quiz: "quiz", quizzes: "quiz", question: "question", questions: "question",
  midterm: "test", terminal: "test", board: "test", cbse: "test", icse: "test", unittest: "test",
  revision: "worksheet", revise: "worksheet", drill: "worksheet", exercise: "worksheet", exercises: "worksheet", practice: "worksheet",
  lecture: "notes", handout: "notes", handouts: "notes",
  curriculum: "plan", timetable: "plan", planner: "plan", planning: "plan", outline: "outline", layout: "outline",
  blueprint: "style", format: "style", structure: "style", template: "style", usual: "style", habit: "style",
  customise: "customize", customize: "customize", customization: "customize", option: "customize", setting: "settings",
  tick: "customize", dropdown: "customize", choose: "customize", pick: "customize", select: "customize",
  generate: "create", generation: "create", build: "create", design: "create", prepare: "create", setup: "create", compose: "create",
  organise: "library", organize: "library", folder: "library", archive: "library", saves: "library", store: "library",
  logout: "account", login: "account", signin: "account", signup: "account", password: "account", register: "account", join: "account",
  grade: "grade", standard: "grade", std: "grade",
  topic: "topic", topics: "topic", subject: "subject", subjects: "subject",
  correct: "answer", right: "answer", incorrect: "answer", accuracy: "answer",
  faster: "long", wait: "long", delay: "long", loading: "long", waiting: "long", hang: "long", hanging: "long",
  mobile: "phone", tablet: "phone", ipad: "phone", android: "phone", iphone: "phone",
  pupil: "student", pupils: "student", learner: "student", learners: "student",
  human: "contact", person: "contact", someone: "contact", agent: "contact", created: "library", creations: "library",
  look: "see", view: "see", access: "see", watch: "see", read: "see", visible: "see",
  worry: "privacy", trust: "privacy", confidential: "privacy", leak: "privacy", copyright: "privacy",
};

const STOPWORDS = new Set(
  (
    "i me my we our you your a an the to of for in on at by with from and or but is are was were be been can could " +
    "do does did how what why when where which who will would should shall it its this that these those there here " +
    "please want need get make makes making create use using via about into out up any some all one also just so " +
    "explain tell let know like me " +
    "then than if not no yes ok okay hi hello there app " +
    "kya hai hain ka ki ke ko me mein se karna karu kare karo kaise kese kaha kahan mujhe main hum aap apna apne " +
    "kyu kyun kab kaun bhi toh to ho hoga sakta sakti lagta lagti lagega lagenge raha rahi"
  ).split(" "),
);

function stem(t: string): string {
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** Text -> canonical terms. Used identically for questions and entries. */
export function normalise(text: string): string[] {
  const raw = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const joined: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const pair = i + 1 < raw.length ? `${raw[i]} ${raw[i + 1]}` : "";
    if (pair && PHRASES[pair]) {
      joined.push(PHRASES[pair]);
      i++;
    } else {
      joined.push(raw[i]);
    }
  }
  const out: string[] = [];
  for (const t of joined) {
    if (STOPWORDS.has(t)) continue;
    const mapped = SYNONYMS[t] ?? stem(t);
    if (mapped.length > 1 && !STOPWORDS.has(mapped)) out.push(mapped);
  }
  return out;
}

/** Damerau-Levenshtein distance, stopping early past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

interface Index<E extends SearchableEntry> {
  entries: E[];
  weights: Map<string, number>[]; // per entry: term -> field weight x idf
  vocab: string[];
  typoTargets: [string, string][]; // word a teacher might type -> canonical term
  shapes: Set<string>[]; // per entry: character trigrams of its question, phrasings and keywords
  openers: string[][]; // per entry: its question and phrasings, lowercased, for "starts with" lookups
}

/** Character trigrams of already-normalised terms: the soft part of the match. */
function trigrams(terms: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of terms) {
    const padded = ` ${t} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Dice overlap of two trigram sets, 0 to 1. */
function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((g) => b.has(g) && shared++);
  return (2 * shared) / (a.size + b.size);
}

/** Unrelated phrases share some trigrams by chance (roughly up to 0.18); only
 * overlap beyond that counts, so noise can't lift an off-topic question. */
const SHAPE_FLOOR = 0.18;
const SHAPE_WEIGHT = 6;

export function buildIndex<E extends SearchableEntry>(entries: E[]): Index<E> {
  const fieldWeights = entries.map((e) => {
    const w = new Map<string, number>();
    const put = (terms: string[], weight: number) => terms.forEach((t) => w.set(t, Math.max(w.get(t) ?? 0, weight)));
    // Steps and bullets say the same thing at length; weighted below the lead
    // line so a word buried in step 4 of one answer can't outrank another
    // answer that is about it.
    put(normalise([...(e.steps ?? []), ...(e.points ?? [])].join(" ")), 0.4);
    put(normalise(e.a), 1);
    put(normalise([e.q, ...(e.alt ?? [])].join(" ")), 2);
    put(e.keywords.flatMap(normalise), 3);
    return w;
  });
  const df = new Map<string, number>();
  fieldWeights.forEach((w) => w.forEach((_, t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const n = entries.length;
  const weights = fieldWeights.map((w) => {
    const scaled = new Map<string, number>();
    w.forEach((weight, t) => scaled.set(t, weight * Math.log(1 + n / (df.get(t) ?? 1))));
    return scaled;
  });
  const vocab = Array.from(df.keys());
  const typoTargets: [string, string][] = [
    ...vocab.map((v): [string, string] => [v, v]),
    ...Object.entries(SYNONYMS).filter(([word]) => word.length >= 4),
  ];
  const shapes = entries.map((e) => trigrams([e.q, ...(e.alt ?? []), ...e.keywords].flatMap(normalise)));
  const openers = entries.map((e) => [e.q, ...(e.alt ?? [])].map((t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()));
  return { entries, weights, vocab, typoTargets, shapes, openers };
}

export function searchHelp<E extends SearchableEntry>(query: string, index: Index<E>): HelpMatch<E>[] {
  const terms = Array.from(new Set(normalise(query)));
  if (!terms.length) return [];
  const known = new Set(index.vocab);
  // Typos are matched against the words teachers type (synonyms included),
  // not just the canonical index terms: "totel" is one edit from "total".
  const candidates = index.typoTargets;
  // Each query word -> (index term, factor): exact, or the nearest within the typo budget.
  const resolved: [string, number][] = [];
  for (const t of terms) {
    if (known.has(t)) {
      resolved.push([t, 1]);
      continue;
    }
    // A word still being typed ("slid") matches every known word it starts.
    if (t.length >= 3) {
      const starts = candidates.filter(([word]) => word.length > t.length && word.startsWith(t));
      const canon = Array.from(new Set(starts.map(([, c]) => c))).filter((c) => known.has(c)).slice(0, 4);
      if (canon.length) {
        canon.forEach((c) => resolved.push([c, 0.6]));
        continue;
      }
    }
    // Short words are one edit from too many others ("best" -> "test"), so typo
    // correction starts at five letters.
    if (t.length < 5) continue;
    const max = t.length >= 9 ? 2 : 1;
    let best: string | null = null;
    let bestD = max + 1;
    for (const [word, canonical] of candidates) {
      const dist = editDistance(t, word, max);
      if (dist < bestD) {
        best = canonical;
        bestD = dist;
      }
    }
    if (best && known.has(best)) resolved.push([best, 0.7]);
  }
  const recognised = Array.from(new Set(resolved.map(([t]) => t)));
  const softener = Math.sqrt(Math.max(1, terms.length));
  const queryShape = trigrams(terms);
  const rawQuery = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return index.entries
    .map((entry, i) => {
      const w = index.weights[i];
      let score = 0;
      let covered = 0;
      for (const [t, factor] of resolved) {
        const hit = w.get(t) ?? 0;
        if (hit) covered++;
        score += hit * factor * (ACTION_TERMS.has(t) ? ACTION_BOOST : 1);
      }
      if (resolved.some(([t]) => t === entry.section)) score += 1.5;
      // Scaled by how much of the question this entry speaks to, and (more
      // gently) by how much of it the help recognised at all: one familiar
      // word among three strangers is weak evidence.
      const lexical = (score / softener) * (covered / terms.length) * Math.sqrt(recognised.length / terms.length);
      // The soft match: shared character shapes, even with no shared word.
      const shape = Math.max(0, dice(queryShape, index.shapes[i]) - SHAPE_FLOOR) * SHAPE_WEIGHT;
      // The question as written, or the entry's own wording, inside one another:
      // "what is teaching style" IS the question "What is Teaching style?".
      const phrase = rawQuery.length >= 6 && index.openers[i].some((o) => o.includes(rawQuery) || (o.length >= 12 && rawQuery.includes(o))) ? 4 : 0;
      return { entry, score: lexical + shape + phrase, coverage: covered / Math.max(1, recognised.length) };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type Lookup<E extends SearchableEntry> =
  | { kind: "answer"; best: E; related: E[] }
  | { kind: "suggest"; suggestions: E[] }
  | { kind: "none" };

/** Questions that start the way the teacher is typing: "what", "how do i", "wha". */
function startsLike<E extends SearchableEntry>(query: string, index: Index<E>): E[] {
  const raw = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  // Half-typed words and one or two words, or a filler-only phrase like "how do i".
  const fillerOnly = normalise(query).length === 0;
  if (!raw || raw.split(" ").length > (fillerOnly ? 4 : 2)) return [];
  const last = raw.split(" ").pop() as string;
  const scored = index.entries.map((entry, i) => {
    const lines = index.openers[i];
    let score = 0;
    if (lines.some((l) => l.startsWith(raw))) score = 3;
    else if (last.length >= 3 && lines.some((l) => l.split(" ").some((w) => w.startsWith(last)))) score = 1;
    return { entry, score, i };
  });
  return scored.filter((m) => m.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, MAX_SUGGESTIONS).map((m) => m.entry);
}

/** The whole lookup: a confident answer, else the closest matches, else nothing. */
export function lookup<E extends SearchableEntry>(query: string, index: Index<E>): Lookup<E> {
  const ranked = searchHelp(query, index);
  if (ranked.length && ranked[0].score >= MIN_SCORE && ranked[0].coverage >= ANSWER_COVERAGE) {
    const top = ranked[0].score;
    return {
      kind: "answer",
      best: ranked[0].entry,
      related: ranked.slice(1, 3).filter((m) => m.score >= top * RELATED_SHARE).map((m) => m.entry),
    };
  }
  const close = ranked
    .filter((m) => m.score >= SUGGEST_SCORE && m.coverage >= SUGGEST_COVERAGE)
    .slice(0, MAX_SUGGESTIONS)
    .map((m) => m.entry);
  if (close.length) return { kind: "suggest", suggestions: close };
  const opening = startsLike(query, index);
  if (opening.length) return { kind: "suggest", suggestions: opening };
  return { kind: "none" };
}

/** The best answer and up to two related ones, or null when nothing is good enough. */
export function answer<E extends SearchableEntry>(query: string, index: Index<E>): { best: E; related: E[] } | null {
  const ranked = searchHelp(query, index);
  if (!ranked.length || ranked[0].score < MIN_SCORE) return null;
  const top = ranked[0].score;
  return {
    best: ranked[0].entry,
    related: ranked.slice(1, 3).filter((m) => m.score >= top * RELATED_SHARE).map((m) => m.entry),
  };
}
