export type Role = "teacher" | "student" | "institution";

export interface UserSession {
  id: string;
  email: string;
  name: string;
  username: string;
  role: Role;
  school?: string;
  avatar_url?: string;
  workspace_id?: string;
  authenticated: boolean;
  /** Whether the first-time subject/grade/language onboarding wizard has
   * been completed. Defaults to `true` (fail-open) whenever it can't be
   * determined, so a backend hiccup never traps someone behind a wizard
   * they can't get past — see auth-context.tsx's toUserSession(). */
  onboardingCompleted: boolean;
  /** Whether the beta referral-code gate has been passed. Persisted
   * server-side per account so it covers every sign-in method, including
   * Google OAuth. Defaults to `true` (fail-open) whenever it can't be
   * determined — see auth-context.tsx's toUserSession(). */
  referralVerified: boolean;
  preferredSubjects?: string[];
  preferredGrades?: string[];
  preferredLanguage?: string;
  preferredDifficulty?: string;
}

export interface IntentRequirement {
  raw_prompt: string;
  grade: string;
  subject: string;
  topics: string[];
  marks: number | null;
  difficulty: "Easy" | "Medium" | "Hard";
  application_weight: string;
  question_types: string[];
  duration_minutes: number | null;
  source_material: string;
}

export interface Project {
  id: string;
  title: string;
  type: "Course Pack" | "Assessment Pack" | "Interactive Coursework" | "Lesson Pack";
  updated: string;
  artifacts: string[];
}

export interface Question {
  id: string;
  num: string;
  type: string;
  marks: number;
  text: string;
  options?: string[];
  answer: string;
  solution?: string;
  difficulty: string;
  bloom?: string;
  source?: string;
}