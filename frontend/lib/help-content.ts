/**
 * Everything the Help page says, in one place: its sections and the questions
 * teachers ask. The Help page renders it and the search (help-search.ts)
 * answers from it, so the two can never disagree.
 *
 * Feature descriptions are NOT written here: sections name catalog keys and
 * the page pulls title, description and explanation from lib/catalog.ts.
 *
 * When the product changes, change the answer here, then re-run
 * scripts/help-search-check.mjs so the search still finds it.
 * No imports, so the check script can load this file directly.
 */
import type { SearchableEntry } from "./help-search";

export type HelpSectionId =
  | "start" | "plan" | "teach" | "assess" | "material" | "style" | "library" | "export" | "privacy" | "settings";

export interface HelpSection {
  id: HelpSectionId;
  title: string;
  intro: string;
  /** Feature cards to show, by lib/catalog.ts key. */
  catalogKeys?: string[];
  steps?: string[];
  href?: string;
  linkLabel?: string;
}

/** `a` is a one-line answer; `steps` (numbered) and `points` (bulleted) carry the detail. */
export interface HelpEntry extends SearchableEntry {
  section: HelpSectionId;
  links?: { label: string; href: string }[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "start",
    title: "Get started",
    intro: "Three steps to your first paper or lesson, built from what you already teach.",
    steps: [
      "Add a chapter, your notes or slides under My materials.",
      "On Home, say what you need in your own words, for example \"a 20-mark test on demand and supply for Class 11\".",
      "Check the plan Vivran shows you, change anything under Customize, then generate. It is saved to your Library.",
    ],
  },
  {
    id: "plan",
    title: "Plan",
    intro: "Map out a course, week by week.",
    catalogKeys: ["course_plan"],
    steps: ["Describe the ground to cover.", "Choose the grade, subject and number of weeks.", "Generate, then open any week from your Library later."],
    href: "/teacher/plan",
    linkLabel: "Go to Plan",
  },
  {
    id: "teach",
    title: "Teach",
    intro: "Notes, slides, activities and media for the lesson itself.",
    catalogKeys: ["lesson_notes", "slides", "interactive", "narration", "image", "video"],
    steps: ["Pick what to make.", "Describe the topic and set grade and subject.", "For slides, approve the outline before anything is built."],
    href: "/teacher/create",
    linkLabel: "Go to Teach",
  },
  {
    id: "assess",
    title: "Assess",
    intro: "Quizzes, full tests and practice worksheets, with answers.",
    catalogKeys: ["quiz", "test", "worksheet"],
    steps: [
      "Pick quiz, test or worksheet.",
      "Under Customize, set marks and difficulty, or choose question types and how many of each.",
      "Select any question to make it harder, easier or more applied without redoing the paper.",
    ],
    href: "/teacher/assess",
    linkLabel: "Go to Assess",
  },
  {
    id: "material",
    title: "Your materials and sources",
    intro: "What you upload is what Vivran writes from, and each question can show the page it came from.",
    steps: ["Upload PDF, Word or PowerPoint files, or paste a YouTube link.", "Wait for it to show as ready.", "Optionally pick it as the source material when you create something."],
    href: "/teacher/materials",
    linkLabel: "Go to My materials",
  },
  {
    id: "style",
    title: "Teaching style",
    intro: "Vivran learns how you usually build papers, and uses it only when you say so.",
    steps: [
      "Add at least two past papers from the same subject.",
      "Read what Vivran noticed and choose Use this or Not for me for each pattern.",
      "New papers in that subject follow the patterns you accepted.",
    ],
    href: "/teacher/memory",
    linkLabel: "Go to Teaching style",
  },
  {
    id: "library",
    title: "Library",
    intro: "Everything you make is saved automatically.",
    steps: ["Filter by type.", "Open anything to keep working on it.", "Rename or delete it whenever you like."],
    href: "/teacher/library",
    linkLabel: "Go to Library",
  },
  {
    id: "export",
    title: "Exports",
    intro: "Take a paper out of Vivran: printed, or as an online quiz.",
  },
  {
    id: "privacy",
    title: "Privacy and your data",
    intro: "Your material is yours. Here is what happens to it.",
  },
  {
    id: "settings",
    title: "Settings and account",
    intro: "Your subjects, grades, language and default difficulty, and your account.",
    href: "/teacher/settings",
    linkLabel: "Go to Settings",
  },
];

export const HELP_ENTRIES: HelpEntry[] = [
  // ---- Getting started ----------------------------------------------------
  {
    id: "what-is", section: "start",
    q: "What is Vivran?",
    a: "Vivran helps you plan, teach and assess from your own material.",
    points: [
      "Plan: a course plan, week by week.",
      "Teach: lesson notes, slides, class activities, narration, images and video.",
      "Assess: quizzes, tests and worksheets, with answers.",
      "Everything can show the page of your material it came from.",
      "It is free for teachers.",
    ],
    keywords: ["about", "vivran"],
    alt: ["what does vivran do", "what can i make"],
  },
  {
    id: "first-steps", section: "start",
    q: "How do I get started?",
    a: "Add your material, ask for something, check it, and generate.",
    steps: [
      "Open My materials and add a chapter, your notes or slides (drag a file in, or click to browse).",
      "Wait until the file shows READY.",
      "Go to Home and type what you need, for example \"a 20-mark test on demand and supply for Class 11\".",
      "Press Turn this into a plan and check the grade, subject and topics Vivran read from your sentence.",
      "Change anything under Customize, then press Confirm & Generate Outputs.",
      "Find the result in Library; it is saved automatically.",
    ],
    keywords: ["start", "begin", "first", "new", "beginner"],
    alt: ["where do i begin", "i am new", "shuru kaise karu"],
    links: [{ label: "Go to My materials", href: "/teacher/materials" }],
  },
  {
    id: "prompt-box", section: "start",
    q: "What should I type in the box?",
    a: "Write it the way you would tell a colleague. Include as many of these as you know:",
    points: [
      "The topic: \"demand and supply\".",
      "The class: \"Class 11\" or \"2nd year\".",
      "What you need: \"a 20-mark test\", \"8 slides\", \"a worksheet\".",
      "Anything special: \"mostly application questions\", \"set in a village market\".",
      "Vivran fills in the grade, subject, topics and marks from your sentence and shows them to you before anything is made; fix any of them under Customize.",
    ],
    keywords: ["type", "prompt", "box", "write", "ask", "request", "customize"],
    alt: ["how do i ask for something", "what do i write"],
  },
  {
    id: "mic", section: "start",
    q: "Can I speak instead of typing?",
    a: "Yes, with the microphone in the prompt box.",
    steps: [
      "Press the microphone button in the prompt box and allow microphone access if your browser asks.",
      "Say what you need, then press it again to stop.",
      "Read the text that appears, fix any mistakes, then continue as usual.",
    ],
    keywords: ["mic", "voice", "speak"],
  },
  {
    id: "language", section: "start",
    q: "Can Vivran write in Hindi or another language?",
    a: "Yes. Quality varies by language, so read the result before using it.",
    steps: [
      "On Home, open Customize and choose a Language.",
      "Or set a default under Settings → Language so it is chosen for you every time.",
      "Check the result carefully, especially for technical terms.",
    ],
    keywords: ["language", "hindi", "translate"],
    alt: ["hindi mein paper", "regional language"],
  },
  {
    id: "leave-page", section: "start",
    q: "Can I leave the page while something is being made?",
    a: "Yes. It keeps going.",
    points: [
      "Open another page in Vivran; do not close the tab or the browser.",
      "A notice appears when it is ready, with a link back.",
      "The finished item is saved in your Library.",
      "Long uploads show a warning if you try to refresh or close the tab.",
    ],
    keywords: ["leave", "wait", "navigate", "background", "close"],
    alt: ["do i have to wait", "it is taking long"],
  },
  // ---- Plan ---------------------------------------------------------------
  {
    id: "course-plan", section: "plan",
    q: "How do I make a course plan?",
    a: "Use Plan: say what ground to cover and for how long.",
    steps: [
      "Open Plan from the sidebar.",
      "Describe what to cover, for example \"Demand, supply and market equilibrium, ending in a unit test\".",
      "Under Customize, set Grade / Year, Subject and Duration in weeks.",
      "Press Turn this into a plan, check it, then Confirm & Generate Outputs.",
      "Read the weekly topics, lessons and objectives. If you added material, sources are listed below the plan.",
    ],
    keywords: ["plan", "course", "weekly", "objectives", "term"],
    alt: ["plan my term", "week by week plan", "syllabus plan"],
    links: [{ label: "Go to Plan", href: "/teacher/plan" }],
  },
  // ---- Teach --------------------------------------------------------------
  {
    id: "slides", section: "teach",
    q: "How do slides work?",
    a: "You approve an outline first, so nothing is built until you are happy with it.",
    steps: [
      "Open Teach and choose Slides.",
      "Describe the topic, set Grade / Year, Subject and the number of slides, then press Turn this into a plan.",
      "Press Plan the deck.",
      "Under Review the outline, edit each slide's title and point, move slides up or down, remove one, or Add a slide.",
      "Press Build slides.",
      "Open the finished deck, then use the theme picker to change how it looks.",
    ],
    points: ["Slides come with speaker notes.", "Press Start over to discard the outline and begin again."],
    keywords: ["slides", "outline", "theme"],
    alt: ["make a presentation", "make a ppt", "powerpoint banana"],
    links: [{ label: "Make slides", href: "/teacher/create?type=slides" }],
  },
  {
    id: "lesson-notes", section: "teach",
    q: "What are lesson notes?",
    a: "Notes you can teach from, in the order you would explain them.",
    points: [
      "The explanation, step by step.",
      "Everyday examples.",
      "A closing recap.",
      "Built from your uploaded material when you add some.",
    ],
    steps: ["Open Teach and choose Lesson notes.", "Describe the topic and set grade and subject.", "Press Turn this into a plan, then Confirm & Generate Outputs."],
    keywords: ["notes", "explanation", "recap", "lesson"],
    links: [{ label: "Make lesson notes", href: "/teacher/create?type=lesson_notes" }],
  },
  {
    id: "activities", section: "teach",
    q: "What are class activities?",
    a: "A lesson in steps for a set number of minutes.",
    points: [
      "An explanation to open with.",
      "Something for students to do.",
      "A scenario to think through.",
      "Questions to check understanding.",
    ],
    steps: ["Open Teach and choose Class activities.", "Describe the topic, then choose a Duration in minutes under Customize.", "Press Turn this into a plan, then Confirm & Generate Outputs."],
    keywords: ["activity", "interactive", "engage", "group"],
    links: [{ label: "Make class activities", href: "/teacher/create?type=interactive" }],
  },
  {
    id: "narration", section: "teach",
    q: "How do I make an audio narration?",
    a: "Give Vivran a script and get it back as spoken audio.",
    steps: [
      "Open Teach and choose Narration.",
      "Paste or write the script you want read aloud.",
      "Press Turn this into a plan, then Confirm & Generate Outputs.",
      "Play the audio in the page, or find it again in Library.",
    ],
    keywords: ["narration", "audio", "listen"],
    links: [{ label: "Make narration", href: "/teacher/create?type=narration" }],
  },
  {
    id: "image", section: "teach",
    q: "Can Vivran make diagrams or pictures?",
    a: "Yes: a labelled diagram, infographic, illustration or photo-realistic picture.",
    steps: [
      "Open Teach and choose Image.",
      "Describe what you need.",
      "Choose a style, or press Enhance with AI to improve your description first.",
      "Generate, then check every label before you use it.",
    ],
    points: ["Generated labels can be wrong. Always check them."],
    keywords: ["image", "diagram", "infographic"],
    links: [{ label: "Make an image", href: "/teacher/create?type=image" }],
  },
  {
    id: "video", section: "teach",
    q: "How long does a video take?",
    a: "A short explainer clip takes 1 to 3 minutes.",
    steps: [
      "Open Teach and choose Video.",
      "Describe the topic and choose a style: whiteboard explainer, case study, animated infographic or slide read-along.",
      "Generate, then wait. You can use other pages meanwhile and a notice appears when it is ready.",
    ],
    keywords: ["video", "explainer", "minutes", "long"],
    links: [{ label: "Make a video", href: "/teacher/create?type=video" }],
  },
  // ---- Assess -------------------------------------------------------------
  {
    id: "quiz-test-worksheet", section: "assess",
    q: "What's the difference between a quiz, a test and a worksheet?",
    a: "They differ in length, structure and use:",
    points: [
      "Quiz: a short check, usually multiple choice. Good for an exit ticket.",
      "Test: a full paper with sections and marks that add up to a total.",
      "Worksheet: practice questions with an answer key, for homework or class.",
    ],
    keywords: ["quiz", "test", "worksheet", "difference"],
    alt: ["which one should i use"],
  },
  {
    id: "question-types", section: "assess",
    q: "Can I choose the question types and how many of each?",
    a: "Yes, under Customize on a quiz or test. The paper then has exactly that shape.",
    steps: [
      "Open Assess and choose Quiz or Test.",
      "Under Customize, find Question types and press each type you want: multiple choice, true or false, fill in the blanks, short answer, numerical, long answer or case-based.",
      "For each type you pick, choose how many questions (1 to 30) and the marks for each question.",
      "Check the total at the bottom: it shows the number of questions and total marks, and Total marks is set for you.",
      "Press Turn this into a plan, then Confirm & Generate Outputs.",
    ],
    points: [
      "A paper can have up to 60 questions and 200 marks.",
      "Sections come out in a fixed order: objective types first, then written.",
      "Leave Question types empty and Vivran shapes the paper for you.",
      "Picking types here overrides your usual Teaching style structure for that paper.",
    ],
    keywords: ["type", "mcq", "truefalse", "fillblank", "count", "many", "case", "subjective"],
    alt: ["10 mcq and 5 short questions", "how many questions", "only mcqs", "fill in the blanks paper", "set an exam paper", "arrange an exam for my class", "create a test with different question types", "add more questions to my test"],
    links: [{ label: "Make a test", href: "/teacher/assess?mode=test" }],
  },
  {
    id: "marks-total", section: "assess",
    q: "Will the marks add up to the total?",
    a: "Yes. Vivran fixes the marks before it writes a single question.",
    points: [
      "Each section's questions and marks are decided first, so the total is exact.",
      "Every paper is checked against the total after it is written.",
      "If something is off, the problem is listed above the paper as Validation issues.",
      "If it is, regenerate the paper, or regenerate just the question concerned.",
    ],
    keywords: ["marks", "total", "add", "sum"],
    alt: ["marks are not adding up", "total is wrong"],
  },
  {
    id: "regenerate", section: "assess",
    q: "How do I change just one question?",
    a: "Select it in the paper and regenerate it. The rest stays as it is.",
    steps: [
      "Click the question in the paper preview so it is highlighted.",
      "In the Regenerate Selected Question panel on the right, choose harder, easier, application, conceptual or case.",
      "Press Regenerate.",
      "Read the new question and its answer.",
    ],
    keywords: ["edit", "regenerate", "one", "single", "question", "harder", "easier"],
    alt: ["replace a question", "i don't like one question", "ek question badalna"],
  },
  {
    id: "answers", section: "assess",
    q: "Does the paper come with answers?",
    a: "Yes, for every question.",
    points: [
      "Each question has an answer and a short solution or marking points.",
      "In the PDF the answer key is on its own last page, so you can print the paper without it.",
    ],
    keywords: ["answer", "solution", "key", "marking"],
  },
  {
    id: "difficulty", section: "assess",
    q: "How do I make a paper harder or easier?",
    a: "Set it before generating, or change single questions after.",
    steps: [
      "Before generating: under Customize, choose Difficulty (Easy, Medium or Hard).",
      "To always start from your preference: set Default difficulty under Settings and press Save preferences.",
      "After generating: select a question and regenerate it as harder or easier.",
    ],
    keywords: ["difficulty", "harder", "easier", "level"],
  },
  // ---- Materials and sources ---------------------------------------------
  {
    id: "upload", section: "material",
    q: "What can I upload?",
    a: "PDF, Word and PowerPoint files, and YouTube links.",
    steps: [
      "Open My materials.",
      "Drag a file onto the box, or click \"or click to browse\".",
      "For a YouTube video, paste its link into the box and press Add. Vivran uses the transcript.",
      "Wait until it shows READY. A large file can take a minute; you can use other pages meanwhile.",
    ],
    points: [
      "Accepted: .pdf, .docx, .pptx and YouTube links.",
      "Typed files work best; scanned pages and photos may not be readable.",
      "Each file in the list shows its status and a short summary, so you can confirm it was understood.",
    ],
    keywords: ["material", "upload", "pdf", "youtube", "scan", "format"],
    alt: ["can i upload my textbook", "which files", "add notes"],
    links: [{ label: "Go to My materials", href: "/teacher/materials" }],
  },
  {
    id: "grounded", section: "material",
    q: "What does \"Grounded on N excerpts\" mean?",
    a: "Vivran found N passages in your materials that match the topic, and wrote from them.",
    points: [
      "Each question lists the page, slide or moment it came from.",
      "Open a paper and look under a question to see where it came from.",
      "Use them to check a question against your own book.",
    ],
    keywords: ["source", "grounded", "excerpt", "cite", "page"],
    alt: ["where did this question come from", "is it from my book"],
  },
  {
    id: "no-source", section: "material",
    q: "Why does a question have no source?",
    a: "No passage in your materials matched it, so it was written from general subject knowledge.",
    steps: [
      "Read the question and its answer carefully before using it.",
      "Or upload the chapter that covers it under My materials.",
      "Generate again, and choose that file as the Source material under Customize.",
    ],
    keywords: ["nosource", "missing", "hallucination", "accurate"],
    alt: ["is this question correct", "question not from my material"],
  },
  {
    id: "pick-material", section: "material",
    q: "How do I make a paper from one specific chapter?",
    a: "Choose it as the Source material.",
    steps: [
      "Upload the chapter under My materials and wait for READY.",
      "On Assess, open Customize.",
      "Under Source material, pick the file.",
      "Generate. Without this, Vivran searches all your materials for the topic.",
    ],
    keywords: ["specific", "chapter", "one", "source", "select"],
    alt: ["only from this pdf"],
  },
  // ---- Teaching style -----------------------------------------------------
  {
    id: "what-style", section: "style",
    q: "What is Teaching style?",
    a: "Vivran learns how you usually build papers, and uses it only if you say so.",
    points: [
      "It reads past papers you add: sections, marks, the kind of thinking your questions ask for, and timing.",
      "It then suggests patterns. Nothing is used until you accept it.",
      "It shapes the format of a new paper, never its facts.",
      "Patterns stay within the subject they came from.",
    ],
    steps: [
      "Open Teaching style from the sidebar.",
      "Choose the Subject and tick the two confirmations.",
      "Add at least two past papers from that subject.",
      "Under What Vivran noticed, press Use this or Not for me on each pattern.",
      "Make a paper in that subject. It says \"Shaped by your teaching style\".",
    ],
    keywords: ["style", "past", "habit", "learn", "personal"],
    alt: ["make papers like mine", "use my old papers"],
    links: [{ label: "Go to Teaching style", href: "/teacher/memory" }],
  },
  {
    id: "style-stored", section: "style",
    q: "Are my past papers stored?",
    a: "No. Vivran keeps what it read, not the file.",
    points: [
      "Kept: structure, marks, timing and short question excerpts with names removed.",
      "Not kept: the file itself.",
      "Remove one file with the bin icon next to it, or press Forget everything at the bottom of the page.",
    ],
    keywords: ["stored", "keep", "past", "file", "privacy"],
  },
  {
    id: "style-nothing", section: "style",
    q: "Why hasn't Vivran suggested anything yet?",
    a: "Check these, in order:",
    steps: [
      "Have you added at least two exam papers from the same subject? One paper is not a pattern.",
      "Did each file say Read as exam paper? Files marked as needing review are not used yet; the page says why.",
      "Do the marks in each paper add up to the total printed at its top? If not, its structure is not trusted.",
      "Did you choose the right Subject for both? Patterns only combine papers from the same subject.",
      "Is the file typed? Scanned pages and photos cannot be read yet.",
    ],
    keywords: ["nosuggest", "nothing", "suggest", "empty"],
  },
  {
    id: "style-off", section: "style",
    q: "How do I make a paper without my style?",
    a: "Do it for one paper, or stop using a pattern for good.",
    steps: [
      "For one paper: under the finished paper, in the Shaped by your teaching style box, press Make it without my style.",
      "For good: open Teaching style and press Stop using on the pattern.",
      "Or press Manage in that box to jump to the page.",
    ],
    keywords: ["style", "off", "without", "stop", "disable"],
    alt: ["i dont like how my paper looks", "go back to the default paper", "ignore my old papers"],
  },
  {
    id: "student-work", section: "style",
    q: "Can I upload marked answer sheets or student work?",
    a: "No. Upload blank papers and answer keys only.",
    points: [
      "Vivran may decline files that look like student work, such as a filled-in name or roll number with marks on it.",
      "Remove students' names, roll numbers and marks before uploading.",
      "Where names are found, Vivran may remove them, but this is a safeguard, not a guarantee.",
      "You confirm there is no student data each time you upload.",
    ],
    keywords: ["student", "answer", "marked", "script", "names"],
  },
  // ---- Library -------------------------------------------------------------
  {
    id: "library", section: "library",
    q: "Where is everything I've made?",
    a: "In Library. Everything you make is saved automatically.",
    steps: [
      "Open Library from the sidebar.",
      "Use Filter by type to narrow the list.",
      "Press Open → on any item to continue working on it.",
    ],
    keywords: ["library", "saved", "find", "old", "previous", "history"],
    alt: ["i lost my paper", "where did my slides go", "where can i see what i made", "the papers i created last week", "open something i made earlier"],
    links: [{ label: "Go to Library", href: "/teacher/library" }],
  },
  {
    id: "delete-item", section: "library",
    q: "How do I rename or delete something I made?",
    a: "Both are on each item's card in Library.",
    steps: [
      "To rename: press the pencil icon, type the new name, then press the tick to save (or the cross to cancel).",
      "To delete: press the bin icon, then press Delete when it asks \"Delete for good?\". Press Keep to cancel.",
    ],
    points: ["Deleting cannot be undone."],
    keywords: ["rename", "title"],
  },
  // ---- Exports -------------------------------------------------------------
  {
    id: "pdf", section: "export",
    q: "How do I print a paper?",
    a: "Export it as a PDF.",
    steps: [
      "Generate a paper or open one from Library.",
      "Press Export PDF above the paper.",
      "Open the downloaded file and print it.",
    ],
    points: ["The answer key is on its own last page. Print only the first pages to hand out the paper without answers."],
    keywords: ["export", "pdf", "print", "download"],
    alt: ["download the paper", "word file"],
  },
  {
    id: "tally", section: "export",
    q: "How do I share a quiz online with students?",
    a: "Export the paper's multiple-choice questions as an online quiz.",
    steps: [
      "Generate a paper that includes multiple-choice questions.",
      "Press Export to Tally above the paper.",
      "When the green message appears, press Open form → to see it.",
      "Share the link with your students.",
    ],
    points: [
      "Only multiple-choice questions are included; the message tells you how many other questions were left out.",
      "The Export to Tally button only appears when the paper has multiple-choice questions.",
    ],
    keywords: ["export", "online", "link", "share", "tally", "form", "google"],
    alt: ["google form", "send to students"],
  },
  // ---- Privacy ---------------------------------------------------------------
  {
    id: "who-sees", section: "privacy",
    q: "Can other teachers see my material?",
    a: "No. Everything stays in your own account.",
    points: [
      "Your materials and everything you make are visible only to you.",
      "Other teachers' work is never mixed into yours.",
      "Teaching style is learned only from the papers you add.",
    ],
    keywords: ["privacy", "see", "share", "others", "visible"],
    alt: ["who can look at my files", "who can see my uploaded books", "is my work private", "can colleagues access my papers"],
  },
  {
    id: "ai-provider", section: "privacy",
    q: "Is my material used to train AI?",
    a: "To write each item, Vivran sends the parts of your material it needs to its AI provider.",
    points: [
      "Only the passages relevant to the request are sent, not everything you uploaded.",
      "The privacy policy explains what the provider may do with them.",
      "Do not upload anything sensitive, such as student records.",
      "Your past papers on the Teaching style page are never sent; only the description of a pattern you accepted is.",
    ],
    keywords: ["training", "ai", "google", "gemini", "privacy"],
    links: [{ label: "Privacy policy", href: "/privacy" }],
  },
  {
    id: "delete-account", section: "privacy",
    q: "How do I delete my account and data?",
    a: "From Settings. It cannot be undone.",
    steps: [
      "Open Settings and scroll to Delete account.",
      "Type DELETE in the box to confirm.",
      "Press Delete my account.",
    ],
    points: ["This removes your profile, workspace, uploaded files and everything you created."],
    keywords: ["delete", "account", "remove", "data"],
    links: [{ label: "Go to Settings", href: "/teacher/settings" }],
  },
  // ---- Settings ----------------------------------------------------------------
  {
    id: "defaults", section: "settings",
    q: "How do I change my default subjects, grades or language?",
    a: "In Settings. They fill in automatically, and you can still change them each time.",
    steps: [
      "Open Settings.",
      "Choose your Subjects, Grade levels, Language and Default difficulty.",
      "Press Save preferences and wait for Saved.",
    ],
    points: ["You must pick at least one subject and grade.", "\"Unsaved changes\" appears if you have not saved yet."],
    keywords: ["settings", "default", "subject", "grade", "class", "profile"],
    links: [{ label: "Go to Settings", href: "/teacher/settings" }],
  },
  {
    id: "cost", section: "settings",
    q: "Does Vivran cost anything?",
    a: "No. Vivran is free for teachers.",
    points: ["There is no card to add and no trial that runs out.", "Students and institutions: talk to us."],
    keywords: ["cost", "free", "price", "pay"],
    alt: ["kitna paisa", "is it free"],
  },
  {
    id: "error", section: "settings",
    q: "Something went wrong. What do I do?",
    a: "Try these, in order:",
    steps: [
      "Wait a minute and try again. Most errors come from busy AI servers and clear on their own.",
      "Refresh the page, then check Library: if it was saved, it is already there.",
      "Check that Grade / Year and Subject are chosen, and that the file you uploaded shows READY.",
      "If it keeps happening, email us what you were making and the message you saw.",
    ],
    keywords: ["error", "wrong", "failed", "stuck", "slow", "working"],
    alt: ["it is not working", "generation failed"],
  },
  {
    id: "contact", section: "settings",
    q: "How do I reach the Vivran team?",
    a: "Use the Talk to us card at the bottom of this page.",
    points: ["Email is always available.", "Say what you were doing and what you expected, if you can.", "Every message is read and answered by a person."],
    keywords: ["contact", "help", "support", "team", "founder"],
    alt: ["talk to someone", "baat karni hai", "speak to a human", "i need a real person"],
  },
];
