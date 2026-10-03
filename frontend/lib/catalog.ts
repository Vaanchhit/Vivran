import {
  BookOpenCheck,
  CalendarRange,
  FileCheck,
  FileSpreadsheet,
  HelpCircle,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Presentation,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * Everything Vivran makes, grouped the way a teacher works: plan the course,
 * teach it, check what was learned. The sidebar, the dashboard shortcuts, the
 * cards on each page and the library filter all read this list, so a thing is
 * called the same name wherever it appears.
 */

export type StageKey = "plan" | "teach" | "assess";

export interface CatalogItem {
  /** Library kind it is saved as, or the page mode for quiz/test (both save as "assessment"). */
  key: string;
  title: string;
  desc: string;
  /** The hover explanation: one sentence that adds to `desc` rather than repeating it. */
  explain: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

export interface Stage {
  key: StageKey;
  label: string;
  blurb: string;
  href: string;
  items: CatalogItem[];
}

export const STAGES: Stage[] = [
  {
    key: "plan",
    label: "Plan",
    blurb: "Map out a course, week by week",
    href: "/teacher/plan",
    items: [
      { key: "course_plan", title: "Course plan", desc: "Topics, weekly lessons and learning objectives.", explain: "Tell Vivran the ground to cover and how many weeks. You get topics in order, lessons for each week and objectives, citing your uploaded material where it was used.", href: "/teacher/plan", icon: CalendarRange, color: "text-accent" },
    ],
  },
  {
    key: "teach",
    label: "Teach",
    blurb: "Material for the classroom",
    href: "/teacher/create",
    items: [
      { key: "lesson_notes", title: "Lesson notes", desc: "Teaching notes with real-life examples and a recap.", explain: "Notes you can teach from: explanations in order, everyday examples and a closing recap, built from your own material when you add it.", href: "/teacher/create?type=lesson_notes", icon: BookOpenCheck, color: "text-chrome" },
      { key: "slides", title: "Slides", desc: "A deck you review as an outline first, then build.", explain: "You approve an outline first, then pick a theme. Vivran builds 5 to 8 slides with speaker notes, so nothing is made before you have seen the plan.", href: "/teacher/create?type=slides", icon: Presentation, color: "text-tint-bronze" },
      { key: "interactive", title: "Class activities", desc: "Activities, scenarios and quick checks for the lesson.", explain: "A lesson in steps for a set number of minutes: an explanation, something for students to do, a scenario to think through and questions to check understanding.", href: "/teacher/create?type=interactive", icon: MessageSquare, color: "text-tint-rose" },
      { key: "narration", title: "Narration", desc: "Narrated audio of a lesson script.", explain: "Paste or write a lesson script and get it back as spoken audio, ready to play in class or share with students.", href: "/teacher/create?type=narration", icon: Mic, color: "text-tint-umber" },
      { key: "image", title: "Image", desc: "A diagram or illustration. Check any labels before use.", explain: "Describe what you need and choose a style: labelled diagram, infographic, illustration or photo-realistic. Generated labels can be wrong, so check them.", href: "/teacher/create?type=image", icon: ImageIcon, color: "text-tint-clay" },
      { key: "video", title: "Video", desc: "A short explainer clip. Takes 1 to 3 minutes.", explain: "A short clip in a style you choose, such as a whiteboard explainer, a case study or a slide read-along.", href: "/teacher/create?type=video", icon: Video, color: "text-tint-bronze" },
    ],
  },
  {
    key: "assess",
    label: "Assess",
    blurb: "Check what your class has learned",
    href: "/teacher/assess",
    items: [
      { key: "quiz", title: "Quiz", desc: "Short exit tickets, MCQs and quick checks.", explain: "Quick checks for the end of a lesson, with answers. Multiple-choice questions can be sent to students as an online Tally form.", href: "/teacher/assess?mode=quiz", icon: HelpCircle, color: "text-tint-rose" },
      { key: "test", title: "Test", desc: "A full exam paper with sections and marks.", explain: "A full paper whose marks add up to your total exactly, with answers. Questions show which page of your material they came from.", href: "/teacher/assess?mode=test", icon: FileCheck, color: "text-tint-olive" },
      { key: "worksheet", title: "Worksheet", desc: "Practice questions with an answer key.", explain: "Practice questions at the count you choose, each with an answer, for homework or class practice.", href: "/teacher/assess?mode=worksheet", icon: FileSpreadsheet, color: "text-tint-olive" },
    ],
  },
];

export function stage(key: StageKey): Stage {
  return STAGES.find((s) => s.key === key)!;
}

/** Library filter groups, keyed by the kind each item is saved as. */
export const LIBRARY_KINDS: { kind: string; label: string; stage: StageKey }[] = [
  { kind: "course_plan", label: "Course plans", stage: "plan" },
  { kind: "lesson_notes", label: "Lesson notes", stage: "teach" },
  { kind: "slides", label: "Slides", stage: "teach" },
  { kind: "interactive", label: "Class activities", stage: "teach" },
  { kind: "narration", label: "Narration", stage: "teach" },
  { kind: "image", label: "Images", stage: "teach" },
  { kind: "video", label: "Videos", stage: "teach" },
  { kind: "assessment", label: "Quizzes and tests", stage: "assess" },
  { kind: "worksheet", label: "Worksheets", stage: "assess" },
];

/** Singular name for one saved item of a kind. */
export const KIND_LABELS: Record<string, string> = {
  course_plan: "Course plan",
  lesson_notes: "Lesson notes",
  slides: "Slides",
  interactive: "Class activities",
  narration: "Narration",
  image: "Image",
  video: "Video",
  assessment: "Quiz or test",
  worksheet: "Worksheet",
};
