"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Mail, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import { askAssistant, type AssistantEntry, type AssistantReply } from "@/services/api";
import { HELP_ENTRIES, type HelpEntry } from "@/lib/help-content";
import { buildIndex, lookup, searchHelp } from "@/lib/help-search";
import { helpMailto, helpWhatsApp } from "@/lib/constants";

/** Opens the drawer from anywhere (the sidebar button, Ctrl/Cmd+K). */
export const ASK_EVENT = "vivran:ask";
export const PREFILL_KEY = "vivran.reusePrompt";

type Message =
  | { role: "user"; text: string }
  | { role: "guide"; reply: AssistantReply; local?: boolean; question: string };

/** What to offer on each page before anything is typed. */
function starters(path: string): string[] {
  if (path.startsWith("/teacher/assess")) return ["How do I choose question types?", "How do I change one question?", "How do I print a paper?"];
  if (path.startsWith("/teacher/examples")) return ["How does Explain simply work?", "Where do I see what I made?"];
  if (path.startsWith("/teacher/create")) return ["How do slides work?", "Can it make a diagram?", "How long does a video take?"];
  if (path.startsWith("/teacher/materials")) return ["What can I upload?", "Why does a question have no source?"];
  if (path.startsWith("/teacher/memory")) return ["What is Teaching memory?", "Are my past papers stored?"];
  return ["Make a test on a topic I teach", "Where are my saved papers?", "How do I get started?"];
}

function toEntry(e: HelpEntry): AssistantEntry {
  return { id: e.id, q: e.q, a: e.a, steps: e.steps, points: e.points };
}

/** A reply built from the help alone, for when the server can't answer (offline, busy, today's allowance spent). */
function localReply(question: string, entries: HelpEntry[]): AssistantReply {
  const top = entries[0];
  if (!top) {
    return { answer: "I couldn't find that in the help. Ask us directly and we'll reply ourselves.", steps: [], actions: [], followups: [], needs_human: true };
  }
  return {
    answer: top.a,
    steps: top.steps ?? [],
    actions: (top.links ?? []).map((l) => ({ route_id: "", label: l.label, href: l.href, prompt: null })),
    followups: entries.slice(1, 3).map((e) => e.q),
    needs_human: false,
  };
}

export function AskVivran() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const index = useMemo(() => buildIndex(HELP_ENTRIES), []);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onAsk = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ASK_EVENT, onAsk);
    };
  }, [toggle]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);

    // The browser's own search chooses the few help entries the model will read.
    const ranked = searchHelp(question, index).filter((m) => m.score >= 0.5).slice(0, 5).map((m) => m.entry);
    const found = lookup(question, index);
    const fallbackEntries = ranked.length ? ranked : found.kind === "suggest" ? found.suggestions : found.kind === "answer" ? [found.best] : [];
    const history = messages.slice(-6).map((m) => (m.role === "user" ? { role: "user" as const, text: m.text } : { role: "guide" as const, text: m.reply.answer }));

    try {
      const reply = await askAssistant({ message: question, page: pathname, history, entries: fallbackEntries.slice(0, 5).map(toEntry) });
      setMessages((m) => [...m, { role: "guide", reply, question }]);
    } catch {
      // Offline, busy, or today's questions are spent: the help still answers.
      setMessages((m) => [...m, { role: "guide", reply: localReply(question, fallbackEntries), local: true, question }]);
    } finally {
      setBusy(false);
    }
  };

  const go = (a: AssistantReply["actions"][number]) => {
    // A request typed for them waits on the next page; nothing is submitted for them.
    try {
      if (a.prompt) localStorage.setItem(PREFILL_KEY, a.prompt);
    } catch {
      /* storage unavailable: they just arrive without the text */
    }
    setOpen(false);
    router.push(a.href);
  };

  if (!open) return null;

  const empty = messages.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Ask Vivran">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <aside className="relative w-full sm:w-[26rem] h-full bg-surface border-l border-border shadow-panel flex flex-col">
        <header className="px-4 py-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-foreground">
            <Sparkles className="w-4 h-4 text-accent" /> Ask Vivran
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg text-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" aria-live="polite">
          {empty && (
            <div className="space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                I can tell you how things work and take you to the right page. I answer from Vivran&rsquo;s help, so I can&rsquo;t see your account or your files.
              </p>
              <div className="flex flex-col gap-1.5">
                {starters(pathname).map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="text-left text-xs px-3 py-2 rounded-xl border border-border bg-card text-foreground hover:border-accent-line">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-accent-soft border border-accent-line text-sm text-foreground">{m.text}</div>
              </div>
            ) : (
              <GuideMessage key={i} message={m} onAction={go} onAsk={send} />
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted"><BookLoader className="w-3.5 h-3.5" /> Looking that up…</div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="p-3 border-t border-border flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask how something works…"
            maxLength={400}
            aria-label="Your question"
            className="flex-1 px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-accent"
          />
          <button type="submit" disabled={busy || input.trim().length < 2} aria-label="Send" className="p-2.5 rounded-xl btn-primary disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </div>
  );
}

function GuideMessage({
  message,
  onAction,
  onAsk,
}: {
  message: Extract<Message, { role: "guide" }>;
  onAction: (a: AssistantReply["actions"][number]) => void;
  onAsk: (q: string) => void;
}) {
  const { reply } = message;
  const wa = helpWhatsApp(message.question);
  return (
    <div className="space-y-2.5 max-w-[95%]">
      <div className="px-3.5 py-3 rounded-2xl rounded-bl-md bg-card border border-border space-y-2.5">
        <p className="text-sm text-foreground leading-relaxed">{reply.answer}</p>
        {reply.steps.length > 0 && (
          <ol className="space-y-1.5">
            {reply.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted leading-relaxed">
                <span className="w-5 h-5 mt-px shrink-0 rounded-full border border-accent-line text-accent text-[10.5px] font-bold font-display flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ol>
        )}
        {message.local && <div className="text-[10.5px] text-faint">From the help (the guide is unavailable right now).</div>}
      </div>

      {reply.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reply.actions.map((a) => (
            <button key={a.href + a.label} type="button" onClick={() => onAction(a)} className="px-3 py-1.5 rounded-lg btn-primary text-xs font-semibold inline-flex items-center gap-1.5">
              {a.label} <ArrowRight className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {reply.needs_human && (
        <div className="flex flex-wrap gap-1.5">
          <a href={helpMailto(message.question)} className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-foreground inline-flex items-center gap-1.5 hover:border-accent-line">
            <Mail className="w-3.5 h-3.5" /> Ask us directly
          </a>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-foreground inline-flex items-center gap-1.5 hover:border-accent-line">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
        </div>
      )}

      {reply.followups.length > 0 && (
        <div className="flex flex-col gap-1">
          {reply.followups.map((f) => (
            <button key={f} type="button" onClick={() => onAsk(f)} className="text-left text-[11.5px] text-accent hover:underline">{f}</button>
          ))}
        </div>
      )}
    </div>
  );
}
