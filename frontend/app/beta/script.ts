// What the beta chat says and does. Frontend only: every run is scripted from
// sample data, so the interface can be tried without calling a model.

export type FlowId = "pick" | "slidesPlan" | "slidesWrite" | "paperAsk" | "paperWrite" | "explain";

export interface Step {
  label: string;
  detail: string;
  ms: number;
}

export interface Source {
  tag: string;
  file: string;
  where: string;
  quote: string;
}

export type Block =
  | { t: "text"; text: string }
  | { t: "memory"; text: string; why: string }
  | { t: "clarify"; questions: { q: string; options: string[] }[]; next: FlowId }
  | { t: "outline"; slides: { move: string; title: string }[]; next: FlowId }
  | { t: "artifact"; kind: "deck" | "paper"; title: string; meta: string }
  | { t: "explain" }
  | { t: "sources"; items: Source[] }
  | { t: "followups"; items: string[] };

export interface Run {
  steps: Step[];
  blocks: Block[];
  title: string;
}

export const SOURCE_FILE = "Unit 4 · The French Revolution.pdf";

const SOURCES: Source[] = [
  { tag: "S1", file: SOURCE_FILE, where: "p. 4", quote: "French society in the eighteenth century was divided into three estates, and only members of the third estate paid taxes." },
  { tag: "S2", file: SOURCE_FILE, where: "p. 9", quote: "On 20 June the representatives of the third estate assembled in the hall of an indoor tennis court in the grounds of Versailles." },
  { tag: "S3", file: SOURCE_FILE, where: "p. 12", quote: "The Declaration of the Rights of Man and Citizen proclaimed rights such as the right to life, freedom of speech and equality before law." },
  { tag: "S4", file: "Term 1 History paper.docx", where: "Section D", quote: "Read the source and answer the questions that follow." },
];

export const DECK_SLIDES = [
  { move: "Title", title: "The French Revolution" },
  { move: "Comparison", title: "One kingdom, three estates" },
  { move: "Cause and effect", title: "Why it boiled over in 1789" },
  { move: "Timeline", title: "The revolution in eight moments" },
  { move: "Explanation", title: "The Tennis Court Oath" },
  { move: "Explanation", title: "Liberty, equality, fraternity" },
  { move: "Discussion", title: "Was the Terror the revolution betraying itself?" },
  { move: "Recap", title: "What the revolution left behind" },
];

export const FLOWS: Record<FlowId, Run> = {
  pick: {
    title: "New lesson",
    steps: [{ label: "Reading your request", detail: "Not sure yet what you'd like to make, so I'll ask rather than guess.", ms: 900 }],
    blocks: [
      { t: "text", text: "Happy to help. What should I make from **Unit 4 · The French Revolution**?" },
      { t: "followups", items: ["Slides for tomorrow's class", "A 40-mark unit test", "Explain the Reign of Terror simply"] },
    ],
  },
  slidesPlan: {
    title: "French Revolution · Class 9 deck",
    steps: [
      { label: "Reading your request", detail: "Class 9 · History · slides · about 40 minutes of teaching.", ms: 1000 },
      { label: "Searching your sources", detail: `Found 5 passages in ${SOURCE_FILE} that bear on this. Nothing padded.`, ms: 1500 },
      { label: "Choosing a lesson shape", detail: "Story of an Era: your topic unfolds over time, and it's about events.", ms: 1200 },
      { label: "Planning 8 slides", detail: "One teaching move per slide, opening with the setting and closing on a recap.", ms: 1100 },
    ],
    blocks: [
      { t: "text", text: "Here's the plan before I write anything. I picked the **Story of an Era** shape because the unit moves through events in order [S1]. Rename or remove slides, then approve." },
      { t: "outline", slides: DECK_SLIDES, next: "slidesWrite" },
      { t: "sources", items: SOURCES.slice(0, 3) },
    ],
  },
  slidesWrite: {
    title: "French Revolution · Class 9 deck",
    steps: [
      { label: "Writing 8 slides", detail: "Following your approved outline exactly.", ms: 1600 },
      { label: "Fitting every slide", detail: "Measured with the deck's real font: no text overflows at Class 9 size.", ms: 1100 },
      { label: "Linking sources", detail: "Every fact on a slide points back to a page of your PDF.", ms: 900 },
    ],
    blocks: [
      { t: "text", text: "Your deck is ready. The Tennis Court Oath slide quotes your textbook directly [S2], and the rights on slide 6 come from page 12 [S3]. The discussion slide has no single right answer, so I left it as a question for the class." },
      { t: "artifact", kind: "deck", title: "The French Revolution", meta: "8 slides · Class 9 · Story of an Era" },
      { t: "sources", items: SOURCES.slice(0, 3) },
      { t: "followups", items: ["Make a 40-mark test from this unit", "Explain the Reign of Terror simply", "Add a meme to the recap"] },
    ],
  },
  paperAsk: {
    title: "Unit test · French Revolution",
    steps: [
      { label: "Reading your request", detail: "A unit test, Class 9 History.", ms: 900 },
      { label: "Checking your teaching memory", detail: "6 of your 8 recent History papers use the same shape.", ms: 1200 },
    ],
    blocks: [
      { t: "memory", text: "Using your usual History format: **4 sections · 40 marks · 90 minutes**, ending with a source-based question.", why: "Learned from 6 of your 8 recent papers. You accepted this in Teaching memory." },
      { t: "text", text: "Two quick choices before I write it:" },
      {
        t: "clarify",
        next: "paperWrite",
        questions: [
          { q: "How hard should it be?", options: ["Mostly recall", "Balanced", "Stretch the top of the class"] },
          { q: "Include an answer key?", options: ["Yes, with marking scheme", "Answers only", "No"] },
        ],
      },
    ],
  },
  paperWrite: {
    title: "Unit test · French Revolution",
    steps: [
      { label: "Fixing the structure", detail: "Sections and marks set in code first: 8 + 12 + 10 + 10 = 40, exactly.", ms: 1100 },
      { label: "Searching your sources", detail: "7 passages across 2 files.", ms: 1300 },
      { label: "Writing 18 questions", detail: "Balanced thinking: 45% recall, 35% understanding, 20% higher order.", ms: 1700 },
      { label: "Checking every question", detail: "Marks add up, no repeats, each answer cites a page. 1 needs your eye.", ms: 1000 },
    ],
    blocks: [
      { t: "text", text: "Your paper is ready: 40 marks in your usual four sections. 17 of 18 questions point back to a page of your material. **One doesn't**: question 14 asks about the Napoleonic Code, which isn't in Unit 4, so I've flagged it rather than hidden it." },
      { t: "artifact", kind: "paper", title: "Unit Test · The French Revolution", meta: "40 marks · 90 minutes · 18 questions" },
      { t: "sources", items: SOURCES },
      { t: "followups", items: ["Replace question 14", "Make it harder", "Make slides for this unit"] },
    ],
  },
  explain: {
    title: "Explain: the Reign of Terror",
    steps: [
      { label: "Finding the idea", detail: "The Reign of Terror (1793–94), as your textbook describes it.", ms: 1000 },
      { label: "Searching your sources", detail: `3 passages in ${SOURCE_FILE}.`, ms: 1200 },
      { label: "Building an analogy", detail: "Checking that every key term maps to one thing in the story.", ms: 1400 },
    ],
    blocks: [
      { t: "text", text: "Here's a way into it for Class 9, written from your textbook's own definition [S3]." },
      { t: "explain" },
      { t: "followups", items: ["Turn this into a slide", "Give me two more check questions", "Try a different analogy"] },
    ],
  },
};

export function route(text: string): FlowId {
  const s = text.toLowerCase();
  if (/\b(slide|slides|deck|ppt|presentation|lesson)\b/.test(s)) return "slidesPlan";
  if (/\b(paper|test|exam|quiz|marks|assessment|worksheet)\b/.test(s)) return "paperAsk";
  if (/\b(explain|simply|simple|analogy|understand|why)\b/.test(s)) return "explain";
  return "pick";
}

export const PAPER = {
  school: "Greenfield Public School",
  title: "Unit Test · The French Revolution",
  meta: "Class 9 · History · 40 marks · 90 minutes",
  sections: [
    {
      name: "Section A",
      rule: "8 × 1 = 8",
      qs: [
        { q: "Name the three estates of French society in the eighteenth century.", cite: "p. 4" },
        { q: "Which estate paid taxes to the state?", cite: "p. 4" },
        { q: "What was the Bastille?", cite: "p. 8" },
        { q: "In which year did the Tennis Court Oath take place?", cite: "p. 9" },
        { q: "Who led the Jacobin club?", cite: "p. 15" },
        { q: "What was 'tithe'?", cite: "p. 5" },
        { q: "Expand the term 'livres'.", cite: "p. 5" },
        { q: "What was the Directory?", cite: "p. 17" },
      ],
    },
    {
      name: "Section B",
      rule: "4 × 3 = 12",
      qs: [
        { q: "Explain why the third estate felt the burden of taxation most heavily.", cite: "p. 5" },
        { q: "Describe what happened at the Tennis Court on 20 June 1789.", cite: "p. 9" },
        { q: "Why did the subsistence crisis of 1789 lead to unrest?", cite: "p. 6" },
        { q: "State three rights proclaimed in the Declaration of the Rights of Man.", cite: "p. 12" },
      ],
    },
    {
      name: "Section C",
      rule: "2 × 5 = 10",
      qs: [
        { q: "Was the Reign of Terror a betrayal of the revolution's ideals? Give reasons for your answer.", cite: "p. 15" },
        { q: "How did the Napoleonic Code change the lives of ordinary people across Europe?", cite: null },
      ],
    },
    {
      name: "Section D",
      rule: "Source-based · 10",
      qs: [
        { q: "Read the extract from the Declaration of the Rights of Man and answer: (a) What does Article 1 say about freedom? (b) Which group was left out of these rights? (c) Why does this document still matter?", cite: "p. 12" },
      ],
    },
  ],
};

export const RECENTS: { id: string; title: string; flows: FlowId[]; when: string }[] = [
  { id: "r1", title: "French Revolution · Class 9 deck", flows: ["slidesPlan", "slidesWrite"], when: "Today" },
  { id: "r2", title: "Unit test · French Revolution", flows: ["paperAsk", "paperWrite"], when: "Today" },
  { id: "r3", title: "Explain: the Reign of Terror", flows: ["explain"], when: "Yesterday" },
];

export const USER_LINES: Record<FlowId, string> = {
  pick: "Help me with Unit 4",
  slidesPlan: "Slides on the French Revolution for my Class 9, about 40 minutes",
  slidesWrite: "Approved. Write the deck.",
  paperAsk: "A 40-mark unit test on the French Revolution",
  paperWrite: "Balanced · Yes, with marking scheme",
  explain: "Explain the Reign of Terror simply for Class 9",
};
