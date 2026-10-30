// The chat's own records: conversations, folders, saved answers, preferences.
// What the teacher asks is answered by the real backend (live.ts); these stay in
// this browser, one store per signed-in account, until the conversation tables
// in BACKEND.md exist. Everything Vivran MAKES is already saved server-side, in
// the Library.
import { COLLECTIONS, PROMPT_CARDS, STARTERS } from "./config";
import { speakable } from "./live";
import type { Conversation, Folder, IntentResult, Saved } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function getConfig() {
  return { cards: PROMPT_CARDS, starters: STARTERS, collections: COLLECTIONS };
}

export function starterPrompt(starterId: string, input: string, hasSource: boolean): string {
  const s = STARTERS.find((x) => x.id === starterId);
  if (!s) return input;
  const fill = input.trim() || (s.id === "summarise" && hasSource ? "this document" : s.id === "analyse" ? "my class results" : "");
  return s.template.replace("{input}", fill).trim();
}

/** The pending request with its missing detail filled in. */
export function resume(pending: { text: string; intent: string; field: string }, answer: string): string {
  const a = answer.trim();
  switch (pending.intent) {
    case "compare": return `Compare ${a}`;
    case "summarise": return `Summarise ${a}`;
    case "slides": return pending.field === "topic" ? `Slides on ${a}` : `${pending.text} (${a})`;
    case "explain": return `Explain ${a} simply`;
    case "paper": return `A unit test on ${a}`;
    case "worksheet": return `A worksheet on ${a}`;
    case "plan": return `Plan a unit on ${a}`;
    default: return `${pending.text} ${a}`;
  }
}

/** A chat title from its first request: "Compare: Girondins vs Jacobins". */
export function titleFor(r: IntentResult, text: string): string {
  const e = r.entities;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (r.intent === "compare" && e.items?.length === 2) return `Compare: ${cap(e.items[0])} vs ${e.items[1]}`;
  if (e.topic && r.intent !== "general") return `${r.label} · ${cap(e.topic)}`;
  return cap(text.length > 42 ? `${text.slice(0, 40).trim()}…` : text);
}

/* ───────────────────────── storage (until the chat tables exist) ───────────────────────── */

interface Prefs { autoRead: boolean; showRoute: boolean }
interface DB { conversations: Conversation[]; folders: Folder[]; saved: Saved[]; onboarding_completed: boolean; prefs: Prefs }
let KEY = "vivran_beta_live";
let db: DB | null = null;

/** One store per account, so two teachers on one browser never see each other's chats. */
export function scope(userId: string) { KEY = `vivran_beta_live_${userId}`; db = null; }

function load(): DB {
  if (db) return db;
  try { const raw = localStorage.getItem(KEY); if (raw) { db = JSON.parse(raw) as DB; db.prefs = { autoRead: false, showRoute: false, ...(db.prefs as Partial<Prefs>) }; return db; } } catch { /* private mode */ }
  db = { conversations: [], folders: [], saved: [], onboarding_completed: false, prefs: { autoRead: false, showRoute: false } };
  persist(); return db;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ } }

export const conversations = {
  list: () => load().conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt),
  get: (id: string) => load().conversations.find((c) => c.id === id) ?? null,
  create: (title: string): Conversation => { const c: Conversation = { id: uid(), title, folderId: null, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), messages: [] }; load().conversations.push(c); persist(); return c; },
  save: (id: string, patch: Partial<Conversation>) => { const c = load().conversations.find((x) => x.id === id); if (c) { Object.assign(c, patch); if (patch.messages) c.updatedAt = Date.now(); persist(); } },
  remove: (id: string) => { const d = load(); d.conversations = d.conversations.filter((c) => c.id !== id); d.saved = d.saved.filter((s) => s.conversationId !== id); persist(); },
};

export const folders = {
  list: () => load().folders,
  create: (name: string): Folder => { const f = { id: uid(), name }; load().folders.push(f); persist(); return f; },
  rename: (id: string, name: string) => { const f = load().folders.find((x) => x.id === id); if (f) { f.name = name; persist(); } },
  remove: (id: string) => { const d = load(); d.folders = d.folders.filter((f) => f.id !== id); d.conversations.forEach((c) => { if (c.folderId === id) c.folderId = null; }); persist(); },
};

export const saved = {
  list: () => load().saved.slice().sort((a, b) => b.savedAt - a.savedAt),
  isSaved: (messageId: string) => load().saved.some((s) => s.messageId === messageId),
  add: (s: Omit<Saved, "id" | "savedAt">) => { load().saved.push({ ...s, id: uid(), savedAt: Date.now() }); persist(); },
  update: (id: string, patch: Partial<Pick<Saved, "note" | "collection">>) => { const s = load().saved.find((x) => x.id === id); if (s) { Object.assign(s, patch); persist(); } },
  remove: (messageId: string) => { const d = load(); d.saved = d.saved.filter((s) => s.messageId !== messageId); persist(); },
};

export const onboarding = {
  completed: () => load().onboarding_completed,
  complete: () => { load().onboarding_completed = true; persist(); },
};

export const prefs = {
  get: () => load().prefs,
  set: (p: Partial<Prefs>) => { Object.assign(load().prefs, p); persist(); },
};

/** Keyword search over titles and everything said. */
export function search(q: string, f: { folderId?: string | null; since?: "today" | "week" | "older" | "all" }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const now = Date.now(), day = 86400000;
  return conversations.list().filter((c) => {
    if (f.folderId !== undefined && f.folderId !== null && c.folderId !== f.folderId) return false;
    const age = now - c.updatedAt;
    if (f.since === "today" && age > day) return false;
    if (f.since === "week" && age > 7 * day) return false;
    if (f.since === "older" && age <= 7 * day) return false;
    if (!words.length) return true;
    const hay = (c.title + " " + c.messages.map((m) => (m.role === "user" ? m.text : speakable(m.run))).join(" ")).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Clears this browser's chats (the Library and sources are untouched). */
export function resetAll() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } db = null; load(); }
