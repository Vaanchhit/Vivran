export type Role = "teacher" | "student" | "institution";

export interface UserSession {
  username: string;
  name: string;
  role: Role;
  school?: string;
  authenticated: boolean;
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
  updatedAt: string;
  artifacts: string[];
}

export interface Question {
  id: number;
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

