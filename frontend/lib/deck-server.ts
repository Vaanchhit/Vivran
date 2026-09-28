// Server-only helpers shared by app/api/deck (produce) and app/api/deck/outline (plan).
import type { LessonContext } from "@/lib/slidekit";
import type { SourceChunk } from "@/lib/slidekit-bridge";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/** Forward the caller's own credentials; these routes never hold any of their own. */
export function authHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const auth = req.headers.get("authorization");
  const ws = req.headers.get("workspace-id");
  if (auth) h["Authorization"] = auth;
  if (ws) h["Workspace-Id"] = ws;
  return h;
}

/** Best effort: an ungrounded deck is a worse deck, not a failed one. */
export async function fetchGrounding(req: Request, ctx: LessonContext, materialId?: string): Promise<SourceChunk[]> {
  try {
    const q = `Teaching material about ${ctx.topic} for a ${ctx.gradeLabel} ${ctx.subject} course`;
    const r = await fetch(`${API}/content/grounding`, {
      method: "POST",
      headers: authHeaders(req),
      body: JSON.stringify({ query: q, material_id: materialId, limit: 6 }),
    });
    if (r.ok) return (await r.json()).chunks ?? [];
  } catch {
    // fall through ungrounded
  }
  return [];
}

/** One model call through the Python API. Returns the raw text, or the teacher-safe error. */
export async function callModel(
  req: Request,
  path: "/content/blocks" | "/content/outline",
  prompt: { system: string; user: string },
): Promise<{ ok: true; raw: string; meta: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  try {
    const r = await fetch(`${API}${path}`, {
      method: "POST",
      headers: authHeaders(req),
      body: JSON.stringify({ system_prompt: prompt.system, user_prompt: prompt.user }),
    });
    const d = await r.json().catch(() => ({}));
    // The backend already translated failures into something a teacher can read.
    if (!r.ok) return { ok: false, status: r.status, error: d?.detail ?? "Could not generate that deck." };
    return { ok: true, raw: d.content ?? "", meta: { provider: d.provider, model: d.model_name, usage: d.usage } };
  } catch {
    return { ok: false, status: 502, error: "Could not reach the generator. Please try again." };
  }
}
