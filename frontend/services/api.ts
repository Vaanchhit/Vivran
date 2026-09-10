const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface ParseIntentResponse {
  intent: {
    task_type: string;
    grade: string;
    subject: string;
    topics: string[];
    marks: number | null;
    difficulty: string;
    application_weight: number;
    requested_artifacts: string[];
  };
  ai_route: {
    model_tier: string;
    model_name: string;
    task_type: string;
    status: string;
  };
  message: string;
}

export interface AssessmentGenerateResponse {
  assessment: Record<string, unknown>;
  validation: { valid: boolean; errors: string[] };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      if (err?.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch {
      // ignore JSON parse errors; fall back to status text
    }
    throw new Error(`API error (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function parseTeacherIntent(
  prompt: string,
  subject?: string,
  grade?: string,
): Promise<ParseIntentResponse> {
  return post<ParseIntentResponse>("/workflow/parse-intent", { teacher_prompt: prompt, subject, grade });
}

export async function generateAssessmentPaper(
  grade: string,
  subject: string,
  topics: string[],
  totalMarks: number = 40,
): Promise<AssessmentGenerateResponse> {
  return post<AssessmentGenerateResponse>("/assessments/generate", {
    grade,
    subject,
    topics,
    total_marks: totalMarks,
  });
}

export async function regenerateQuestion(questionId: string, option: string) {
  return post<{ status: string; question_id: string; option_applied: string; new_question: unknown }>(
    `/questions/${questionId}/regenerate`,
    { option },
  );
}