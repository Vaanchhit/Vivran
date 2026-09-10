const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface ApiAuth {
  accessToken: string | null;
  workspaceId: string | null;
}

const apiAuth: ApiAuth = { accessToken: null, workspaceId: null };

/** Called by the auth layer after login to attach the Bearer token to API calls. */
export function setApiAuth(accessToken: string | null, workspaceId: string | null = null) {
  apiAuth.accessToken = accessToken;
  apiAuth.workspaceId = workspaceId;
}

export function clearApiAuth() {
  apiAuth.accessToken = null;
  apiAuth.workspaceId = null;
}

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

export interface ProvisionResponse {
  status: string;
  user_id: string;
  email: string;
  full_name: string;
  workspace_id: string;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiAuth.accessToken) {
    headers["Authorization"] = `Bearer ${apiAuth.accessToken}`;
  }
  if (apiAuth.workspaceId) {
    headers["Workspace-Id"] = apiAuth.workspaceId;
  }
  return headers;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...buildHeaders(), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
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

export async function provisionWorkspace(accessToken: string): Promise<ProvisionResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/provision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Provisioning failed (${res.status})`);
  }
  return res.json();
}

export async function parseTeacherIntent(
  prompt: string,
  subject?: string,
  grade?: string,
): Promise<ParseIntentResponse> {
  return request<ParseIntentResponse>("POST", "/workflow/parse-intent", {
    teacher_prompt: prompt,
    subject,
    grade,
  });
}

export async function generateAssessmentPaper(
  grade: string,
  subject: string,
  topics: string[],
  totalMarks: number = 40,
): Promise<AssessmentGenerateResponse> {
  return request<AssessmentGenerateResponse>("POST", "/assessments/generate", {
    grade,
    subject,
    topics,
    total_marks: totalMarks,
  });
}

export async function regenerateQuestion(questionId: string, option: string) {
  return request<{ status: string; question_id: string; option_applied: string; new_question: unknown }>(
    "POST",
    `/questions/${questionId}/regenerate`,
    { option },
  );
}