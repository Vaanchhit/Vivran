// Everything the chat offers before the teacher types: prompt cards, starters,
// quick actions, the feature catalogue, tooltips and the walkthrough.
import type { ActionId, Intent, PromptCard, Starter } from "./types";

// One card per task: the example sends as-is, and "Your own" opens the matching
// starter so the teacher only fills in the gap.
export const PROMPT_CARDS: PromptCard[] = [
  { id: "deck", icon: "slides", title: "Make slides", description: "A full lesson deck from your chapter, with a plan you approve first.", output: "PowerPoint · notes per slide", prompt: "Slides on the French Revolution for my Class 9, about 40 minutes", starter: "slides" },
  { id: "paper", icon: "paper", title: "Set a paper", description: "Sections and marks the way you always set them.", output: "Paper + answer key", prompt: "A 40-mark unit test on the French Revolution", starter: "paper" },
  { id: "explain", icon: "bulb", title: "Explain a concept", description: "An everyday analogy, and where it stops being true.", output: "Analogy · map · limits", prompt: "Explain inflation simply for Class 9", starter: "explain" },
  { id: "compare", icon: "columns", title: "Compare two ideas", description: "A side-by-side table your students can copy.", output: "Table", prompt: "Compare Girondins and Jacobins", starter: "compare" },
  { id: "summary", icon: "doc", title: "Summarise a document", description: "Key points and terms, each linked to its page.", output: "Points · cited pages", prompt: "Summarise this PDF", starter: "summarise" },
  { id: "data", icon: "chart", title: "Read class results", description: "Where each section is struggling, and what to do next.", output: "By section · next steps", prompt: "Analyse my class results from the last unit test", starter: "analyse" },
];

export const STARTERS: Starter[] = [
  { id: "notes", icon: "notes", label: "Lesson notes", placeholder: "Which topic? e.g. photosynthesis for Class 7", template: "Lesson notes on {input}", intent: "notes" },
  { id: "activity", icon: "activity", label: "Class activity", placeholder: "Which topic, and how many minutes? e.g. fractions, 20 minutes", template: "A class activity on {input}", intent: "activity" },
  { id: "narration", icon: "mic", label: "Narration", placeholder: "Paste the script to narrate, word for word", template: "Narrate: {input}", intent: "narration" },
  { id: "image", icon: "image", label: "Image", placeholder: "What should it show? e.g. a labelled diagram of the heart", template: "An image of {input}", intent: "image" },
  { id: "video", icon: "video", label: "Video", placeholder: "What should it show? e.g. the water cycle", template: "A video on {input}", intent: "video" },
  { id: "explain", icon: "bulb", label: "Explain a concept", placeholder: "Which concept? e.g. compound interest", template: "Explain {input} simply for my class", intent: "explain" },
  { id: "summarise", icon: "doc", label: "Summarise a document", placeholder: "Which document? Leave blank to use the attached one", template: "Summarise {input}", intent: "summarise" },
  { id: "compare", icon: "columns", label: "Compare two ideas", placeholder: "Which two? e.g. mitosis and meiosis", template: "Compare {input}", intent: "compare" },
  { id: "paper", icon: "paper", label: "Set a paper", placeholder: "Which topic? e.g. the French Revolution", template: "A unit test on {input}", intent: "paper" },
  { id: "ideas", icon: "spark", label: "Generate ideas", placeholder: "Ideas for which topic or lesson?", template: "Give me lesson ideas for {input}", intent: "ideas" },
  { id: "analyse", icon: "chart", label: "Analyse data", placeholder: "Which results? e.g. last unit test", template: "Analyse {input}", intent: "analyse" },
  { id: "slides", icon: "slides", label: "Make slides", placeholder: "Which topic and class?", template: "Slides on {input}", intent: "slides" },
  { id: "plan", icon: "calendar", label: "Plan a unit", placeholder: "Which unit, and how many weeks?", template: "Plan a unit on {input}", intent: "plan" },
];

/** Under the cards: the rest of what Vivran makes, each opening its starter. */
export const MORE_STARTERS = ["notes", "activity", "narration", "image", "video"];

/** The style presets for images and videos, added to the description (as on the old Teach screen). */
export const IMAGE_STYLES = [
  { label: "Labeled diagram", modifier: "as a clean, textbook-style labeled diagram with clear annotations" },
  { label: "Infographic", modifier: "as a colorful infographic with icons and short text callouts" },
  { label: "Illustration", modifier: "as a simple, flat-style educational illustration" },
  { label: "Photo-realistic", modifier: "as a photo-realistic real-world scene" },
];
export const VIDEO_STYLES = [
  { label: "Whiteboard explainer", modifier: "as a hand-drawn whiteboard-style explainer animation" },
  { label: "Case study narrative", modifier: "as a short narrative case-study video with on-screen text callouts" },
  { label: "Animated infographic", modifier: "as a clean animated infographic with icons, charts, and motion graphics" },
  { label: "Slide read-along", modifier: "as a slide-deck-style video with bullet points appearing in sync with narration" },
];
export const VIDEO_SECS = [4, 6, 8] as const;
/** Class activity lengths, as the old Teach screen offered them; 15 when the request names none. */
export const ACTIVITY_MINUTES = [15, 20, 30, 45, 60, 90];

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
  slides: [],
  paper: ["summarise"],
  worksheet: ["examples", "table"],
  plan: ["bullets", "further"],
  notes: ["examples", "further", "bullets"],
  activity: [],
  narration: [],
  image: [],
  video: [],
  ideas: ["table", "examples"],
  analyse: ["summarise", "bullets"],
  general: ["summarise", "examples", "bullets"],
};

/** Simplify / Elaborate sit on their own beside every answer that has text. */
export const LEVELS: Partial<Record<Intent, { simplify: string; elaborate: string }>> = {
  paper: { simplify: "Make it easier", elaborate: "Make it harder" },
};

export const COLLECTIONS = ["Lessons", "Assessment", "Research", "Ideas"];

export type FeatureStatus = "Live" | "In beta" | "Coming next";
export interface Tool { name: string; icon: string; status: FeatureStatus; give: string; get: string; includes: string[]; try: string }

/** The things Vivran makes. Smaller abilities live inside the tool they belong to. */
export const TOOLS: Tool[] = [
  { name: "Lesson slides", icon: "slides", status: "Live", give: "A topic or chapter, the class, how long", get: "A plan to approve, then a finished deck", includes: ["Every slide fitted", "Speaker notes", "PowerPoint and PDF export", "A meme, if you ask"], try: "Slides on photosynthesis for Class 7" },
  { name: "Exam papers", icon: "paper", status: "Live", give: "Topic and total marks", get: "A paper in your section format, exact to the total", includes: ["Answer key", "Marking scheme", "Harder or easier, one question at a time"], try: "A 40-mark unit test on the French Revolution" },
  { name: "Worksheets", icon: "list", status: "Live", give: "A topic", get: "Activities and questions for the class", includes: [], try: "A worksheet on the French Revolution" },
  { name: "Plans and ideas", icon: "calendar", status: "Live", give: "A unit and the weeks you have", get: "A week-by-week plan, or ideas for one lesson", includes: ["From your syllabus", "Openers, activities, exit tickets"], try: "Plan a unit on the French Revolution, 4 weeks" },
  { name: "Explanations", icon: "bulb", status: "Live", give: "A concept, or two to compare", get: "An analogy, how it maps, and where it breaks", includes: ["Side-by-side comparisons (beta)", "Worked examples, maths done by code"], try: "Explain compound interest simply" },
  { name: "Lesson notes", icon: "notes", status: "Live", give: "A topic and the class", get: "Notes to teach from: explanations in order, everyday examples and a recap", includes: ["Built from your material when you attach it"], try: "Lesson notes on photosynthesis for Class 7" },
  { name: "Class activities", icon: "activity", status: "Live", give: "A topic and how many minutes", get: "A lesson in steps: explain, do, a scenario, checks with answers", includes: ["15 to 90 minutes", "Change the length after"], try: "A 20-minute class activity on fractions for Class 6" },
  { name: "Narration", icon: "mic", status: "Live", give: "A lesson script, word for word", get: "Spoken audio to play in class or share", includes: ["Your words, unchanged"], try: "Narrate: Good morning, class. Today we begin the French Revolution." },
  { name: "Images", icon: "image", status: "Live", give: "What it should show", get: "A diagram, infographic, illustration or photo-real picture", includes: ["Four styles", "Enhance with AI", "Check labels before use"], try: "A labelled diagram of the human heart" },
  { name: "Short videos", icon: "video", status: "Live", give: "What it should show", get: "A 4 to 8 second clip in one of four styles", includes: ["Whiteboard, case study, infographic, read-along", "Takes 1 to 3 minutes"], try: "A video on the water cycle" },
  { name: "Summaries", icon: "doc", status: "Live", give: "A PDF, Word file, deck or YouTube lecture", get: "Key points and terms, each linked to its page", includes: [], try: "Summarise this PDF" },
  { name: "Class results", icon: "chart", status: "In beta", give: "Marks from a test", get: "Where each section struggles, and what to reteach", includes: [], try: "Analyse my class results from the last unit test" },
];

/** Not tools of their own: they apply to everything above. */
export const BUILT_IN: { name: string; icon: string; desc: string; beta?: boolean }[] = [
  { name: "Cited to the page", icon: "quote", desc: "Facts link back to your source, and unsupported ones are flagged." },
  { name: "Teaching memory", icon: "brain", desc: "Learns your formats from work you've already set." },
  { name: "Improve my request", icon: "spark", desc: "Adds the class, length or format a request was missing. You choose whether to use it." },
  { name: "12 Indian languages", icon: "globe", desc: "Ask and get answers in Hindi, Tamil, Bengali and more." },
  { name: "Voice", icon: "mic", desc: "Speak a request; hear any answer read aloud.", beta: true },
];

export const COMING = ["Student revision from what was taught", "Institution insights across sections"];

export const TIPS = {
  attach: "Add a PDF, Word file or deck. Vivran writes from it and cites its pages.",
  improve: "Adds the details your request is missing. You see it before anything is sent.",
  source: "Answers come from this file first. Remove it to answer from general knowledge.",
  grounded: "Grounded: every fact is checked against your sources, and anything unsupported is flagged.",
  mic: "Speak instead of typing. Works in Chrome and Edge.",
  speak: "Read this answer aloud",
  save: "Save to a collection, with a note",
  copy: "Copy the answer",
  intent: "What Vivran understood you wanted. It shapes the format and the actions offered.",
  thinking: "What Vivran did, step by step.",
  search: "Searches titles and everything said in your chats.",
};

export const TOUR: { target: string; title: string; body: string }[] = [
  { target: "composer", title: "Ask in your own words", body: "Type what you're teaching. Vivran works out what you want, and asks if something's missing." },
  { target: "cards", title: "Not sure where to start?", body: "Tap an example to run it, or Your own to fill in just the topic." },
  { target: "source", title: "Your material, first", body: "Attach a chapter or paper. Answers cite its pages." },
  { target: "mic", title: "Talk instead", body: "Tap the mic and speak. Answers can be read aloud too." },
  { target: "search", title: "Find any chat", body: "Search, pin, rename and file chats into folders." },
  { target: "saved", title: "Keep what's useful", body: "Bookmark any answer into a collection, with a note." },
  { target: "features", title: "See everything", body: "Every tool, what it needs and what you get back." },
  { target: "help", title: "Replay anytime", body: "This tour lives here if you want it again." },
];
