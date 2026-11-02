// Shapes shared by the beta chat's interface and its service layer (api.ts, live.ts).
import type { ExampleResult, InteractiveResult, LessonNotesResult } from "@/services/api";

export type Intent =
  | "explain" | "summarise" | "compare" | "slides" | "paper" | "worksheet"
  | "plan" | "notes" | "activity" | "narration" | "image" | "video" | "ideas" | "analyse" | "general";

export type ActionId = "summarise" | "further" | "examples" | "bullets" | "table" | "simplify" | "elaborate";

export interface Step { label: string; detail: string; ms: number }

export interface Source { tag: string; file: string; where: string; quote: string }

/** Which intelligence ran a task (backend app/ai/task_router.py). Internal: shown only with routing switched on. */
export interface RouteInfo {
  task: string;
  intelligence: "rules" | "slm" | "llm" | "media";
  pipeline: string;
  input: string;
  output: string;
  why: string;
  model?: string | null;
  provider?: string;
  fallback?: string;
  pins?: Record<string, string>;
  ran_on?: { model: string; provider: string };
  also_used?: { task: string; model: string; provider: string }[];
}

export type ArtifactKind = "deck" | "paper";

export interface TableData { columns: string[]; rows: string[][]; caption?: string }

export type Block =
  | { t: "text"; text: string }
  | { t: "memory"; text: string; why: string }
  | { t: "choices"; questions: { q: string; options: string[] }[]; submit: string; resume: string }
  | { t: "ask"; question: string; options: string[]; field: string; placeholder: string }
  | { t: "outline"; ref: string; slides: OutlineRow[] }
  | { t: "artifact"; kind: ArtifactKind; ref: string; libraryId?: string; title: string; meta: string }
  | { t: "example"; data: ExampleResult }
  | { t: "notice"; tone: "warn" | "error"; text: string; retry?: string }
  | { t: "bullets"; title?: string; items: string[] }
  | { t: "table"; data: TableData }
  | { t: "sources"; items: Source[] }
  | { t: "followups"; items: string[] }
  | { t: "notes"; data: LessonNotesResult }
  | { t: "activity"; data: InteractiveResult; ref: string }
  | { t: "media"; kind: MediaKind; url: string; title: string; libraryId?: string }
  | { t: "mediaSetup"; kind: "image" | "video"; ref: string; prompt: string; secs: VideoSecs };
export type MediaKind = "audio" | "image" | "video";
export type VideoSecs = 4 | 6 | 8;

export interface OutlineRow { type: string; move: string; title: string; point: string }

export interface Run {
  steps: Step[];
  blocks: Block[];
}

export interface IntentResult {
  intent: Intent;
  label: string;          // shown on the response ("Comparison")
  confidence: number;     // 0..1, from the rules that matched
  entities: {
    topic?: string | null; items?: string[]; doc?: boolean; grade?: string | null; subject?: string | null; marks?: number | null; difficulty?: string;
    minutes?: number | null; script?: string | null; secs?: number | null;
  };
}

export interface UserMsg { id: string; role: "user"; text: string; starter?: string; voice?: boolean }
export interface BotMsg {
  id: string; role: "assistant";
  run: Run; intent: IntentResult;
  step: number; shown: number; live: boolean; stopped?: boolean;
  startedAt: number; tookMs?: number;
  derived?: string;       // "Simplified from the answer above"
  pending?: Pending;      // a question waiting on a missing detail
  waiting?: boolean;      // the request is still with the backend
  request?: string;       // what was asked, for quick actions on this answer
  routes?: RouteInfo[];   // every task this answer ran, in order
}
export type Msg = UserMsg | BotMsg;

/** A request put on hold while Vivran asks for the missing detail. */
export interface Pending { text: string; intent: Intent; field: string; starter?: string; ref?: string }

export interface Conversation {
  id: string; title: string; titleEdited?: boolean;
  folderId: string | null; pinned: boolean;
  createdAt: number; updatedAt: number;
  messages: Msg[];
}

export interface Folder { id: string; name: string }

export interface Saved {
  id: string; messageId: string; conversationId: string;
  savedAt: number; collection: string; note: string;
  title: string; excerpt: string; intent: Intent;
}

export interface PromptCard { id: string; icon: string; title: string; description: string; output: string; prompt: string; starter: string }
export interface Starter { id: string; icon: string; label: string; placeholder: string; template: string; intent: Intent }
