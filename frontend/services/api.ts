import type { Placement } from "@/lib/slidekit/matcher";
import type { SourceChunk } from "@/lib/slidekit-bridge";
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

export interface Source {
  chunk_id: string;
  source_material?: string | null;
  page_number?: number | null;
  excerpt: string;
}

export interface AssessmentGenerateResponse {
  assessment: Record<string, unknown> | null;
  validation: { valid: boolean; errors: string[] };
  grounded_on?: number;
  sources?: Source[];
  assessment_id?: string;
  question_ids?: string[];
  library_id?: string;
  /** The teacher's accepted style traits that shaped this paper (empty when none). */
  style_applied?: { key: string; summary: string }[];
}

export interface ProvisionResponse {
  status: string;
  user_id: string;
  email: string;
  full_name: string;
  workspace_id: string;
  onboarding_completed: boolean;
  referral_verified: boolean;
  subjects: string[];
  grades: string[];
  preferred_language: string | null;
  preferred_difficulty: string | null;
}

export interface PreferencesPayload {
  subjects: string[];
  grades: string[];
  preferred_language?: string;
  preferred_difficulty?: string;
}

export interface PreferencesResponse {
  status: string;
  onboarding_completed: boolean;
  subjects: string[];
  grades: string[];
  preferred_language: string | null;
  preferred_difficulty: string | null;
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

/** Carries the HTTP status without putting it in `message`.
 *
 * The backend already translates upstream failures into copy meant to be read
 * by a teacher (see backend/app/core/errors.py). Prefixing that with
 * "API error (402): " undid the translation, so the status lives here instead
 * — still one property away in devtools, no longer in the sentence. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiError(res: Response): Promise<ApiError> {
  let detail = "";
  try {
    const err = await res.json();
    if (err?.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
  } catch {
    // ignore JSON parse errors; fall back below
  }
  // A bare status line ("Internal Server Error") tells a teacher nothing, so
  // only surface it when the backend sent no curated message at all.
  return new ApiError(res.status, detail || "Something went wrong — please try again.");
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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
    throw await apiError(res);
  }
  return res.json();
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const headers = buildHeaders();
  delete headers["Content-Type"]; // browser sets the multipart boundary itself
  const res = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers, body: form });
  if (!res.ok) {
    throw await apiError(res);
  }
  return res.json();
}

async function requestBlob(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await apiError(res);
  }
  return res.blob();
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

export async function updatePreferences(payload: PreferencesPayload): Promise<PreferencesResponse> {
  return request<PreferencesResponse>("PUT", "/auth/preferences", payload);
}

export async function deleteAccount(): Promise<{ status: string }> {
  return request<{ status: string }>("DELETE", "/auth/account");
}

/** Checked before supabase.auth.signUp() during beta — no session exists
 * yet at this point, so this call is unauthenticated by design. Fast-fail
 * UX only for the email/password form; NOT the authoritative gate — see
 * verifyReferralForAccount() below. */
export async function verifyReferralCode(code: string): Promise<boolean> {
  const { valid } = await request<{ valid: boolean }>("POST", "/auth/verify-referral", { code });
  return valid;
}

/** The authoritative referral gate — called on an already-signed-in user
 * (any sign-in method, including Google OAuth) and persisted server-side
 * against their account. TeacherLayout blocks the product until this
 * returns true; see referral-gate.tsx. */
export async function verifyReferralForAccount(code: string): Promise<boolean> {
  const { valid } = await request<{ valid: boolean }>("POST", "/auth/verify-referral-account", { code });
  return valid;
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
  useStyle: boolean = true,
): Promise<AssessmentGenerateResponse> {
  return request<AssessmentGenerateResponse>("POST", "/assessments/generate", {
    grade,
    subject,
    topics,
    total_marks: totalMarks,
    difficulty,
    material_id: materialId,
    use_style: useStyle,
  });
}

export async function downloadAssessmentPdf(assessment: Record<string, unknown>, includeAnswerKey: boolean = true) {
  const blob = await requestBlob("/assessments/export/pdf", { assessment, include_answer_key: includeAnswerKey });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(assessment.title as string) || "assessment"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportAssessmentToTally(assessment: Record<string, unknown>) {
  return request<{ status: string; form_url: string; form_id: string; mcq_count: number; skipped_non_mcq: number }>(
    "POST",
    "/assessments/export/tally",
    { assessment },
  );
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
  metadata?: { summary?: string | null; chunk_count?: number };
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

// ---------------------------------------------------------------------------
// Teaching style (backend app/memory): past files -> traits the teacher decides on.
// ---------------------------------------------------------------------------

export type HistoryKind = "exam_paper" | "worksheet" | "slides" | "lesson_plan" | "notes";

export interface HistoryDocument {
  id: string;
  title: string;
  file_type: string;
  kind: HistoryKind;
  kind_label: string;
  subject: string;
  grade?: string | null;
  authored_by_me: boolean;
  status: "ready" | "needs_review";
  status_reason?: string | null;
  question_count?: number | null;
  total_marks?: number | null;
  duration_minutes?: number | null;
  slide_count?: number | null;
  created_at?: string;
}

export interface StyleTrait {
  id: string;
  subject: string;
  kind: string;
  key: string;
  summary: string;
  status: "suggested" | "active" | "dismissed" | "stale";
  n_evidence: number;
  n_documents: number;
  evidence: { document_id: string; title: string }[];
  /** What newer files say, when it differs from an accepted trait. Offered, never applied. */
  update?: string | null;
}

export async function getTeachingMemory(): Promise<{ documents: HistoryDocument[]; traits: StyleTrait[] }> {
  return request("GET", "/memory");
}

export async function uploadHistoryDocument(params: {
  file: File;
  subject?: string;
  grade?: string;
  kind?: HistoryKind | "auto";
  authoredByMe: boolean;
  confirmNoStudentData: boolean;
}): Promise<HistoryDocument> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("title", params.file.name.replace(/\.(pdf|docx|pptx)$/i, ""));
  form.append("kind", params.kind ?? "auto");
  form.append("authored_by_me", String(params.authoredByMe));
  form.append("confirm_no_student_data", String(params.confirmNoStudentData));
  if (params.subject) form.append("subject", params.subject);
  if (params.grade) form.append("grade", params.grade);
  return requestForm<HistoryDocument>("/memory/documents", form);
}

export async function deleteHistoryDocument(id: string): Promise<void> {
  await request("DELETE", `/memory/documents/${encodeURIComponent(id)}`);
}

export async function decideStyleTrait(id: string, action: "use" | "dismiss"): Promise<StyleTrait> {
  return request("POST", `/memory/traits/${encodeURIComponent(id)}`, { action });
}

export async function forgetTeachingMemory(): Promise<void> {
  await request("DELETE", "/memory");
}

export interface CoursePlan {
  title: string;
  grade: string;
  subject: string;
  duration_weeks: number;
  weekly_structure: { week: number; topic: string; lessons: string[]; objectives?: string[] }[];
  grounded_on?: number;
  sources?: Source[];
  error?: string;
}

/** A persisted project row as `GET /api/projects` returns it. Only the fields
 * the UI actually reads are typed; `specification_json` is whatever was stored
 * at creation time, so every part of it is optional. */

// ── Saved work (backend app/api/library.py) ─────────────────────────────
export type LibraryKind =
  | "course_plan" | "slides" | "worksheet" | "lesson_notes" | "interactive"
  | "assessment" | "narration" | "image" | "video";

export interface LibraryEntry {
  id: string;
  title: string;
  type: LibraryKind;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

/** A saved item: `content` is the result exactly as the generator returned it. */
export interface LibraryItem extends LibraryEntry {
  params: Record<string, unknown>;
  content: unknown;
}

export function listLibrary(): Promise<LibraryEntry[]> {
  return request<LibraryEntry[]>("GET", "/library");
}

export function getLibraryItem(id: string): Promise<LibraryItem> {
  return request<LibraryItem>("GET", `/library/${encodeURIComponent(id)}`);
}

export function renameLibraryItem(id: string, title: string): Promise<{ status: string }> {
  return request("PATCH", `/library/${encodeURIComponent(id)}`, { title });
}

export function deleteLibraryItem(id: string): Promise<{ status: string }> {
  return request("DELETE", `/library/${encodeURIComponent(id)}`);
}

/** Where a saved item reopens: the page that made it, loading the saved result. */
export function libraryHref(item: Pick<LibraryEntry, "id" | "type">): string {
  const id = encodeURIComponent(item.id);
  if (item.type === "assessment") return `/teacher/assess?item=${id}`;
  if (item.type === "course_plan") return `/teacher/plan?item=${id}`;
  if (item.type === "worksheet") return `/teacher/assess?mode=worksheet&item=${id}`;
  return `/teacher/create?type=${item.type}&item=${id}`;
}

export async function generateCoursePlan(params: {
  title: string;
  grade: string;
  subject: string;
  topics: string[];
  durationWeeks?: number;
}): Promise<{ id: string; course_plan: CoursePlan; library_id?: string }> {
  return request("POST", "/projects", {
    title: params.title,
    type: "course_plan",
    grade: params.grade,
    subject: params.subject,
    topics: params.topics,
    duration_weeks: params.durationWeeks ?? 3,
  });
}

export type DeckSource = SourceChunk;

/** A slidekit deck: laid-out slides, ready to render as HTML (lib/slidekit/render.ts). */
export interface DeckReady {
  status: "ready";
  placements: Placement[];
  plan: string[];
  context: { topic: string; subject: string; grade: string; gradeLabel: string; goal: string; language: string; warnings: string[] };
  grounding: { retrieved: number; cited: number; sources: DeckSource[]; inventedCitations: string[] };
  quality: { slides: number; repaired: string[]; unrecoverable: number; copyFit: string[]; trimmed: unknown[]; dropped: unknown[] };
  provider?: string;
  model?: string;
  /** Set when the deck was saved to the library. */
  libraryId?: string | null;
}

/** slidekit asks instead of guessing when the request is too thin to plan from. */
export interface DeckNeedsInput {
  status: "needs_input";
  questions: { field: string; ask: string; options?: string[]; blocking: boolean }[];
}

export type DeckResult = DeckReady | DeckNeedsInput;

export interface OutlineSlide { type: string; title: string; point: string }

/** The PLAN step: a proposed outline for the teacher to edit and approve. */
export interface DeckOutline {
  status: "outline";
  outline: OutlineSlide[];
  /** "groq" | "gemini" when a model planned it; "draft" when slidekit's own plan was used. */
  plannedBy: string;
  maxSlides: number;
  types: { type: string; label: string }[];
  context: { topic: string; gradeLabel: string; grounded: boolean };
}

export interface DeckParams {
  topic: string;
  grade?: string;
  subject?: string;
  slideCount?: number;
  language?: string;
  materialId?: string;
}

const deckBody = (p: DeckParams) => ({
  topic: p.topic.slice(0, 200),
  grade: p.grade || undefined,
  subject: p.subject || undefined,
  slideCount: p.slideCount ? Math.min(8, Math.max(5, p.slideCount)) : undefined,
  language: p.language || undefined,
  materialId: p.materialId || undefined,
});

// Same-origin Next routes (app/api/deck*), not the Python API: they run the
// deterministic slidekit pipeline and call the backend with these headers.
async function deckRequest<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: buildHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error || fallback);
  return data as T;
}

export function generateOutline(params: DeckParams): Promise<DeckOutline | DeckNeedsInput> {
  return deckRequest("/api/deck/outline", deckBody(params), "Could not plan that deck.");
}

/** The PRODUCE step. With `outline`, only the teacher-approved structure is written. */
export function generateDeck(params: DeckParams & { outline?: OutlineSlide[] }): Promise<DeckResult> {
  return deckRequest("/api/deck", { ...deckBody(params), outline: params.outline }, "Could not generate that deck.");
}

export interface WorksheetResult {
  title: string;
  instructions: string;
  question_count: number;
  questions: { question_text: string; answer: string }[];
  grounded_on?: number;
  sources?: Source[];
  /** Set when the result was saved to the library. */
  library_id?: string;
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
  sources?: Source[];
  /** Set when the result was saved to the library. */
  library_id?: string;
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
  sources?: Source[];
  /** Set when the result was saved to the library. */
  library_id?: string;
  error?: string;
}

export async function generateInteractiveCoursework(topic: string, durationMinutes = 15, grade?: string, subject?: string): Promise<InteractiveResult> {
  return request("POST", "/content/interactive", { topic, duration_minutes: durationMinutes, grade, subject });
}

export async function generateNarration(script: string, provider: "elevenlabs" | "cartesia" = "cartesia") {
  return request<{ provider: string; status: string; media_url: string; library_id?: string }>("POST", "/content/narration", { script, provider });
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "recording.webm");
  const { text } = await requestForm<{ text: string }>("/content/transcribe", form);
  return text;
}

export interface EnhancedPrompt {
  enhanced_prompt: string;
  illustration_suggestions: string[];
  animation_suggestions: string[];
  reasoning?: string;
  error?: string;
}

export async function enhancePrompt(prompt: string, artifactType: string): Promise<EnhancedPrompt> {
  return request<EnhancedPrompt>("POST", "/content/enhance-prompt", { prompt, artifact_type: artifactType });
}

export async function generateImage(prompt: string, aspectRatio: string = "1:1") {
  return request<{ provider: string; status: string; media_url: string; library_id?: string }>("POST", "/content/image", { prompt, aspect_ratio: aspectRatio });
}

export async function generateVideo(prompt: string, aspectRatio: string = "16:9", durationSecs: 4 | 6 | 8 = 8) {
  return request<{ provider: string; status: string; media_url: string; library_id?: string }>("POST", "/content/video", {
    prompt,
    aspect_ratio: aspectRatio,
    duration_secs: durationSecs,
  });
}