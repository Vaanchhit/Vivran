// Sample content the beta chat answers from. Frontend only: nothing here was
// generated live. Replaced by real generation when the backend is wired in.
import type { Digest, Source, TableData } from "./types";

export const SOURCE_FILE = "Unit 4 · The French Revolution.pdf";

export const SOURCES: Source[] = [
  { tag: "S1", file: SOURCE_FILE, where: "p. 4", quote: "French society in the eighteenth century was divided into three estates, and only members of the third estate paid taxes." },
  { tag: "S2", file: SOURCE_FILE, where: "p. 9", quote: "On 20 June the representatives of the third estate assembled in the hall of an indoor tennis court in the grounds of Versailles." },
  { tag: "S3", file: SOURCE_FILE, where: "p. 12", quote: "The Declaration of the Rights of Man and Citizen proclaimed rights such as the right to life, freedom of speech and equality before law." },
  { tag: "S4", file: "Term 1 History paper.docx", where: "Section D", quote: "Read the source and answer the questions that follow." },
];

/* ───────── decks (real slide images in /public/landing/decks) ───────── */

export interface Deck { id: string; title: string; level: string; subject: string; template: string; slides: { move: string; title: string }[]; keywords: RegExp }

export const DECKS: Deck[] = [
  {
    id: "french-revolution", title: "The French Revolution", level: "Class 9", subject: "History", template: "Story of an Era",
    keywords: /french revolution|revolution|bastille|1789/i,
    slides: [
      { move: "Title", title: "The French Revolution" }, { move: "Comparison", title: "One kingdom, three estates" },
      { move: "Cause and effect", title: "Why it boiled over in 1789" }, { move: "Timeline", title: "The revolution in eight moments" },
      { move: "Explanation", title: "The Tennis Court Oath" }, { move: "Explanation", title: "Liberty, equality, fraternity" },
      { move: "Discussion", title: "Was the Terror the revolution betraying itself?" }, { move: "Recap", title: "What the revolution left behind" },
    ],
  },
  {
    id: "photosynthesis", title: "Photosynthesis", level: "Class 7", subject: "Science", template: "How It Works",
    keywords: /photosynthesis|plants? make food|chlorophyll/i,
    slides: [
      { move: "Title", title: "Photosynthesis" }, { move: "Objectives", title: "By the end of this lesson, you can…" },
      { move: "Process", title: "What goes in, what comes out" }, { move: "Explanation", title: "Tiny green factories" },
      { move: "Process", title: "How a leaf does it, step by step" }, { move: "Real life", title: "Your rice is stored sunlight" },
      { move: "Quiz", title: "Quick check" }, { move: "Recap", title: "Remember" },
    ],
  },
  {
    id: "mitosis-meiosis", title: "Mitosis vs Meiosis", level: "Class 11", subject: "Biology", template: "Compare & Contrast",
    keywords: /mitosis|meiosis|cell division/i,
    slides: [
      { move: "Title", title: "Mitosis vs Meiosis" }, { move: "Comparison", title: "Same start, different jobs" },
      { move: "Diagram", title: "What happens to the chromosomes" }, { move: "Table", title: "Side by side" },
      { move: "Key idea", title: "In meiosis I, paired chromosomes swap pieces" }, { move: "Misconception", title: "A common mix-up" },
      { move: "Quiz", title: "Quick check" }, { move: "Recap", title: "Remember" },
    ],
  },
  {
    id: "demand-supply", title: "Demand and Supply", level: "Class 11", subject: "Economics", template: "Concept Explorer",
    keywords: /demand|supply|price|market|equilibrium/i,
    slides: [
      { move: "Title", title: "Demand and Supply" }, { move: "Concept", title: "Two forces, one price" },
      { move: "Chart", title: "Where demand meets supply" }, { move: "Comparison", title: "What moves the curves" },
      { move: "Real life", title: "When the monsoon fails" }, { move: "Quiz", title: "Quick check" }, { move: "Recap", title: "Remember" },
    ],
  },
  {
    id: "python-loops", title: "for loops in Python", level: "BCA, Year 1", subject: "Computer Science", template: "Code Walkthrough",
    keywords: /python|loop|for loop|programming|code/i,
    slides: [
      { move: "Title", title: "for loops in Python" }, { move: "Comparison", title: "The same job, two ways" },
      { move: "Code", title: "Anatomy of a for loop" }, { move: "Table", title: "Counting with range()" },
      { move: "Worked example", title: "Worked example: class average" }, { move: "Misconception", title: "The bug everyone writes once" },
      { move: "Quiz", title: "Quick check" }, { move: "Recap", title: "Remember" },
    ],
  },
];

export const deckFor = (text: string) => DECKS.find((d) => d.keywords.test(text));

/* ───────── the exam paper ───────── */

export const PAPER = {
  school: "Greenfield Public School",
  title: "Unit Test · The French Revolution",
  meta: "Class 9 · History · 40 marks · 90 minutes",
  sections: [
    { name: "Section A", rule: "8 × 1 = 8", qs: [
      { q: "Name the three estates of French society in the eighteenth century.", cite: "p. 4" },
      { q: "Which estate paid taxes to the state?", cite: "p. 4" },
      { q: "What was the Bastille?", cite: "p. 8" },
      { q: "In which year did the Tennis Court Oath take place?", cite: "p. 9" },
      { q: "Who led the Jacobin club?", cite: "p. 15" },
      { q: "What was 'tithe'?", cite: "p. 5" },
      { q: "Expand the term 'livres'.", cite: "p. 5" },
      { q: "What was the Directory?", cite: "p. 17" },
    ] },
    { name: "Section B", rule: "4 × 3 = 12", qs: [
      { q: "Explain why the third estate felt the burden of taxation most heavily.", cite: "p. 5" },
      { q: "Describe what happened at the Tennis Court on 20 June 1789.", cite: "p. 9" },
      { q: "Why did the subsistence crisis of 1789 lead to unrest?", cite: "p. 6" },
      { q: "State three rights proclaimed in the Declaration of the Rights of Man.", cite: "p. 12" },
    ] },
    { name: "Section C", rule: "2 × 5 = 10", qs: [
      { q: "Was the Reign of Terror a betrayal of the revolution's ideals? Give reasons for your answer.", cite: "p. 15" },
      { q: "How did the Napoleonic Code change the lives of ordinary people across Europe?", cite: null },
    ] },
    { name: "Section D", rule: "Source-based · 10", qs: [
      { q: "Read the extract from the Declaration of the Rights of Man and answer: (a) What does Article 1 say about freedom? (b) Which group was left out of these rights? (c) Why does this document still matter?", cite: "p. 12" },
    ] },
  ],
};

/* ───────── explanations ───────── */

export interface Explanation { name: string; idea: string; like: string; maps: [string, string][]; breaks: string; check: string[]; digest: Digest }

const tbl = (columns: string[], rows: string[][], caption?: string): TableData => ({ columns, rows, caption });

export const EXPLANATIONS: Record<string, Explanation> = {
  terror: {
    name: "the Reign of Terror",
    idea: "From 1793 to 1794 the Jacobin government ruled through fear: anyone seen as an enemy of the republic could be arrested and executed.",
    like: "A class monitor given full power to keep order, who starts punishing anyone who even might talk, until the whole class is afraid, including the monitor's own friends.",
    maps: [["monitor", "Robespierre"], ["keeping order", "saving the republic"], ["punishments", "the guillotine"], ["the class", "French citizens"]],
    breaks: "A monitor can't execute anyone, and the Terror happened during a war and a food crisis, not just one person's choices.",
    check: ["Why did the Jacobins say the Terror was necessary?", "How did the Terror end for Robespierre himself?"],
    digest: {
      summary: ["1793–94: the Jacobins ruled by fear.", "Suspected enemies were arrested and executed.", "It ended when Robespierre himself was executed in 1794."],
      simple: "The new government was so scared of losing the revolution that it punished anyone it didn't trust. Thousands were killed, and in the end even its leader was.",
      more: ["France was at war with Austria and Prussia, and food prices were rising: leaders feared enemies inside the country as much as outside.", "The Committee of Public Safety, led by Robespierre, could arrest people on suspicion alone.", "Around 17,000 people were officially executed, many more died in prison.", "Its ideals of equality survived it: prices were controlled and slavery was abolished in the colonies in 1794."],
      examples: ["The Law of Suspects (1793) let committees arrest people without proof.", "Marie Antoinette was executed in October 1793.", "Bread was rationed and its price fixed by law."],
      table: tbl(["", "Before the Terror", "During the Terror"], [["Who ruled", "National Convention", "Committee of Public Safety"], ["How dissent was treated", "Debated", "Arrested on suspicion"], ["Prices", "Market prices", "Maximum prices set by law"]]),
    },
  },
  inflation: {
    name: "inflation",
    idea: "Inflation is when prices across the economy keep rising, so each rupee buys a little less than it did before.",
    like: "A school canteen where the samosa was ₹10 last year and ₹12 now. Your pocket money hasn't changed, so you can buy fewer samosas.",
    maps: [["samosa price", "price level"], ["pocket money", "income"], ["fewer samosas", "lower purchasing power"], ["the canteen", "the economy"]],
    breaks: "One canteen raising one price isn't inflation: it has to be prices across most goods, rising over time.",
    check: ["If prices rise 6% and your income rises 4%, are you better or worse off?", "Name one cause of inflation."],
    digest: {
      summary: ["Prices rise across the economy over time.", "Each rupee buys less.", "Measured in India mainly by the Consumer Price Index (CPI)."],
      simple: "Things cost more each year, so the same money gets you less.",
      more: ["Demand-pull: too much money chasing too few goods.", "Cost-push: inputs like fuel get costlier, so sellers raise prices.", "The RBI targets about 4% CPI inflation and raises interest rates to cool it.", "Mild inflation is normal; very high inflation erodes savings."],
      examples: ["Petrol prices rising raises transport costs for everything.", "A bad monsoon makes vegetables costlier.", "Your ₹100 note buys less this year than last year."],
      table: tbl(["Type", "Cause", "Example"], [["Demand-pull", "Demand grows faster than supply", "Festival season price rise"], ["Cost-push", "Production costs rise", "Fuel price hike"], ["Built-in", "Wages and prices push each other up", "Annual salary revisions"]]),
    },
  },
  photosynthesis: {
    name: "photosynthesis",
    idea: "Plants use sunlight to turn water and carbon dioxide into glucose, their food, and give out oxygen.",
    like: "A kitchen where sunlight is the stove, water and air are the ingredients, and the dish is sugar. The leftover steam is the oxygen we breathe.",
    maps: [["kitchen", "leaf"], ["stove", "sunlight"], ["ingredients", "water + CO₂"], ["the dish", "glucose"]],
    breaks: "A kitchen needs a cook; in a leaf, chlorophyll captures the light and the reactions happen on their own.",
    check: ["Which gas do leaves take in to make food?", "Why does a plant kept in the dark for days start to look pale?"],
    digest: {
      summary: ["Leaves make food using sunlight.", "In: water + carbon dioxide. Out: glucose + oxygen.", "Chlorophyll in chloroplasts captures the light."],
      simple: "Plants cook their own food using sunlight, water and air, and breathe out oxygen.",
      more: ["Roots absorb water; stomata take in CO₂.", "Chlorophyll traps light energy.", "Light energy splits water, releasing oxygen.", "The energy builds glucose, stored as starch."],
      examples: ["Rice and wheat are stored sunlight.", "Aquarium plants release bubbles of oxygen in light.", "Leaves turn pale in the dark."],
      table: tbl(["Goes in", "Comes out"], [["Water (from roots)", "Glucose (food)"], ["Carbon dioxide (from air)", "Oxygen (to air)"], ["Sunlight (energy)", "—"]]),
    },
  },
  "compound interest": {
    name: "compound interest",
    idea: "Compound interest is interest earned on both your original money and the interest it has already earned.",
    like: "Planting the seeds from this year's mangoes. Next year you have more trees, and each new tree gives seeds of its own.",
    maps: [["first tree", "principal"], ["mangoes", "interest"], ["planting the seeds", "reinvesting"], ["the orchard", "your total"]],
    breaks: "Trees take years to grow and some die; money compounds at a steady rate and doesn't.",
    check: ["₹1,000 at 10% a year, compounded: how much after 2 years?", "Why does starting to save early matter?"],
    digest: {
      summary: ["Interest earns interest.", "Growth speeds up over time.", "Starting early matters more than saving more later."],
      simple: "Your money makes money, and then that money makes more money.",
      more: ["Formula: A = P(1 + r)ⁿ.", "₹1,000 at 10% for 2 years: 1,000 × 1.1 × 1.1 = ₹1,210 (code-computed in the product).", "Simple interest would give only ₹1,200.", "The gap widens every year."],
      examples: ["A fixed deposit that reinvests interest.", "A loan where unpaid interest is added to what you owe.", "Rule of 72: at 8%, money doubles in about 9 years."],
      table: tbl(["Year", "Simple (₹)", "Compound (₹)"], [["0", "1,000", "1,000"], ["1", "1,100", "1,100"], ["2", "1,200", "1,210"], ["3", "1,300", "1,331"]], "₹1,000 at 10% a year"),
    },
  },
};

export const explanationFor = (text: string) => {
  const s = text.toLowerCase();
  if (/terror|robespierre|jacobin/.test(s)) return EXPLANATIONS.terror;
  if (/inflation|prices rising|price rise/.test(s)) return EXPLANATIONS.inflation;
  if (/photosynthesis/.test(s)) return EXPLANATIONS.photosynthesis;
  if (/compound|interest/.test(s)) return EXPLANATIONS["compound interest"];
  return null;
};

/* ───────── comparisons ───────── */

export const COMPARISONS: { keys: RegExp; title: string; table: TableData; takeaway: string; digest: Digest }[] = [
  {
    keys: /girondin|jacobin/i, title: "Girondins vs Jacobins",
    table: tbl(["", "Girondins", "Jacobins"], [["Who they were", "Lawyers and merchants from the provinces", "Radicals with support among Paris workers"], ["On the king", "Many wanted to spare him", "Voted to execute him"], ["On power", "Shared across regions", "Centralised in Paris"], ["Fate", "Purged in 1793", "Fell with Robespierre in 1794"]]),
    takeaway: "Both began as revolutionaries; they split over how far, how fast, and who should hold power.",
    digest: { summary: ["Girondins: moderate, provincial.", "Jacobins: radical, Paris-based.", "The Jacobins purged the Girondins in 1793."], simple: "Two revolutionary groups: one wanted slower change, the other wanted it fast and by force.", more: ["Both sat in the National Convention.", "The war and food shortages pushed Paris towards the Jacobins.", "The purge opened the way to the Terror."], examples: ["Brissot led the Girondins.", "Robespierre led the Jacobins.", "The vote on Louis XVI's execution split them."], table: tbl(["", "Girondins", "Jacobins"], [["Pace", "Gradual", "Rapid"], ["Base", "Provinces", "Paris"]]) },
  },
  {
    keys: /monarchy|republic/i, title: "Monarchy vs Republic",
    table: tbl(["", "Monarchy (before 1792)", "Republic (from 1792)"], [["Head of state", "A king, by birth", "Elected representatives"], ["Source of power", "Divine right", "The people"], ["Laws made by", "The king", "An elected assembly"], ["Example", "Louis XVI", "The National Convention"]]),
    takeaway: "The revolution moved power from one family to the citizens, at least on paper.",
    digest: { summary: ["Monarchy: power by birth.", "Republic: power from citizens.", "France became a republic in 1792."], simple: "A king rules because of his family; a republic is run by people the citizens choose.", more: ["The constitution of 1791 first limited the king's power.", "In 1792 the monarchy was abolished.", "Voting rights were still limited to men."], examples: ["India is a republic.", "The UK is a constitutional monarchy.", "France today is a republic."], table: tbl(["", "Monarchy", "Republic"], [["Leader", "Hereditary", "Elected"]]) },
  },
  {
    keys: /mitosis|meiosis/i, title: "Mitosis vs Meiosis",
    table: tbl(["", "Mitosis", "Meiosis"], [["Divisions", "One", "Two"], ["Daughter cells", "Two, identical", "Four, different"], ["Chromosome number", "Stays the same (2n)", "Halves (n)"], ["Purpose", "Growth and repair", "Making gametes"]]),
    takeaway: "Mitosis copies a cell; meiosis makes cells for reproduction with half the chromosomes and new combinations.",
    digest: { summary: ["Mitosis: 2 identical cells.", "Meiosis: 4 different cells, half the chromosomes.", "Crossing over makes meiosis cells unique."], simple: "Mitosis makes copies; meiosis makes sex cells that are all a bit different.", more: ["Crossing over happens in prophase I of meiosis.", "Errors in meiosis can cause conditions like Down syndrome.", "Mitosis heals a cut on your skin."], examples: ["Skin cells: mitosis.", "Pollen and eggs: meiosis.", "A growing root tip: mitosis."], table: tbl(["", "Mitosis", "Meiosis"], [["Cells made", "2", "4"]]) },
  },
];

export const COMPARE_OPTIONS = ["Girondins and Jacobins", "Monarchy and republic", "Mitosis and meiosis"];

/* ───────── other canned answers ───────── */

export const SUMMARY: { bullets: string[]; terms: TableData; digest: Digest } = {
  bullets: [
    "In 1789 France was divided into three estates; only the third paid taxes [S1].",
    "A subsistence crisis and the king's plan for new taxes brought the estates together at Versailles.",
    "The third estate declared itself the National Assembly and swore the Tennis Court Oath [S2].",
    "The Declaration of the Rights of Man promised liberty and equality before law [S3].",
    "France became a republic in 1792; the Terror followed in 1793–94, then the Directory and Napoleon.",
  ],
  terms: tbl(["Term", "Meaning", "Page"], [["Estates", "The three orders of French society", "p. 4"], ["Tithe", "Tax paid to the church", "p. 5"], ["Livre", "Unit of French currency", "p. 5"], ["Jacobins", "A radical political club", "p. 15"]]),
  digest: {
    summary: ["Unequal society → crisis → revolution.", "Rights declared in 1789.", "Republic, Terror, then Napoleon."],
    simple: "France's poor paid all the taxes, got angry when bread got expensive, overthrew the king and wrote down rights for everyone.",
    more: ["The storming of the Bastille on 14 July 1789 is the symbolic start.", "Women's clubs demanded equal rights but were denied them.", "The ideas spread across Europe through Napoleon's wars."],
    examples: ["The Bastille: a prison seen as a symbol of royal power.", "Olympe de Gouges wrote a Declaration of the Rights of Woman.", "Slavery was abolished in French colonies in 1794."],
    table: tbl(["Year", "Event"], [["1789", "Estates-General, Bastille, Declaration of Rights"], ["1791", "Constitution limits the king"], ["1792", "France becomes a republic"], ["1793–94", "Reign of Terror"], ["1799", "Napoleon takes power"]]),
  },
};

export function planFor(topic: string): TableData {
  const t = topic || "the unit";
  return tbl(["Week", "Focus", "In class", "Check"], [
    ["1", `What ${t} is about`, "Story-led opener and a source to read together", "Exit ticket: three words"],
    ["2", "The causes", "Group cause-and-effect map", "5-question quiz"],
    ["3", "Key events and people", "Timeline walk and role cards", "Short answer"],
    ["4", "Why it matters", "Debate and recap", "Unit test (40 marks)"],
  ], `A four-week plan for ${t}`);
}

export function ideasFor(topic: string): string[] {
  const t = topic || "this topic";
  return [
    `Open with a question: "What would you have done if you lived through ${t}?"`,
    `A two-minute "fact or fake" round on common myths about ${t}`,
    `Role cards: each group argues from one person's point of view`,
    `A timeline students build on the board from shuffled cards`,
    `One real source, read together, with three questions beside it`,
    `Exit ticket: "One thing I'd explain to a younger student about ${t}"`,
  ];
}

export const CLASS_DATA = {
  table: tbl(["Question", "Topic", "9A", "9B", "9C"], [
    ["Q4", "Tennis Court Oath", "82%", "74%", "85%"],
    ["Q9", "Burden of taxation", "71%", "66%", "77%"],
    ["Q13", "Reign of Terror", "63%", "41%", "67%"],
    ["Q15", "Source-based", "58%", "52%", "61%"],
  ], "Share of marks earned, last unit test"),
  insights: [
    "9B is 22 points behind 9A on the Reign of Terror: the biggest gap in the test.",
    "Source-based questions are the weakest everywhere: practise reading extracts.",
    "9C leads on every question; their recap routine may be worth sharing.",
  ],
};

export const WORKSHEET = [
  "Fill in the blank: Only the ______ estate paid taxes.",
  "Match each term to its meaning: tithe, livre, taille.",
  "Put these events in order: Bastille, Tennis Court Oath, Estates-General.",
  "In two lines: why was bread so important in 1789?",
  "Source: read Article 1 of the Declaration. What does it promise?",
  "Think: who was left out of the 'rights of man'?",
];
