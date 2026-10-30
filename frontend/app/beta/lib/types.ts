// Shapes shared by the beta chat's interface and its service layer (api.ts).

export type Intent =
  | "explain" | "summarise" | "compare" | "slides" | "paper" | "worksheet"
  | "plan" | "ideas" | "analyse" | "general";

export type ActionId = "summarise" | "further" | "examples" | "bullets" | "table" | "simplify" | "elaborate";

export interface Step { label: string; detail: string; ms: number }

export interface Source { tag: string; file: string; where: string; quote: string }

export interface TableData { columns: string[]; rows: string[][]; caption?: string }

export type Block =
  | { t: "text"; text: string }
  | { t: "memory"; text: string; why: string }
  | { t: "choices"; questions: { q: string; options: string[] }[]; submit: string; resume: string }
  | { t: "ask"; question: string; options: string[]; field: string; placeholder: string }
  | { t: "outline"; deck: string; slides: { move: string; title: string }[] }
  | { t: "artifact"; kind: "deck" | "paper"; deck?: string; title: string; meta: string }
  | { t: "explain"; topic: string }
  | { t: "bullets"; title?: string; items: string[] }
  | { t: "table"; data: TableData }
  | { t: "sources"; items: Source[] }
  | { t: "followups"; items: string[] };

/** What a response can be reshaped into by the quick actions. */
export interface Digest {
  summary: string[];
  simple: string;
  more: string[];
  examples: string[];
  table: TableData;
}

export interface Run {
  steps: Step[];
  blocks: Block[];
  digest?: Digest;
}

export interface IntentResult {
  intent: Intent;
  label: string;          // shown on the response ("Comparison")
  confidence: number;     // 0..1, from the rules that matched
  entities: { topic?: string; items?: string[]; doc?: string; deck?: string; grade?: string };
}

export interface UserMsg { id: string; role: "user"; text: string; starter?: string }
export interface BotMsg {
  id: string; role: "assistant";
  run: Run; intent: IntentResult;
  step: number; shown: number; live: boolean; stopped?: boolean;
  startedAt: number; tookMs?: number;
  derived?: string;       // "Simplified from the answer above"
  pending?: Pending;      // a question waiting on a missing detail
}
export type Msg = UserMsg | BotMsg;

/** A request put on hold while Vivran asks for the missing detail. */
export interface Pending { text: string; intent: Intent; field: string; starter?: string }

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
