// Checks the Help search against questions phrased the way teachers ask them.
// Run: node frontend/scripts/help-search-check.mjs   (Node 23+; it reads the .ts files directly)
// Re-run after editing lib/help-content.ts, and retune MIN_SCORE in lib/help-search.ts if needed.
import { HELP_ENTRIES } from "../lib/help-content.ts";
import { buildIndex, lookup, searchHelp, MIN_SCORE, SUGGEST_SCORE } from "../lib/help-search.ts";

const index = buildIndex(HELP_ENTRIES);

// [question, expected entry id]
const SHOULD_ANSWER = [
  ["how do i start", "first-steps"],
  ["what is vivran", "what-is"],
  ["what should i write in the prompt", "prompt-box"],
  ["can i use voice", "mic"],
  ["can it make papers in hindi", "language"],
  ["paper hindi mein bana sakte hai", "language"],
  ["make a course plan for 6 weeks", "course-plan"],
  ["plan my syllabus for the term", "course-plan"],
  ["how to make a ppt", "slides"],
  ["can i edit the slide outline", "slides"],
  ["presentation kaise banaye", "slides"],
  ["what are lesson notes", "lesson-notes"],
  ["group activity for class", "activities"],
  ["make audio of my lesson", "narration"],
  ["can it draw a diagram", "image"],
  ["video kitna time lagta hai", "video"],
  ["difference between quiz and test", "quiz-test-worksheet"],
  ["i want 10 mcqs and 5 short answers", "question-types"],
  ["only fill in the blanks", "question-types"],
  ["how many questions can i choose", "question-types"],
  ["marks are not adding up", "marks-total"],
  ["replace one question", "regenerate"],
  ["make question 3 harder", "regenerate"],
  ["does it give answer key", "answers"],
  ["make the paper more difficult", "difficulty"],
  ["can i upload my textbook pdf", "upload"],
  ["upload youtube video", "upload"],
  ["what does grounded mean", "grounded"],
  ["question has no source", "no-source"],
  ["paper from only one chapter", "pick-material"],
  ["what is teaching style", "what-style"],
  ["use my old papers", "what-style"],
  ["do you keep my past papers", "style-stored"],
  ["why no suggestions in teaching style", "style-nothing"],
  ["make paper without my style", "style-off"],
  ["can i upload student answer sheets", "student-work"],
  ["where are my saved papers", "library"],
  ["rename a worksheet", "delete-item"],
  ["how to print the paper", "pdf"],
  ["download pdf", "pdf"],
  ["send quiz to students online", "tally"],
  ["google form", "tally"],
  ["can other teachers see my files", "who-sees"],
  ["is my data used to train ai", "ai-provider"],
  ["delete my account", "delete-account"],
  ["change default subject", "defaults"],
  ["is it free", "cost"],
  ["kitna paisa lagega", "cost"],
  ["generation failed error", "error"],
  ["it is stuck", "error"],
  ["talk to someone", "contact"],
  ["genrate slids", "slides"],          // typos
  ["questoin paper marks totel", "marks-total"],
  // The newer features.
  ["students are not understanding fcfe, give me a simple example", "explain-simply"],
  ["explain opportunity cost with an everyday story", "explain-simply"],
  ["i do not like this analogy, show another", "example-another"],
  ["are the numbers in the worked example correct", "example-numbers"],
  ["what does where the comparison breaks mean", "example-where-breaks"],
  ["how do i put the example diagram in my slides", "example-use"],
  ["does vivran remember my settings", "memory-habits"],
  ["what is the your usual button", "memory-usual"],
  ["how do i reuse an old prompt", "memory-requests"],
  ["where is the chatbot", "ask-vivran"],
  ["keyboard shortcut for help", "ask-vivran"],
];

let pass = 0;
const fails = [];
for (const [q, want] of SHOULD_ANSWER) {
  const got = lookup(q, index);
  if (got.kind === "answer" && got.best.id === want) pass++;
  else {
    const top = searchHelp(q, index).slice(0, 2).map((m) => `${m.entry.id}:${m.score.toFixed(2)}`).join(", ");
    fails.push(`  ✗ "${q}" -> ${got.kind === "answer" ? got.best.id : got.kind} (wanted ${want}) [${top}]`);
  }
}

// Vague, half-typed or reworded: it needn't be THE answer, but the right one
// must be in what is shown (the answer, a related answer, or one of the three
// closest matches). [question, acceptable ids]
const SHOULD_SURFACE = [
  ["what", null], ["how", null], ["how do i", null], ["can i", null], ["does", null], ["wha", null],
  ["slid", ["slides"]], ["uplo", ["upload"]], ["prin", ["pdf", "tally"]], ["mcq", ["question-types"]],
  ["marks", ["marks-total", "question-types"]], ["free", ["cost"]], ["delete", ["delete-item", "delete-account"]],
  ["help", ["contact", "error"]], ["question", ["regenerate", "question-types"]], ["paper", ["question-types", "pdf", "marks-total", "quiz-test-worksheet"]],
  ["arrange an exam for my class of forty students", ["question-types", "quiz-test-worksheet"]],
  ["i want my students to practice at home", ["quiz-test-worksheet"]],
  ["can i give my students a link to attempt online", ["tally"]],
  ["my file is not opening", ["error", "upload"]],
  ["prepare the lecture notes for tomorrow", ["lesson-notes"]],
  ["i do not want to use the old pattern", ["style-off", "what-style"]],
  ["how much time does it take to create a clip", ["video"]],
  ["who can look at my uploaded books", ["who-sees"]],
  ["remove a wrong question and put a new one", ["regenerate"]],
  ["i forgot where i saved the ppt i made yesterday", ["library"]],
  ["hindi me worksheet chahiye", ["language", "quiz-test-worksheet"]],
  ["teacher ka account band karna hai", ["delete-account"]],
  ["i want to show the principal a plan for the whole term", ["course-plan"]],
  ["add more questions to my test", ["question-types", "regenerate"]],
  ["the paper has too many easy questions", ["difficulty", "regenerate", "question-types"]],
  ["is vivran safe for my school data", ["who-sees", "ai-provider"]],
  ["can students use this", ["student-work", "cost", "what-is"]],
];

// Off-topic: nothing should be offered, only a person.
const SHOULD_NOT_ANSWER = [
  "what is the capital of france", "explain photosynthesis", "who won the cricket match", "asdfgh",
  "integrate x squared", "best restaurant near me", "what is the weather today", "hello", "tell me a joke",
  "solve this quadratic equation", "kab hai diwali",
];

const shown = (r) => (r.kind === "answer" ? [r.best.id, ...r.related.map((e) => e.id)] : r.kind === "suggest" ? r.suggestions.map((e) => e.id) : []);

let surfaced = 0;
for (const [q, want] of SHOULD_SURFACE) {
  const got = lookup(q, index);
  const ids = shown(got);
  const ok = want === null ? ids.length > 0 : want.some((w) => ids.includes(w));
  if (ok) surfaced++;
  else fails.push(`  ✗ "${q}" showed [${ids.join(", ") || got.kind}] (wanted one of ${want})`);
}
let quiet = 0;
for (const q of SHOULD_NOT_ANSWER) {
  const got = lookup(q, index);
  if (got.kind === "none") quiet++;
  else fails.push(`  ✗ "${q}" offered ${got.kind} [${shown(got).join(", ")}] (should offer nothing)`);
}
console.log(`MIN_SCORE ${MIN_SCORE}  SUGGEST_SCORE ${SUGGEST_SCORE}`);
console.log(`confident and right:        ${pass}/${SHOULD_ANSWER.length}`);
console.log(`vague/reworded surfaced:    ${surfaced}/${SHOULD_SURFACE.length}`);
console.log(`off-topic offered nothing:  ${quiet}/${SHOULD_NOT_ANSWER.length}`);
if (fails.length) console.log(fails.join("\n"));
process.exit(fails.length ? 1 : 0);
