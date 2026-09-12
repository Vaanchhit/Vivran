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
  degraded: boolean;
  message: string;
}

export interface AssessmentGenerateResponse {
  assessment: Record<string, unknown> | null;
  validation: { valid: boolean; errors: string[] };
  grounded_on?: number;
  assessment_id?: string;
  question_ids?: string[];
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

async function parseErrorDetail(res: Response): Promise<string> {
  let detail = res.statusText;
  try {
    const err = await res.json();
    if (err?.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
  } catch {
    // ignore JSON parse errors; fall back to status text
  }
  return detail;
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
    throw new Error(`API error (${res.status}): ${await parseErrorDetail(res)}`);
  }
  return res.json();
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const headers = buildHeaders();
  delete headers["Content-Type"]; // browser sets the multipart boundary itself
  const res = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers, body: form });
  if (!res.ok) {
    throw new Error(`API error (${res.status}): ${await parseErrorDetail(res)}`);
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
  difficulty: string = "medium",
  materialId?: string,
): Promise<AssessmentGenerateResponse> {
  return request<AssessmentGenerateResponse>("POST", "/assessments/generate", {
    grade,
    subject,
    topics,
    total_marks: totalMarks,
    difficulty,
    material_id: materialId,
  });
}

export async function regenerateQuestion(questionId: string, option: string) {
  return request<{ status: string; question_id: string; option_applied: string; new_question: unknown }>(
    "POST",
    `/questions/${questionId}/regenerate`,
    { option },
  );
}

export interface Material {
  id: string;
  workspace_id: string;
  title: string;
  type: "pdf" | "docx" | "pptx" | "youtube";
  external_url?: string | null;
  subject?: string | null;
  grade?: string | null;
  processing_status: "PROCESSING" | "READY" | "FAILED";
  chunk_count?: number;
  created_at?: string;
}

export async function listMaterials(): Promise<Material[]> {
  return request<Material[]>("GET", "/materials");
}

export async function uploadMaterial(params: {
  title: string;
  type: "pdf" | "docx" | "pptx" | "youtube";
  file?: File;
  externalUrl?: string;
  subject?: string;
  grade?: string;
}): Promise<Material> {
  const form = new FormData();
  form.append("title", params.title);
  form.append("type", params.type);
  if (params.file) form.append("file", params.file);
  if (params.externalUrl) form.append("external_url", params.externalUrl);
  if (params.subject) form.append("subject", params.subject);
  if (params.grade) form.append("grade", params.grade);
  return requestForm<Material>("/materials", form);
}

export interface CoursePlan {
  title: string;
  grade: string;
  subject: string;
  duration_weeks: number;
  weekly_structure: { week: number; topic: string; lessons: string[]; objectives?: string[] }[];
  grounded_on?: number;
  error?: string;
}

export async function generateCoursePlan(params: {
  title: string;
  grade: string;
  subject: string;
  topics: string[];
  durationWeeks?: number;
}): Promise<{ id: string; course_plan: CoursePlan }> {
  return request("POST", "/projects", {
    title: params.title,
    type: "course_plan",
    grade: params.grade,
    subject: params.subject,
    topics: params.topics,
    duration_weeks: params.durationWeeks ?? 3,
  });
}

export interface SlidesResult {
  title: string;
  slide_count: number;
  slides: { slide_number: number; title: string; bullet_points: string[]; speaker_notes?: string }[];
  grounded_on?: number;
  error?: string;
}

export async function generateSlides(topic: string, slideCount = 12, grade?: string, subject?: string): Promise<SlidesResult> {
  return request("POST", "/content/slides", { topic, slide_count: slideCount, grade, subject });
}

export interface WorksheetResult {
  title: string;
  instructions: string;
  question_count: number;
  questions: { question_text: string; answer: string }[];
  grounded_on?: number;
  error?: string;
}

export async function generateWorksheet(topic: string, questionCount = 10, grade?: string, subject?: string): Promise<WorksheetResult> {
  return request("POST", "/content/worksheet", { topic, question_count: questionCount, grade, subject });
}

export interface LessonNotesResult {
  title: string;
  sections: { heading: string; content: string }[];
  real_life_examples: string[];
  recap: string;
  grounded_on?: number;
  error?: string;
}

export async function generateLessonNotes(topic: string, grade?: string, subject?: string): Promise<LessonNotesResult> {
  return request("POST", "/content/lesson-notes", { topic, grade, subject });
}

export interface InteractiveResult {
  title: string;
  duration_minutes: number;
  blocks: { type: string; position: number; content: Record<string, unknown> }[];
  grounded_on?: number;
  error?: string;
}

export async function generateInteractiveCoursework(topic: string, durationMinutes = 15, grade?: string, subject?: string): Promise<InteractiveResult> {
  return request("POST", "/content/interactive", { topic, duration_minutes: durationMinutes, grade, subject });
}

export async function generateNarration(script: string, provider: "elevenlabs" | "cartesia" = "elevenlabs") {
  return request<{ provider: string; status: string; media_url: string }>("POST", "/content/narration", { script, provider });
}