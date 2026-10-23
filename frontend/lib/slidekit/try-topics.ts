// Curated topics for the public "Try it" on the landing page. The demo only
// plans decks for topics on this list, so whatever a visitor types, they see a
// real lesson plan or a helpful suggestion, never a plan built around slang, a
// typo or nonsense. Matching is typo-tolerant (see matchTopics). Add a topic by
// adding a line; `aka` holds other ways people write it.
export interface TryTopic { id: string; topic: string; subject: string; levels: Level[]; aka?: string[] }
export type Level = "Class 3" | "Class 7" | "Class 10" | "Class 12" | "College";
export const LEVELS: Level[] = ["Class 3", "Class 7", "Class 10", "Class 12", "College"];
export const LEVEL_LABELS: Record<Level, string> = { "Class 3": "Class 1–5", "Class 7": "Class 6–8", "Class 10": "Class 9–10", "Class 12": "Class 11–12", College: "College" };

const P: Level[] = ["Class 3", "Class 7"], M: Level[] = ["Class 7", "Class 10"], S: Level[] = ["Class 10", "Class 12"], C: Level[] = ["Class 12", "College"];
const ALL: Level[] = [...LEVELS];

const T = (topic: string, subject: string, levels: Level[], aka: string[] = []): TryTopic =>
  ({ id: topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), topic, subject, levels, aka });

export const TRY_TOPICS: TryTopic[] = [
  // Science & biology
  T("Photosynthesis", "biology", [...P, "Class 10"], ["photo synthesis", "how plants make food"]),
  T("Parts of a plant", "science", P, ["plant parts"]),
  T("Parts of a flower", "biology", M, ["flower parts"]),
  T("The water cycle", "science", P, ["water cycle", "rain cycle"]),
  T("Food chains and food webs", "science", P, ["food chain", "food web"]),
  T("States of matter", "science", P, ["solid liquid gas"]),
  T("The human digestive system", "biology", M, ["digestion", "digestive system"]),
  T("The human heart", "biology", M, ["heart", "circulation", "circulatory system"]),
  T("Cell structure", "biology", M, ["the cell", "cell organelles", "plant and animal cells"]),
  T("Mitosis vs meiosis", "biology", S, ["mitosis and meiosis", "cell division", "mitosis", "meiosis"]),
  T("Heredity and evolution", "biology", S, ["heredity", "evolution", "genetics"]),
  T("Human reproduction", "biology", S, ["reproduction"]),
  T("Acids, bases and salts", "chemistry", M, ["acids and bases", "ph scale", "litmus test"]),
  T("Chemical reactions and equations", "chemistry", M, ["chemical reactions", "balancing equations"]),
  T("Periodic table", "chemistry", S, ["periodic classification", "mendeleev"]),
  T("Chemical bonding", "chemistry", S, ["ionic and covalent bonds", "bonding"]),
  T("Electrochemistry", "chemistry", C, ["electrochemical cells"]),
  T("Organic chemistry: hydrocarbons", "chemistry", C, ["hydrocarbons", "organic chemistry", "alkanes"]),
  // Physics
  T("Force and motion", "physics", P, ["force", "motion"]),
  T("Light: reflection and refraction", "physics", M, ["reflection", "refraction", "light"]),
  T("Electricity and circuits", "physics", M, ["electric circuits", "electricity", "ohm's law", "ohms law"]),
  T("Newton's laws of motion", "physics", M, ["newtons laws", "laws of motion", "newton laws"]),
  T("Equations of motion", "physics", S, ["kinematics", "derive the equations of motion"]),
  T("Work, energy and power", "physics", S, ["work energy power", "energy"]),
  T("Gravitation", "physics", S, ["gravity", "universal law of gravitation"]),
  T("Magnetic effects of current", "physics", S, ["electromagnetism", "magnetism"]),
  T("Thermodynamics", "physics", C, ["laws of thermodynamics", "heat engines"]),
  // Maths
  T("Fractions", "mathematics", P, ["fraction", "adding fractions"]),
  T("Place value", "mathematics", ["Class 3"], ["place values"]),
  T("Area and perimeter", "mathematics", P, ["area", "perimeter"]),
  T("Linear equations in one variable", "mathematics", M, ["linear equations", "solving equations"]),
  T("Quadratic equations", "mathematics", S, ["quadratics", "factorisation of quadratics", "quadratic formula"]),
  T("Triangles and congruence", "mathematics", M, ["congruence", "triangles"]),
  T("Pythagoras theorem", "mathematics", M, ["pythagorean theorem", "pythagoras"]),
  T("Trigonometry basics", "mathematics", S, ["trigonometry", "sin cos tan", "trigonometric ratios"]),
  T("Probability", "mathematics", S, ["chance", "probability basics"]),
  T("Statistics: mean, median, mode", "mathematics", M, ["mean median mode", "averages", "statistics"]),
  T("Differentiation", "mathematics", C, ["derivatives", "calculus", "differential calculus"]),
  T("Integration", "mathematics", C, ["integrals", "integral calculus", "integration by parts"]),
  T("Matrices and determinants", "mathematics", C, ["matrices", "determinants"]),
  // History, civics, geography
  T("The Indus Valley Civilisation", "history", M, ["harappan civilisation", "indus valley civilization", "harappa"]),
  T("The Mughal Empire", "history", M, ["mughals", "akbar"]),
  T("The Revolt of 1857", "history", M, ["1857 revolt", "first war of independence", "sepoy mutiny"]),
  T("The Indian national movement", "history", S, ["freedom struggle", "indian independence movement", "gandhi and the national movement"]),
  T("Partition of India", "history", S, ["partition", "1947 partition"]),
  T("The French Revolution", "history", S, ["french revolution"]),
  T("World War I", "history", S, ["first world war", "ww1", "world war 1"]),
  T("World War II", "history", S, ["second world war", "ww2", "world war 2"]),
  T("Industrial Revolution", "history", S, ["industrialisation", "industrialization"]),
  T("The Indian Constitution", "civics", M, ["constitution", "fundamental rights", "preamble"]),
  T("Democracy and elections", "civics", M, ["democracy", "elections", "voting"]),
  T("Federalism", "civics", S, ["centre state relations"]),
  T("Climate of India", "geography", M, ["indian climate", "monsoon", "climate"]),
  T("Resources and development", "geography", S, ["natural resources", "resources"]),
  T("Agriculture in India", "geography", M, ["agriculture", "crops", "farming"]),
  T("Earthquakes and volcanoes", "geography", P, ["volcanoes", "earthquakes", "plate tectonics"]),
  T("Rivers of India", "geography", P, ["indian rivers", "river systems"]),
  // Commerce, economics, business
  T("Demand and supply", "economics", S, ["law of demand", "supply and demand", "demand"]),
  T("Elasticity of demand", "economics", C, ["price elasticity", "elasticity"]),
  T("Money and banking", "economics", S, ["banking", "money", "rbi"]),
  T("Inflation", "economics", S, ["price rise", "cpi inflation"]),
  T("GDP and national income", "economics", C, ["gdp", "national income"]),
  T("Market structures", "economics", C, ["perfect competition", "monopoly", "oligopoly"]),
  T("Simple vs compound interest", "mathematics", M, ["compound interest", "simple interest"]),
  T("Journal entries", "accountancy", C, ["journal", "double entry", "accounting entries"]),
  T("Bank reconciliation statement", "accountancy", C, ["brs", "bank reconciliation"]),
  T("Depreciation", "accountancy", C, ["depreciation methods", "straight line method"]),
  T("Principles of management", "business_studies", C, ["fayol", "management principles"]),
  T("Marketing mix", "business_studies", C, ["4 ps", "four ps", "marketing"]),
  T("Porter's five forces", "business_studies", ["College"], ["porters five forces", "five forces"]),
  // Computing
  T("Python for loops", "computer_science", C, ["for loops", "loops in python", "python loops"]),
  T("Python functions", "computer_science", C, ["functions in python", "python def"]),
  T("Binary numbers", "computer_science", M, ["binary", "number systems"]),
  T("Sorting algorithms", "computer_science", C, ["bubble sort", "merge sort", "sorting"]),
  T("SQL basics", "computer_science", C, ["sql", "databases", "select queries"]),
  T("Recursion", "computer_science", C, ["recursive functions"]),
  T("Internet safety", "computer_science", P, ["online safety", "cyber safety"]),
  // English & languages
  T("Active and passive voice", "language", M, ["passive voice", "active voice", "voice"]),
  T("Direct and indirect speech", "language", M, ["reported speech", "narration", "indirect speech"]),
  T("Tenses", "language", P, ["present past future tense", "tense"]),
  T("Parts of speech", "language", P, ["nouns verbs adjectives", "nouns", "verbs"]),
  T("Letter writing", "language", M, ["formal letter", "informal letter"]),
  T("The poem 'Daffodils'", "english_literature", M, ["daffodils", "wordsworth"]),
  T("The Road Not Taken", "english_literature", M, ["road not taken", "robert frost"]),
  T("Figures of speech", "english_literature", M, ["simile", "metaphor", "poetic devices"]),
  // Other
  T("Supply chain management", "business_studies", ["College"], ["supply chain", "logistics"]),
  T("Classical conditioning", "psychology", C, ["pavlov", "conditioning"]),
  T("Fundamental rights", "law", ["Class 10", "College"], ["rights", "article 21"]),
  T("Contract law basics", "law", ["College"], ["contract act", "contracts", "indian contract act"]),
];

// ── matching ─────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Edit distance with transpositions, capped for speed. */
function dist(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

const STOP = new Set(["the", "of", "a", "an", "and", "in", "on", "for", "to", "class", "grade", "std", "vs", "versus", "with", "about", "my", "lesson", "chapter", "topic"]);

/** How well a typed word matches a word from the catalogue: 1 exact, less for prefixes and typos. */
function wordScore(q: string, w: string): number {
  if (q === w) return 1;
  if (q.length >= 3 && w.startsWith(q)) return 0.85;
  if (q.length <= 3) return 0; // too short to guess a typo from: "bro" is not "brs"
  const allowed = w.length <= 4 ? 1 : w.length <= 8 ? 2 : 3;
  const e = dist(q, w, allowed);
  return e <= allowed ? 0.8 - 0.08 * e : 0;
}

export interface TopicMatch { topic: TryTopic; score: number; exact: boolean }

/** Best catalogue matches for whatever was typed, typo-tolerant. */
export function matchTopics(input: string, limit = 6): TopicMatch[] {
  const q = norm(input);
  if (q.length < 2) return [];
  const qWords = q.split(" ").filter(w => !STOP.has(w) && !/^\d{1,2}$/.test(w));
  if (!qWords.length) return [];
  const out: TopicMatch[] = [];
  for (const t of TRY_TOPICS) {
    let best = 0, exact = false;
    for (const name of [t.topic, ...(t.aka ?? [])]) {
      const n = norm(name);
      if (n === qWords.join(" ")) { best = 1; exact = true; break; }
      const words = n.split(" ").filter(w => !STOP.has(w));
      // every typed word should find a home in the name; the name's coverage matters less
      const scored = qWords.map(qw => ({ qw, s: Math.max(0, ...words.map(w => wordScore(qw, w))) }));
      // A short word that matches nothing ("eqn", "ch") is an abbreviation, not a different topic: ignore it.
      if (scored.some(x => x.s === 0 && x.qw.length >= 4)) continue;
      const per = scored.filter(x => x.s > 0).map(x => x.s);
      if (!per.length) continue;
      const s = per.reduce((a, b) => a + b, 0) / per.length * (0.85 + 0.15 * Math.min(1, qWords.length / words.length));
      best = Math.max(best, s);
    }
    if (best >= 0.6) out.push({ topic: t, score: +best.toFixed(3), exact });
  }
  out.sort((a, b) => b.score - a.score);
  // Keep alternatives only when they are nearly as good as the best match.
  return out.filter(m => m.score >= out[0].score - 0.2).slice(0, limit);
}

export const topicById = (id: string) => TRY_TOPICS.find(t => t.id === id);

const BLOCKED = /\b(fuck\w*|shit\w*|bitch\w*|bastard|cunt|dick|cock|pussy|porn\w*|sex\w*|nude\w*|rape\w*|nigg\w*|slut|whore|chutiya\w*|madarchod|bhenchod|bc|mc|gandu|randi|harami)\b/i;
export const isBlocked = (s: string) => BLOCKED.test(s);
