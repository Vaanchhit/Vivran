// One lesson, followed through three roles. Every scene in the tour reads from
// here, so the numbers tie together: the questions students get wrong are the
// questions in the teacher's paper, and the struggles the school sees come from
// those answers. All of it is sample data, and the tour says so.

export const STORY = {
  school: "Greenfield Public School",
  teacher: { name: "Ms. Anjali Rao", short: "Ms. Rao", subject: "History", class: "Class 9" },
  student: { name: "Kabir", class: "Class 9B" },
  chapter: { file: "Unit 4 · The French Revolution.pdf", pages: 32, passages: 42 },
  pastPaper: { file: "Term 1 History paper.docx" },
  styleTrait: "Your History papers have 3 sections and 40 marks, and always end with a source-based question.",
  request: "Class 9, the French Revolution: 8 slides with a quick quiz at the end",
  template: { name: "Story of an Era", why: "your words are about events over time, and the topic unfolds over time" },
  outline: [
    { type: "Title slide", title: "The French Revolution" },
    { type: "Comparison", title: "One kingdom, three estates" },
    { type: "Cause and effect", title: "Why it boiled over in 1789" },
    { type: "Timeline", title: "The revolution in eight moments" },
    { type: "Explanation", title: "The Tennis Court Oath" },
    { type: "Explanation", title: "Liberty, equality, fraternity" },
    { type: "Discussion", title: "Was the Terror the revolution betraying itself?" },
    { type: "Recap", title: "What the revolution left behind" },
  ],
  deckId: "french-revolution",
  deckSlides: 8,
  paper: {
    title: "Unit Test · The French Revolution",
    marks: 40,
    minutes: 60,
    plan: [{ type: "Multiple choice", n: 5, each: 1 }, { type: "Short answer", n: 5, each: 3 }, { type: "Long answer", n: 2, each: 5 }, { type: "Source-based", n: 1, each: 10 }],
    sections: [
      { name: "Section A · Multiple choice", questions: [
        { n: 1, m: 1, q: "On which date was the Bastille stormed?", cite: "Unit 4.pdf · p.9" },
        { n: 2, m: 1, q: "Which estate paid nearly all the taxes?", cite: "Unit 4.pdf · p.4" },
        { n: 3, m: 1, q: "Where did the Third Estate's deputies take their oath on 20 June 1789?", cite: "Unit 4.pdf · p.8" },
      ] },
      { name: "Section B · Short answer", questions: [
        { n: 6, m: 3, q: "Explain two reasons the French treasury was empty by 1789.", cite: "Unit 4.pdf · p.6" },
        { n: 7, m: 3, q: "How did the price of bread affect ordinary families before the revolution?", cite: "Unit 4.pdf · p.7" },
        { n: 8, m: 3, q: "Compare the French Revolution with a present-day protest over rising prices.", cite: null },
      ] },
      { name: "Section D · Source-based", questions: [
        { n: 13, m: 10, q: "Read Article 1 of the Declaration of the Rights of Man. Who did it leave out at the time, and why does that matter?", cite: "Unit 4.pdf · p.12" },
      ] },
    ],
  },
  explain: {
    ask: "Why did the price of bread start a revolution?",
    oneLine: "When the food a family can't do without suddenly costs everything they earn, patience with an unfair system runs out.",
    story: "Imagine a family that earns ₹100 a day and spends ₹50 of it on bread. Then a bad harvest doubles the price of bread.",
    rows: [
      { label: "Daily earnings", before: "₹100", after: "₹100" },
      { label: "Bread", before: "₹50", after: "₹100" },
      { label: "Left for rent, clothes, taxes", before: "₹50", after: "₹0" },
    ],
    note: "Illustrative numbers. In 1789, many Paris families spent most of their wages on bread.",
    mapping: [
      { term: "The bread price", meaning: "Doubled after poor harvests" },
      { term: "The family with ₹0 left", meaning: "The Third Estate, still paying the taxes" },
      { term: "The tax-free neighbours", meaning: "The clergy and the nobility" },
    ],
    breaks: "Real families also faced feudal dues, unemployment and new ideas about rights, not just one price.",
  },
  // Student side (preview)
  flashcards: [
    { q: "What was the Third Estate?", a: "Everyone who wasn't clergy or nobility: peasants, workers, merchants. They paid nearly all the taxes.", from: "Slide 2" },
    { q: "What did the Tennis Court Oath promise?", a: "Not to separate until France had a constitution.", from: "Slide 5" },
    { q: "Name one cause of the revolution.", a: "An empty treasury, hunger from high bread prices, or new ideas about rights.", from: "Slide 3" },
  ],
  practice: {
    q: "Why did the Third Estate's deputies take the Tennis Court Oath?",
    options: ["To demand lower bread prices", "To promise not to separate until France had a constitution", "To declare war on Austria", "To crown a new king"],
    answer: 1,
    wrong: 0,
    misconception: "Bread prices made people angry, but the oath was about power: the deputies wanted a constitution that limited the king.",
    see: "Unit 4.pdf · p.8 · Slide 5",
  },
  progress: [
    { topic: "The three estates", pct: 88, revisit: false },
    { topic: "Causes of 1789", pct: 76, revisit: false },
    { topic: "Timeline of events", pct: 52, revisit: true },
    { topic: "The Reign of Terror", pct: 41, revisit: true },
  ],
  // Institution side (preview)
  coverage: [
    { cls: "Class 9A", taught: 7, planned: 8 },
    { cls: "Class 9B", taught: 6, planned: 8 },
    { cls: "Class 9C", taught: 5, planned: 8 },
  ],
  units: ["The estates", "Causes", "Timeline", "Rights of Man", "The Terror"],
  heat: [
    // % correct in practice, per section × topic
    { cls: "9A", v: [91, 82, 70, 78, 63] },
    { cls: "9B", v: [88, 76, 52, 71, 41] },
    { cls: "9C", v: [84, 69, 58, 66, 47] },
  ],
  answersThisWeek: 312,
  hours: { total: 6, parts: [{ label: "Slides", h: 2.5 }, { label: "Papers and answer keys", h: 2 }, { label: "Worksheets", h: 1.5 }] },
  standard: { title: "History · Class 9 paper format", detail: "3 sections · 40 marks · ends with a source-based question", adopted: 6, of: 8 },
} as const;
