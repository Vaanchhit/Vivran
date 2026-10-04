export const WAITLIST_EMAIL = "info@vivran.co.in";

export const REQUEST_ACCESS_MAILTO = `mailto:${WAITLIST_EMAIL}?${new URLSearchParams({
  subject: "Vivran Beta Access Request",
  body:
    "Hi Vivran team,\n\n" +
    "I'd like to request access to the Vivran teacher beta — I don't have a referral code yet.\n\n" +
    "Name: \n" +
    "College / Institution: \n" +
    "Subject(s) you teach: \n\n" +
    "Thanks!",
}).toString().replace(/\+/g, "%20")}`;

export const GRADE_LEVEL_OPTIONS = [
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12",
  "College 1st Year",
  "College 2nd Year",
  "College 3rd Year",
  "College 4th Year",
  "College 5th Year",
];

// Commerce/college subjects listed first — primary beta audience is commerce
// college professors — school subjects kept alongside, not removed.
export const SUBJECT_OPTIONS = [
  "Business Studies",
  "Economics",
  "Accountancy",
  "Accounting & Finance",
  "Marketing",
  "Business Law",
  "Statistics",
  "Entrepreneurship",
  "Organisational Behaviour",
  "Income Tax Law",
  "Auditing",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Science",
  "English",
  "History",
  "Geography",
  "Computer Science",
];

// Starter list for the onboarding wizard's language preference — major
// Indian languages given the target audience (commerce college teachers in
// India), plus "Other" which reveals a free-text field. Not a closed list:
// same "preset + custom option live" principle used everywhere else.
export const LANGUAGE_OPTIONS = [
  "English",
  "Hindi",
  "Bengali",
  "Tamil",
  "Telugu",
  "Marathi",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Punjabi",
  "Urdu",
  "Other",
];

export const DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export const ARTIFACT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "course_plan", label: "Course plan" },
  { value: "lesson_notes", label: "Lesson notes" },
  { value: "slides", label: "Slides" },
  { value: "interactive", label: "Class activities" },
  { value: "assessment", label: "Quiz or test" },
  { value: "worksheet", label: "Worksheet" },
];

export const DURATION_WEEKS_OPTIONS = [1, 2, 3, 4, 6, 8];
export const DURATION_MINUTES_OPTIONS = [15, 20, 30, 45, 60, 90];
export const SLIDE_COUNT_OPTIONS = [5, 6, 7, 8];
export const WORKSHEET_QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];
export const TOTAL_MARKS_OPTIONS = [10, 20, 25, 30, 40, 50, 60, 80, 100];

/** Question types a teacher can build a paper from, in the order a paper
 * presents them. Mirrors QUESTION_TYPES in backend/app/generation/assessments.py:
 * the marks each and the starting count are only where the dropdowns begin. */
export type QuestionType = "mcq" | "true_false" | "fill_blank" | "short_answer" | "numerical" | "long_answer" | "case_based";

export const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string; marks: number; count: number }[] = [
  { value: "mcq", label: "Multiple choice", marks: 1, count: 10 },
  { value: "true_false", label: "True or false", marks: 1, count: 5 },
  { value: "fill_blank", label: "Fill in the blanks", marks: 1, count: 5 },
  { value: "short_answer", label: "Short answer", marks: 2, count: 5 },
  { value: "numerical", label: "Numerical", marks: 3, count: 3 },
  { value: "long_answer", label: "Long answer", marks: 5, count: 3 },
  { value: "case_based", label: "Case-based", marks: 4, count: 2 },
];
export const QUESTION_COUNT_PER_TYPE_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
export const MARKS_EACH_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];
/** Same ceilings the API enforces (backend/app/api/assessments.py). */
export const MAX_PAPER_QUESTIONS = 60;
export const MAX_PAPER_MARKS = 200;

/** WhatsApp number for the Help page's "talk to us", digits only with the
 * country code and no "+" (for example "919876543210"). Empty hides the
 * WhatsApp and phone links everywhere; email still shows. Every signed-in
 * teacher can see this number. */
export const FOUNDER_WHATSAPP = "";

/** Email from the Help page, with the teacher's unanswered question already in it. */
export function helpMailto(question?: string): string {
  const params = new URLSearchParams({
    subject: question ? `Question about Vivran: ${question.slice(0, 80)}` : "Question about Vivran",
    body: (question ? `My question:\n${question}\n\n` : "") + "What I was trying to do:\n\n",
  });
  return `mailto:${WAITLIST_EMAIL}?${params.toString().replace(/\+/g, "%20")}`;
}

export function helpWhatsApp(question?: string): string | null {
  if (!FOUNDER_WHATSAPP) return null;
  const text = question ? `Hi, I have a question about Vivran: ${question}` : "Hi, I have a question about Vivran.";
  return `https://wa.me/${FOUNDER_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
