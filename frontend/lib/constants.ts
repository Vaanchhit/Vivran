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
  { value: "course_plan", label: "Course Plan" },
  { value: "slides", label: "Slides" },
  { value: "worksheet", label: "Worksheet" },
  { value: "lesson_notes", label: "Lesson Notes" },
  { value: "assessment", label: "Test / Quiz Paper" },
  { value: "interactive", label: "Interactive Coursework" },
];

export const DURATION_WEEKS_OPTIONS = [1, 2, 3, 4, 6, 8];
export const DURATION_MINUTES_OPTIONS = [15, 20, 30, 45, 60, 90];
export const SLIDE_COUNT_OPTIONS = [6, 8, 10, 12, 16, 20];
export const WORKSHEET_QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];
export const TOTAL_MARKS_OPTIONS = [10, 20, 25, 30, 40, 50, 60, 80, 100];
