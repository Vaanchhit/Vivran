// Everything the chat offers before the teacher types: prompt cards, starters,
// quick actions, the feature catalogue, tooltips and the walkthrough. Served by
// api.getConfig(), which stands in for GET /api/chat/config, so it can move to
// the backend without the interface changing.
import type { ActionId, Intent, PromptCard, Starter } from "./types";

export const PROMPT_CARDS: PromptCard[] = [
  { id: "deck", icon: "slides", title: "Slides for tomorrow", description: "A full lesson deck from your chapter, with a plan you approve first.", prompt: "Slides on the French Revolution for my Class 9, about 40 minutes" },
  { id: "paper", icon: "paper", title: "A paper in your format", description: "Sections and marks the way you always set them.", prompt: "A 40-mark unit test on the French Revolution" },
  { id: "explain", icon: "bulb", title: "Explain it simply", description: "An everyday analogy, and where it stops being true.", prompt: "Explain inflation simply for Class 9" },
  { id: "compare", icon: "columns", title: "Compare two ideas", description: "A side-by-side table your students can copy.", prompt: "Compare Girondins and Jacobins" },
  { id: "summary", icon: "doc", title: "Summarise my chapter", description: "Key points and terms, each linked to its page.", prompt: "Summarise this PDF" },
  { id: "data", icon: "chart", title: "Read my class results", description: "Where each section is struggling, and what to do next.", prompt: "Analyse my class results from the last unit test" },
];

export const STARTERS: Starter[] = [
  { id: "explain", icon: "bulb", label: "Explain a concept", placeholder: "Which concept? e.g. compound interest", template: "Explain {input} simply for my class", intent: "explain" },
  { id: "summarise", icon: "doc", label: "Summarise a document", placeholder: "Which document? Leave blank to use the attached one", template: "Summarise {input}", intent: "summarise" },
  { id: "ideas", icon: "spark", label: "Generate ideas", placeholder: "Ideas for which topic or lesson?", template: "Give me lesson ideas for {input}", intent: "ideas" },
  { id: "analyse", icon: "chart", label: "Analyse data", placeholder: "Which results? e.g. last unit test", template: "Analyse {input}", intent: "analyse" },
  { id: "slides", icon: "slides", label: "Make slides", placeholder: "Which topic and class?", template: "Slides on {input}", intent: "slides" },
  { id: "plan", icon: "calendar", label: "Plan a unit", placeholder: "Which unit, and how many weeks?", template: "Plan a unit on {input}", intent: "plan" },
];

export const ACTIONS: Record<ActionId, { label: string; icon: string; tip: string; step: string }> = {
  summarise: { label: "Summarise", icon: "list", tip: "The answer above in three lines", step: "Summarising the answer above" },
  further: { label: "Explain further", icon: "plus", tip: "More depth on the same idea", step: "Going one level deeper" },
  examples: { label: "Give examples", icon: "spark", tip: "Real examples your class will recognise", step: "Finding examples" },
  bullets: { label: "Bullet points", icon: "list", tip: "The same answer as a list", step: "Turning it into a list" },
  table: { label: "Table", icon: "table", tip: "The same answer as a table students can copy", step: "Building a table" },
  simplify: { label: "Simplify", icon: "down", tip: "Easier words, shorter sentences", step: "Rewriting at a simpler level" },
  elaborate: { label: "Elaborate", icon: "up", tip: "More detail, for stronger students", step: "Adding detail" },
};

/** Which quick actions make sense under which kind of answer. */
export const ACTIONS_FOR: Record<Intent, ActionId[]> = {
  explain: ["examples", "table", "bullets"],
  summarise: ["further", "table", "examples"],
  compare: ["examples", "bullets", "further"],
  slides: ["summarise", "examples"],
  paper: ["summarise"],
  worksheet: ["examples", "table"],
  plan: ["bullets", "further"],
  ideas: ["table", "examples"],
  analyse: ["summarise", "bullets"],
  general: ["summarise", "examples", "bullets"],
};

/** Simplify / Elaborate sit on their own beside every answer that has text. */
export const LEVELS: Partial<Record<Intent, { simplify: string; elaborate: string }>> = {
  paper: { simplify: "Make it easier", elaborate: "Make it harder" },
  slides: { simplify: "Simpler language", elaborate: "More depth" },
};

export const COLLECTIONS = ["Lessons", "Assessment", "Research", "Ideas"];

export type FeatureStatus = "Live" | "In beta" | "Coming next";
export const FEATURES: { group: string; items: { name: string; desc: string; icon: string; status: FeatureStatus; try?: string }[] }[] = [
  { group: "Plan", items: [
    { name: "Course plans", desc: "A term, week by week, from your syllabus.", icon: "calendar", status: "Live", try: "Plan a unit on the French Revolution, 4 weeks" },
    { name: "Lesson ideas", desc: "Openers, activities and exit tickets for any topic.", icon: "spark", status: "Live", try: "Give me lesson ideas for the French Revolution" },
  ] },
  { group: "Teach", items: [
    { name: "Slides", desc: "26 lesson shapes, every slide fitted, PowerPoint export.", icon: "slides", status: "Live", try: "Slides on photosynthesis for Class 7" },
    { name: "Worksheets", desc: "Activities and questions for the class to work on.", icon: "list", status: "Live", try: "A worksheet on the French Revolution" },
    { name: "Lesson notes", desc: "What you'll say, slide by slide.", icon: "doc", status: "Live" },
    { name: "Memes", desc: "One well-chosen meme, when you ask for it.", icon: "smile", status: "Live" },
  ] },
  { group: "Assess", items: [
    { name: "Exam papers", desc: "Your sections and marks, exact to the total.", icon: "paper", status: "Live", try: "A 40-mark unit test on the French Revolution" },
    { name: "Answer keys", desc: "Model answers and marking schemes.", icon: "check", status: "Live" },
    { name: "Harder or easier", desc: "Change one question without redoing the paper.", icon: "up", status: "Live" },
    { name: "Read class results", desc: "Where each section is struggling.", icon: "chart", status: "In beta", try: "Analyse my class results from the last unit test" },
  ] },
  { group: "Explain", items: [
    { name: "Explain simply", desc: "An analogy, how it maps, and where it breaks.", icon: "bulb", status: "Live", try: "Explain compound interest simply" },
    { name: "Compare", desc: "Side-by-side tables for two ideas.", icon: "columns", status: "In beta", try: "Compare mitosis and meiosis" },
    { name: "Worked examples", desc: "The model writes the steps; code does the maths.", icon: "calc", status: "Live" },
  ] },
  { group: "Your material", items: [
    { name: "My sources", desc: "PDFs, Word, PowerPoint and YouTube lectures.", icon: "folder", status: "Live", try: "Summarise this PDF" },
    { name: "Cited to the page", desc: "Every fact links back to where it came from.", icon: "quote", status: "Live" },
    { name: "Teaching memory", desc: "Learns your paper format from papers you've set.", icon: "brain", status: "Live" },
  ] },
  { group: "Reach", items: [
    { name: "Voice", desc: "Speak your request; hear answers read aloud.", icon: "mic", status: "In beta" },
    { name: "12 Indian languages", desc: "Write in Hindi, Tamil, Bengali and more.", icon: "globe", status: "Live" },
    { name: "Narration and video", desc: "Lessons narrated, short explainer videos.", icon: "play", status: "Coming next" },
    { name: "Student revision", desc: "Practice built from what was taught in class.", icon: "grad", status: "Coming next" },
    { name: "Institution insights", desc: "Coverage and learning across sections.", icon: "building", status: "Coming next" },
  ] },
];

export const TIPS = {
  attach: "Add a PDF, Word file or deck. Vivran writes from it and cites its pages.",
  source: "Answers come from this file first. Remove it to answer from general knowledge.",
  grounded: "Grounded: every fact is checked against your sources, and anything unsupported is flagged.",
  mic: "Speak instead of typing. Works in Chrome and Edge.",
  speak: "Read this answer aloud",
  save: "Save to a collection, with a note",
  copy: "Copy the answer",
  intent: "What Vivran understood you wanted. It shapes the format and the actions offered.",
  starters: "Pick a starter and just fill in the gap.",
  thinking: "What Vivran did, step by step.",
  search: "Searches titles and everything said in your chats.",
};

export const TOUR: { target: string; title: string; body: string }[] = [
  { target: "composer", title: "Ask in your own words", body: "Type what you're teaching. Vivran works out what you want, and asks if something's missing." },
  { target: "cards", title: "Not sure where to start?", body: "Tap a card to see what Vivran can do with one click." },
  { target: "starters", title: "Or pick a starter", body: "Choose a task, then just fill in the gap." },
  { target: "source", title: "Your material, first", body: "Attach a chapter or paper. Answers cite its pages." },
  { target: "mic", title: "Talk instead", body: "Tap the mic and speak. Answers can be read aloud too." },
  { target: "search", title: "Find any chat", body: "Search, pin, rename and file chats into folders." },
  { target: "saved", title: "Keep what's useful", body: "Bookmark any answer into a collection, with a note." },
  { target: "features", title: "See everything", body: "Every Vivran feature, with a one-tap way to try it." },
  { target: "help", title: "Replay anytime", body: "This tour lives here if you want it again." },
];
