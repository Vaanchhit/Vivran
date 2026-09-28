// ─────────────────────────────────────────────────────────────
// Subject registry. Subject decides: which block types are allowed,
// which topic shapes are likely, the default theme and renderers.
// ─────────────────────────────────────────────────────────────
import type { BlockType } from "./blocks";
import type { GradeBand } from "./tokens";

export type Family = "quant" | "science" | "humanities" | "commerce" | "law" | "language" | "computing" | "arts" | "general";

/** How a topic "wants" to be taught. Drives which block types the planner picks. */
export const SHAPES = [
  "conceptual", "process", "chronological", "causal", "quantitative",
  "comparative", "classificatory", "structural", "literary", "computational", "skill",
] as const;
export type Shape = (typeof SHAPES)[number];

export interface SubjectDef {
  label: string;
  family: Family;
  synonyms: string[];
  /** Words in a topic that suggest this subject when none was chosen. */
  topicHints: string[];
  priors: Partial<Record<Shape, number>>;
  renderers: ("katex" | "mhchem" | "code" | "timeline" | "map")[];
  theme: string;
}

export const SUBJECTS = {
  mathematics: {
    label: "Mathematics", family: "quant", theme: "graphite",
    synonyms: ["maths", "math", "mathematics", "algebra", "geometry", "calculus", "statistics", "trigonometry", "arithmetic"],
    topicHints: ["hypothesis", "t-test", "z-test", "regression", "variance", "distribution", "sampling", "correlation", "equation", "fraction", "theorem", "polynomial", "integral", "derivative", "probability", "triangle", "matrix", "quadratic", "percentage", "ratio", "angle", "circle", "mensuration"],
    priors: { quantitative: 0.7, skill: 0.2 }, renderers: ["katex"],
  },
  physics: {
    label: "Physics", family: "quant", theme: "cobalt",
    synonyms: ["physics", "phy"],
    topicHints: ["force", "motion", "velocity", "acceleration", "gravity", "energy", "electricity", "current", "magnet", "wave", "optics", "lens", "momentum", "thermodynamics", "newton"],
    priors: { quantitative: 0.5, conceptual: 0.3, process: 0.1 }, renderers: ["katex"],
  },
  chemistry: {
    label: "Chemistry", family: "science", theme: "teal",
    synonyms: ["chemistry", "chem"],
    topicHints: ["sn1", "sn2", "nucleophilic", "substitution", "stereochemistry", "atom", "molecule", "reaction", "acid", "base", "bond", "periodic", "element", "compound", "mole", "oxidation", "organic", "salt", "electron"],
    priors: { conceptual: 0.3, quantitative: 0.3, classificatory: 0.2, process: 0.2 }, renderers: ["katex", "mhchem"],
  },
  biology: {
    label: "Biology", family: "science", theme: "moss",
    synonyms: ["biology", "bio", "life science", "botany", "zoology"],
    topicHints: ["krebs", "citric acid", "enzyme", "glycolysis", "biotech", "mitochondria", "cell", "photosynthesis", "respiration", "digestion", "plant", "animal", "organ", "tissue", "dna", "gene", "evolution", "ecosystem", "heart", "blood", "reproduction", "kingdom"],
    priors: { process: 0.35, structural: 0.3, classificatory: 0.2 }, renderers: [],
  },
  science: {
    label: "Science", family: "science", theme: "moss",
    synonyms: ["science", "general science", "evs", "environmental studies", "environmental science"],
    topicHints: ["water cycle", "pollution", "weather", "habitat", "food chain", "seasons", "solar system", "materials"],
    priors: { process: 0.3, conceptual: 0.3, classificatory: 0.2 }, renderers: [],
  },
  history: {
    label: "History", family: "humanities", theme: "sepia",
    synonyms: ["history", "hist"],
    topicHints: ["swadeshi", "bengal", "colonialism", "nationalism", "war", "revolution", "empire", "dynasty", "independence", "movement", "civilisation", "civilization", "mughal", "colonial", "partition", "treaty", "reform"],
    priors: { chronological: 0.5, causal: 0.35 }, renderers: ["timeline"],
  },
  geography: {
    label: "Geography", family: "humanities", theme: "terrain",
    synonyms: ["geography", "geo"],
    topicHints: ["climate", "river", "soil", "monsoon", "mountain", "plate", "earthquake", "volcano", "population", "resources", "agriculture", "latitude"],
    priors: { process: 0.3, classificatory: 0.3, causal: 0.2 }, renderers: ["map"],
  },
  civics: {
    label: "Civics / Political Science", family: "humanities", theme: "slate",
    synonyms: ["civics", "political science", "polity", "social studies", "social science", "sst"],
    topicHints: ["centre-state", "centre–state", "governor", "panchayat", "constitution", "parliament", "democracy", "rights", "election", "government", "judiciary", "federalism"],
    priors: { conceptual: 0.35, structural: 0.3, comparative: 0.2 }, renderers: [],
  },
  economics: {
    label: "Economics", family: "commerce", theme: "ink",
    synonyms: ["economics", "eco", "econ"],
    topicHints: ["keynes", "keynesian", "multiplier", "fiscal", "monetary", "game theory", "opportunity cost", "consumption", "demand", "supply", "inflation", "gdp", "market", "elasticity", "money", "bank", "budget", "trade", "monopoly", "interest rate"],
    priors: { conceptual: 0.35, causal: 0.3, quantitative: 0.2 }, renderers: ["katex"],
  },
  accountancy: {
    label: "Accountancy", family: "commerce", theme: "ink",
    synonyms: ["accountancy", "accounts", "accounting"],
    topicHints: ["ind as", "ifrs", "lease", "gaap", "consolidation", "journal", "ledger", "balance sheet", "depreciation", "trial balance", "partnership", "debit", "credit", "cash flow"],
    priors: { quantitative: 0.4, skill: 0.4 }, renderers: [],
  },
  business_studies: {
    label: "Business Studies", family: "commerce", theme: "ink",
    synonyms: ["business studies", "business", "bst", "management", "commerce"],
    topicHints: ["porter", "five forces", "swot", "marketing mix", "4ps", "7ps", "strategy", "supply chain", "branding", "competitive", "marketing", "management", "planning", "organising", "staffing", "entrepreneur", "consumer"],
    priors: { conceptual: 0.4, classificatory: 0.3, process: 0.2 }, renderers: [],
  },
  computer_science: {
    label: "Computer Science", family: "computing", theme: "terminal",
    synonyms: ["computer science", "cs", "computers", "ict", "informatics", "coding", "programming", "it"],
    topicHints: ["dijkstra", "graph", "dbms", "normalization", "normalisation", "normal form", "shortest path", "bcnf", "python", "loop", "algorithm", "function", "variable", "array", "html", "database", "sql", "sorting", "network", "binary", "recursion"],
    priors: { computational: 0.5, process: 0.2, conceptual: 0.2 }, renderers: ["code"],
  },
  english_literature: {
    label: "English Literature", family: "language", theme: "paper",
    synonyms: ["english literature", "literature", "lit"],
    topicHints: ["keats", "ode", "imagery", "nightingale", "romantic", "poem", "novel", "chapter", "character", "theme", "sonnet", "play", "author", "shakespeare", "short story"],
    priors: { literary: 0.7, conceptual: 0.1 }, renderers: [],
  },
  language: {
    label: "Language & Grammar", family: "language", theme: "paper",
    synonyms: ["english", "grammar", "hindi", "bengali", "french", "sanskrit", "language", "writing"],
    topicHints: ["tense", "noun", "verb", "adjective", "clause", "essay", "letter writing", "comprehension", "voice", "narration", "punctuation"],
    priors: { skill: 0.5, classificatory: 0.3 }, renderers: [],
  },
  psychology: {
    label: "Psychology", family: "humanities", theme: "slate",
    synonyms: ["psychology", "psych"],
    topicHints: ["conditioning", "pavlov", "skinner", "reinforcement", "memory", "learning", "motivation", "personality", "emotion", "perception", "intelligence", "stress"],
    priors: { conceptual: 0.5, comparative: 0.2 }, renderers: [],
  },
  arts: {
    label: "Arts & Music", family: "arts", theme: "studio",
    synonyms: ["art", "arts", "music", "dance", "drawing", "design"],
    topicHints: ["gestalt", "typography", "composition", "visual design", "colour", "color", "perspective", "rhythm", "raga", "painting", "sketch"],
    priors: { conceptual: 0.3, skill: 0.4 }, renderers: [],
  },
  finance: {
    label: "Finance", family: "commerce", theme: "ink",
    synonyms: ["finance", "corporate finance", "financial management", "investments", "investment analysis", "banking", "fintech"],
    topicHints: ["capm", "capital asset pricing", "beta", "wacc", "apv", "valuation", "bond", "option", "portfolio", "npv", "irr", "capital budgeting", "dividend", "black-scholes", "derivative", "cost of capital", "capital structure", "time value", "duration", "yield"],
    priors: { quantitative: 0.5, conceptual: 0.3, comparative: 0.1 }, renderers: ["katex"],
  },
  law: {
    label: "Law", family: "law", theme: "slate",
    synonyms: ["law", "legal studies", "jurisprudence", "constitutional law", "contract law", "criminal law", "llb"],
    topicHints: ["doctrine", "contract act", "tort", "constitution", "basic structure", "judgment", "article", "section", "kesavananda", "writ", "consideration", "offer", "acceptance", "precedent"],
    priors: { structural: 0.35, conceptual: 0.3, causal: 0.15 }, renderers: [],
  },
  medicine: {
    label: "Medicine & Health Sciences", family: "science", theme: "teal",
    synonyms: ["medicine", "mbbs", "physiology", "anatomy", "pharmacology", "pathology", "nursing", "pharmacy", "pharmaceutics", "b.pharm"],
    topicHints: ["cardiac", "heart", "renal", "kidney", "neuron", "antibiotic", "antibiotics", "drug", "receptor", "blood pressure", "hormone", "muscle", "infection", "dosage"],
    priors: { process: 0.35, structural: 0.3, classificatory: 0.2 }, renderers: [],
  },
  engineering: {
    label: "Engineering", family: "quant", theme: "cobalt",
    synonyms: ["engineering", "mechanical engineering", "civil engineering", "electrical engineering", "electronics", "fluid mechanics", "strength of materials", "mechanics"],
    topicHints: ["bernoulli", "fluid", "beam", "stress", "strain", "circuit", "kirchhoff", "voltage", "transistor", "torque", "heat engine", "reynolds"],
    priors: { quantitative: 0.55, process: 0.2, conceptual: 0.2 }, renderers: ["katex"],
  },
  sociology: {
    label: "Sociology", family: "humanities", theme: "slate",
    synonyms: ["sociology", "anthropology"],
    topicHints: ["weber", "durkheim", "marx", "stratification", "social", "institution", "protestant", "modernity", "kinship"],
    priors: { conceptual: 0.5, causal: 0.2, comparative: 0.2 }, renderers: [],
  },
  philosophy: {
    label: "Philosophy", family: "humanities", theme: "paper",
    synonyms: ["philosophy", "ethics", "logic"],
    topicHints: ["kant", "categorical imperative", "utilitarian", "epistemology", "plato", "aristotle", "metaphysics", "deontology", "virtue"],
    priors: { conceptual: 0.55, comparative: 0.25 }, renderers: [],
  },
  media: {
    label: "Media & Communication", family: "humanities", theme: "studio",
    synonyms: ["mass communication", "journalism", "media studies", "communication", "mass comm", "jmc"],
    topicHints: ["agenda-setting", "agenda setting", "framing", "news", "propaganda", "media effects", "gatekeeping"],
    priors: { conceptual: 0.45, causal: 0.25 }, renderers: [],
  },
  general: {
    label: "General", family: "general", theme: "graphite",
    synonyms: ["general", "other", "life skills", "moral science", "value education", "gk"],
    topicHints: [], priors: { conceptual: 0.4 }, renderers: [],
  },
} satisfies Record<string, SubjectDef>;

export type SubjectId = keyof typeof SUBJECTS;

// ── allowed blocks ──────────────────────────────────────────
const CORE: BlockType[] = [
  "title", "section", "objectives", "definition", "vocabulary", "explanation", "process", "comparison",
  "cause_effect", "hierarchy", "key_fact", "misconception", "real_world", "quiz_mcq", "activity",
  "discussion", "recap", "concept_map", "flowchart",
];
const EXTRA: Record<Family, BlockType[]> = {
  quant: ["formula", "worked_example"],
  science: ["formula", "worked_example", "timeline"],
  humanities: ["timeline"],
  law: ["timeline", "worked_example"],
  commerce: ["formula", "worked_example", "timeline"],
  language: ["timeline", "worked_example"],
  computing: ["code_example", "worked_example"],
  arts: ["timeline"],
  general: ["timeline"],
};
export const allowedBlocks = (id: SubjectId): BlockType[] => [...CORE, ...EXTRA[SUBJECTS[id].family]];

/** Block types never used at a grade, regardless of subject. */
export const GRADE_BLOCK_EXCLUDES: Record<GradeBand, BlockType[]> = {
  primary: ["code_example"],
  middle: [],
  secondary: [],
  college: [],
};

/** Which block types express each shape, in order of preference. */
export const SHAPE_BLOCKS: Record<Shape, BlockType[]> = {
  conceptual: ["definition", "explanation", "real_world", "concept_map"],
  process: ["process", "explanation", "flowchart", "real_world"],
  chronological: ["timeline", "explanation", "key_fact"],
  causal: ["cause_effect", "explanation", "concept_map"],
  quantitative: ["formula", "worked_example", "definition"],
  comparative: ["comparison", "definition", "explanation"],
  classificatory: ["hierarchy", "comparison", "vocabulary"],
  structural: ["hierarchy", "explanation", "vocabulary"],
  literary: ["explanation", "concept_map", "key_fact", "discussion"],
  computational: ["code_example", "process", "flowchart", "worked_example"],
  skill: ["process", "worked_example", "flowchart", "explanation"],
};

/** Topic keywords per shape. Kept as plain lists so non-engineers can edit them. */
export const SHAPE_KEYWORDS: Record<Shape, string[]> = {
  conceptual: ["theory", "doctrine", "thesis", "what is", "concept", "meaning", "nature of", "introduction to", "basics", "fundamentals"],
  process: ["process", "cycle", "how does", "how do", "steps", "stages", "working of", "mechanism", "formation", "life cycle", "circulation", "digestion", "photosynthesis", "respiration", "method"],
  chronological: ["history of", "timeline", "revolution", "war", "movement", "rise of", "fall of", "era", "age", "period", "evolution of", "independence", "dynasty"],
  causal: ["causes", "cause", "effects", "effect", "impact", "consequences", "why", "reasons", "factors", "results of"],
  quantitative: ["model", "pricing", "valuation", "hypothesis testing", "t-test", "formula", "equation", "calculate", "calculation", "numericals", "numerical", "theorem", "law of", "solve", "problems on", "interest", "area", "volume", "speed", "probability", "ratio"],
  comparative: ["vs", "versus", "difference between", "differences", "compare", "comparison", "distinguish", "similarities"],
  classificatory: ["types of", "kinds of", "classification", "categories", "forms of", "kingdom"],
  structural: ["elements of", "essentials of", "principles of", "components of", "parts of", "structure", "anatomy", "components", "organs of", "organisation of", "organization of", "features of", "system"],
  literary: ["poem", "novel", "chapter", "character", "sketch", "summary of", "theme", "short story", "play", "sonnet", "author"],
  computational: ["program", "code", "algorithm", "loop", "function", "python", "java", "html", "sql", "data structure", "recursion", "sorting"],
  skill: ["how to write", "how to", "writing", "letter", "essay", "practice", "drawing", "construction of", "solving"],
};

export function resolveSubject(raw?: string): SubjectId | null {
  if (!raw) return null;
  const q = raw.toLowerCase().trim();
  for (const [id, d] of Object.entries(SUBJECTS) as [SubjectId, SubjectDef][])
    if (d.synonyms.some(s => q === s)) return id;
  for (const [id, d] of Object.entries(SUBJECTS) as [SubjectId, SubjectDef][])
    if (d.synonyms.some(s => s.length > 3 && q.includes(s))) return id;
  return null;
}

/** Guess a subject from the topic when the teacher didn't pick one. */
export function inferSubject(topic: string): { id: SubjectId; confidence: number } | null {
  const t = topic.toLowerCase();
  let best: { id: SubjectId; hits: number } | null = null;
  for (const [id, d] of Object.entries(SUBJECTS) as [SubjectId, SubjectDef][]) {
    const hits = d.topicHints.filter(h => new RegExp(`\\b${h}`).test(t)).length
      + d.synonyms.filter(h => h.length > 3 && new RegExp(`\\b${h}\\b`).test(t)).length;
    if (hits && (!best || hits > best.hits)) best = { id, hits };
  }
  return best ? { id: best.id, confidence: Math.min(1, 0.5 + 0.25 * best.hits) } : null;
}
