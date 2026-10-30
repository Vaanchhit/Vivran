"use client";

// /beta: Vivran as a conversation. A frontend-only preview: answers are
// scripted from sample content, conversations and bookmarks live in this
// browser, and voice uses the browser's own speech services. lib/api.ts is
// the seam where each piece becomes a backend call.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowRight, ArrowUp, BookOpen, Download, FileText, LayoutGrid, Menu, Mic, Moon, PanelLeft, Paperclip,
  ArrowUpRight, Presentation, Share2, Square, SquarePen, Sun, X,
} from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";
import { useTheme } from "@/lib/theme-context";
import * as api from "./lib/api";
import { COLLECTIONS, PROMPT_CARDS, STARTERS, TIPS, TOUR } from "./lib/config";
import { DECKS, PAPER, SOURCE_FILE } from "./lib/content";
import type { ActionId, BotMsg, Conversation, Folder, Intent, Msg, Saved, Starter } from "./lib/types";
import { useSpeaker, useSpeechInput } from "./lib/voice";
import { ActionBar, BlockView, Thinking } from "./ui/blocks";
import { Icon, InfoTip, Tip, Walkthrough } from "./ui/kit";
import { DeckPanel, FeaturesView, PaperPanel, SaveDialog, SavedView } from "./ui/panels";
import { Sidebar, type Since } from "./ui/sidebar";
import { LibraryView, MemoryView, SourcesView } from "./ui/workspace";
import { library, type LibraryItem } from "./lib/memory";

type Panel = { kind: "deck"; deck: string } | { kind: "paper" } | null;
type View = "chat" | "features" | "saved" | "library" | "sources" | "memory";

export default function BetaPage() {
  const { theme, toggleTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState({ cards: PROMPT_CARDS, starters: STARTERS, collections: COLLECTIONS });
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [savedList, setSavedList] = useState<Saved[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [title, setTitle] = useState("New chat");
  const [editTitle, setEditTitle] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [starter, setStarter] = useState<Starter | null>(null);
  const [source, setSource] = useState<string | null>(SOURCE_FILE);
  const [cite, setCite] = useState<string | null>(null);
  const [side, setSide] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [tour, setTour] = useState(false);
  const [saveFor, setSaveFor] = useState<BotMsg | null>(null);
  const [query, setQuery] = useState("");
  const [since, setSince] = useState<Since>("all");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [autoRead, setAutoRead] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const { speaking, speak } = useSpeaker();

  const last = msgs[msgs.length - 1];
  const running = !!last && last.role === "assistant" && last.live;

  /* ── data ── */
  const refresh = useCallback(() => {
    setConvs(api.search(query, { folderId: folderFilter, since }));
    setFolders(api.folders.list().slice());
    setSavedList(api.saved.list());
  }, [query, folderFilter, since]);

  useEffect(() => {
    api.getConfig().then(setConfig);
    setAutoRead(api.prefs.get().autoRead);
    setReady(true);
    if (!api.onboarding.completed()) setTimeout(() => setTour(true), 700);
  }, []);
  useEffect(() => { if (ready) refresh(); }, [ready, refresh]);

  // persist the open chat whenever it settles
  useEffect(() => {
    if (!activeId || running) return;
    api.conversations.save(activeId, { messages: msgs });
    refresh();
  }, [msgs, activeId, running, refresh]);

  /* ── sending ── */
  const send = useCallback((raw: string, opts: { command?: api.Command } = {}) => {
    let text = raw.trim();
    if (!text && !starter) return;
    if (running) { if (text) setQueue((q) => [...q, text]); setDraft(""); return; }
    let forced: Intent | undefined;
    let shown = text;
    if (starter && !opts.command) {
      text = api.starterPrompt(starter.id, text, source);
      forced = starter.intent; shown = text;
    }
    // a reply to "which one?" resumes the request that was put on hold
    const prev = msgs[msgs.length - 1];
    if (prev?.role === "assistant" && prev.pending && !opts.command) { text = api.resume(prev.pending, text); forced = prev.pending.intent; }

    const reply = api.respond(text, { source, forced, command: opts.command });
    const bot: BotMsg = {
      id: api.uid(), role: "assistant", run: reply.run, intent: reply.result, step: 0, shown: 0, live: true, startedAt: Date.now(),
      pending: reply.ask ? { text, intent: reply.result.intent, field: reply.ask.field } : undefined,
    };
    const user: Msg = { id: api.uid(), role: "user", text: shown, starter: starter && !opts.command ? starter.label : undefined };
    let id = activeId;
    if (!id) { id = api.conversations.create(api.titleFor(reply.result, shown)).id; setActiveId(id); }
    const c = api.conversations.get(id);
    const settled = msgs.some((m) => m.role === "assistant" && !m.pending);
    if (c && !c.titleEdited && !settled && !reply.ask) { const t = api.titleFor(reply.result, text); api.conversations.save(id, { title: t }); setTitle(t); }
    else if (c) setTitle(c.title);
    setMsgs((m) => [...m, user, bot]);
    setDraft(""); setCite(null); setView("chat"); setStarter(null);
  }, [running, starter, source, msgs, activeId]);

  const runAction = useCallback((m: BotMsg, a: ActionId) => {
    if (running) return;
    const t = api.transform(m, a);
    const user: Msg = { id: api.uid(), role: "user", text: t.derived.split(" · ")[0] };
    const bot: BotMsg = { id: api.uid(), role: "assistant", run: t.run, intent: m.intent, step: 0, shown: 0, live: true, startedAt: Date.now(), derived: t.derived };
    setMsgs((x) => [...x, user, bot]);
  }, [running]);

  // the run: finish each thinking step, then reveal blocks one by one
  useEffect(() => {
    if (!last || last.role !== "assistant" || !last.live) return;
    const r = last.run;
    const thinking = last.step < r.steps.length;
    const wait = thinking ? r.steps[last.step].ms : r.blocks[last.shown]?.t === "text" ? 850 : 420;
    const t = setTimeout(() => {
      let next: BotMsg;
      if (thinking) next = { ...last, step: last.step + 1 };
      else {
        const shown = last.shown + 1;
        const blk = r.blocks[last.shown];
        if (blk?.t === "artifact" && window.innerWidth >= 1100) setPanel(blk.kind === "deck" ? { kind: "deck", deck: blk.deck! } : { kind: "paper" });
        next = shown >= r.blocks.length ? { ...last, shown, live: false, tookMs: Date.now() - last.startedAt } : { ...last, shown };
        if (!next.live && autoRead) speak(next.id, api.speakable(next.run));
      }
      setMsgs((m) => m.map((x) => (x.id === last.id ? next : x)));
    }, wait);
    return () => clearTimeout(t);
  }, [last, autoRead, speak]);

  useEffect(() => { if (!running && queue.length) { const [q, ...rest] = queue; setQueue(rest); send(q); } }, [running, queue, send]);
  useEffect(() => { if (!flash) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, flash]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => document.getElementById(`msg-${flash}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    const u = setTimeout(() => setFlash(null), 2400);
    return () => { clearTimeout(t); clearTimeout(u); };
  }, [flash]);

  /* ── voice ── */
  const mic = useSpeechInput((text, final) => { setDraft(text); if (final) setTimeout(() => send(text), 250); });

  /* ── navigation ── */
  const stopRun = () => setMsgs((m) => m.map((x) => (x === last && x.role === "assistant" ? { ...x, live: false, stopped: true, tookMs: Date.now() - x.startedAt } : x)));
  const fresh = () => {
    if (running) stopRun();
    setActiveId(null); setMsgs([]); setPanel(null); setTitle("New chat"); setQueue([]); setDrawer(false); setView("chat"); setStarter(null);
    setTimeout(() => box.current?.focus(), 50);
  };
  const openConv = (id: string, focusMsg?: string) => {
    const c = api.conversations.get(id); if (!c) return;
    setActiveId(id); setMsgs(c.messages.map((m) => (m.role === "assistant" ? { ...m, live: false } : m))); setTitle(c.title);
    setPanel(null); setDrawer(false); setQueue([]); setView("chat"); setFlash(focusMsg ?? null);
  };
  const toggleSave = (m: BotMsg) => {
    if (api.saved.isSaved(m.id)) { api.saved.remove(m.id); refresh(); }
    else setSaveFor(m);
  };
  const empty = msgs.length === 0;
  // The library and memory read every chat, not just the ones the sidebar search shows.
  const items = useMemo(() => (ready ? library(api.conversations.list(), savedList) : []), [ready, convs, savedList]); // eslint-disable-line react-hooks/exhaustive-deps
  const habits = useMemo(() => (ready ? api.conversations.list().flatMap((c) => c.messages.filter((m) => m.role === "user").map((m) => m.text)).filter((t) => t.length > 12 && !/^(approved|balanced|yes)/i.test(t)).slice(0, 8) : []), [ready, convs]); // eslint-disable-line react-hooks/exhaustive-deps
  const openItem = (i: LibraryItem) => {
    if (i.conversationId) { openConv(i.conversationId); if (i.deck) setPanel({ kind: "deck", deck: i.deck }); return; }
    fresh();
    if (i.deck) setTimeout(() => setPanel({ kind: "deck", deck: i.deck! }), 0);
    else if (i.prompt) setTimeout(() => send(i.prompt!), 60);
  };
  const useSource = (name: string) => { setSource(name); fresh(); };

  const sidebar = (
    <Sidebar
      convs={convs} folders={folders} activeId={activeId} view={view} savedCount={savedList.length}
      query={query} since={since} folderFilter={folderFilter} autoRead={autoRead}
      onQuery={setQuery} onSince={setSince} onFolderFilter={setFolderFilter}
      onNew={fresh} onOpen={(id) => openConv(id)} onView={(v) => { setView(v); setDrawer(false); setPanel(null); }}
      onCollapse={() => { setSide(false); setDrawer(false); }}
      onRename={(id, t) => { api.conversations.save(id, { title: t, titleEdited: true }); if (id === activeId) setTitle(t); refresh(); }}
      onPin={(id) => { const c = api.conversations.get(id); api.conversations.save(id, { pinned: !c?.pinned }); refresh(); }}
      onMove={(id, f) => { api.conversations.save(id, { folderId: f }); refresh(); }}
      onDelete={(id) => { api.conversations.remove(id); if (id === activeId) fresh(); refresh(); }}
      onFolderCreate={(n) => { api.folders.create(n); refresh(); }}
      onFolderRename={(id, n) => { api.folders.rename(id, n); refresh(); }}
      onFolderDelete={(id) => { api.folders.remove(id); if (folderFilter === id) setFolderFilter(null); refresh(); }}
      onTour={() => { fresh(); setTimeout(() => setTour(true), 300); }}
      onReset={() => { api.resetAll(); fresh(); refresh(); setTimeout(() => setTour(true), 300); }}
      onAutoRead={(v) => { setAutoRead(v); api.prefs.set({ autoRead: v }); }}
    />
  );

  const composer = (
    <div className={`w-full ${empty ? "" : "max-w-3xl mx-auto"}`}>
      {queue.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {queue.map((q, i) => (
            <span key={i} className="inline-flex items-center gap-2 max-w-full text-[12.5px] px-3 py-1.5 rounded-full border border-border bg-surface text-muted">
              <span className="text-faint">Queued</span><span className="truncate text-foreground">{q}</span>
              <button type="button" aria-label="Remove" onClick={() => setQueue(queue.filter((_, k) => k !== i))}><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <div data-tour="composer" className="vv-composer rounded-[26px] border border-border bg-surface shadow-soft focus-within:border-accent-line focus-within:shadow-panel transition-all">
        {starter && (
          <div className="px-4 pt-3 -mb-1">
            <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-ink text-ink-fg text-[12.5px] font-medium">
              <Icon name={starter.icon} className="w-3.5 h-3.5" />{starter.label}
              <button type="button" aria-label="Clear starter" onClick={() => setStarter(null)} className="ml-0.5 p-0.5 rounded-full hover:bg-white/15"><X className="w-3 h-3" /></button>
            </span>
          </div>
        )}
        <textarea ref={box} value={draft} rows={empty ? 3 : 2} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          placeholder={mic.listening ? "Listening…" : running ? "Send a follow-up. It's held and sent when this finishes…" : starter ? starter.placeholder : "Ask Vivran to plan, teach, assess or explain…"}
          className="w-full resize-none bg-transparent px-5 pt-4 text-[15px] text-foreground placeholder:text-faint outline-none" />
        <div className="flex items-center gap-1.5 px-3 pb-3">
          <input ref={file} type="file" accept=".pdf,.docx,.pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSource(f.name); e.target.value = ""; }} />
          <Tip text={TIPS.attach}><button type="button" aria-label="Attach a file" onClick={() => file.current?.click()} className="w-9 h-9 grid place-items-center rounded-full text-muted hover:text-foreground hover:bg-card"><Paperclip className="w-4 h-4" /></button></Tip>
          <span data-tour="source" className="min-w-0 inline-flex">
            {source ? (
              <Tip text={TIPS.source}>
                <span className="inline-flex items-center gap-1.5 min-w-0 px-3 py-1.5 rounded-full text-[12.5px] bg-accent-soft text-foreground border border-accent-line">
                  <BookOpen className="w-3.5 h-3.5 text-accent shrink-0" /><span className={`truncate max-w-[110px] ${panel ? "sm:max-w-[150px]" : "sm:max-w-[220px]"}`}>{source}</span>
                  <button type="button" aria-label="Don't use this source" onClick={() => setSource(null)} className="text-muted hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                </span>
              </Tip>
            ) : (
              <button type="button" onClick={() => setSource(SOURCE_FILE)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] text-muted border border-dashed border-border hover:text-foreground"><BookOpen className="w-3.5 h-3.5" /> Use a source</button>
            )}
          </span>
          <span className="flex-1" />
          <span className={`hidden ${panel ? "2xl:inline-flex" : "sm:inline-flex"} items-center gap-1 text-[12px] text-faint`}>Grounded <InfoTip text={TIPS.grounded} /></span>
          <span data-tour="mic" className="inline-flex">
            <Tip text={mic.error ?? (mic.supported ? TIPS.mic : "Voice input needs Chrome or Edge")}>
              <button type="button" aria-label={mic.listening ? "Stop listening" : "Speak"} onClick={() => (mic.listening ? mic.stop() : mic.start())}
                className={`relative w-9 h-9 grid place-items-center rounded-full transition-colors ${mic.listening ? "bg-accent text-white" : "text-muted hover:text-foreground hover:bg-card"}`}>
                {mic.listening && <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping" />}
                <Mic className="relative w-4 h-4" />
              </button>
            </Tip>
          </span>
          {running ? (
            <button type="button" aria-label="Stop" onClick={stopRun} className="w-9 h-9 rounded-full grid place-items-center bg-ink text-ink-fg"><Square className="w-3.5 h-3.5 fill-current" /></button>
          ) : (
            <button type="button" aria-label="Send" disabled={!draft.trim() && !starter} onClick={() => send(draft)} className="w-9 h-9 rounded-full grid place-items-center bg-ink text-ink-fg disabled:opacity-30 transition-opacity"><ArrowUp className="w-[18px] h-[18px]" /></button>
          )}
        </div>
      </div>
      {mic.error && <p className="mt-1.5 text-center text-[12px] text-danger">{mic.error}</p>}
    </div>
  );

  const welcome = (
    <div className="flex-1 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl">
          <div className="flex items-center justify-center gap-3 mb-2">
            <BrandMark className="w-9 h-9" />
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">What are we teaching today?</h2>
          </div>
          <p className="text-center text-[14px] text-muted mb-7">Good to see you, Ms. Rao. Your Unit 4 chapter is ready to use.</p>
          {composer}
          <div data-tour="cards" className={`mt-6 grid grid-cols-1 gap-2.5 ${panel ? "" : "sm:grid-cols-2"}`}>
            {config.cards.map((c, i) => {
              const st = config.starters.find((x) => x.id === c.starter);
              const on = !!st && starter?.id === st.id;
              return (
                <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
                  className={`min-w-0 rounded-2xl border bg-surface p-3.5 transition-colors ${on ? "border-accent-line" : "border-border hover:border-border-hi"}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-7 h-7 shrink-0 rounded-lg grid place-items-center bg-accent-soft text-accent"><Icon name={c.icon} className="w-3.5 h-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-[14px] text-foreground">{c.title}</span>
                        <span className="text-[11px] text-faint whitespace-nowrap">{c.output}</span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-muted leading-snug">{c.description}</p>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <button type="button" onClick={() => send(c.prompt)} title="Run this example"
                          className="min-w-0 flex-1 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-left text-[12px] italic text-foreground/75 hover:text-foreground hover:bg-accent-soft transition-colors">
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-accent" /><span className="truncate">&ldquo;{c.prompt}&rdquo;</span>
                        </button>
                        {st && (
                          <button type="button" onClick={() => { setStarter(on ? null : st); box.current?.focus(); }}
                              className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${on ? "bg-ink text-ink-fg border-transparent" : "border-border text-foreground/80 hover:text-foreground hover:border-border-hi"}`}>Your own</button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-6 text-center">
            <button type="button" onClick={() => setView("features")} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground hover:text-accent"><LayoutGrid className="w-4 h-4" /> See everything Vivran can do <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
        </motion.div>
      </div>
    </div>
  );

  const thread = (
    <>
      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          {msgs.map((m, mi) => m.role === "user" ? (
            <motion.div key={m.id} id={`msg-${m.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end gap-1">
              {m.starter && <span className="text-[11px] text-faint">{m.starter}</span>}
              <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-card border border-border px-4 py-2.5 text-[15px] text-foreground">{m.text}</div>
            </motion.div>
          ) : (
            <div key={m.id} id={`msg-${m.id}`} className={`rounded-3xl transition-shadow duration-700 ${flash === m.id ? "ring-2 ring-accent ring-offset-8 ring-offset-background" : ""}`}>
              <Thinking m={m} />
              <div className="space-y-4">
                {m.run.blocks.slice(0, m.shown).map((b, bi) => (
                  <motion.div key={bi} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <BlockView b={b} live={m.live && bi === m.shown - 1} locked={mi < msgs.length - 1} focus={mi === msgs.length - 1 ? cite : null}
                      h={{
                        onCite: setCite, onSend: (t) => send(t),
                        onChoices: (t) => send(t, { command: { kind: "writePaper" } }),
                        onAnswer: (a) => send(a),
                        onApprove: (deck) => send("Approved. Write the deck.", { command: { kind: "writeDeck", deck } }),
                        onOpen: (a) => setPanel(a.kind === "deck" ? { kind: "deck", deck: a.deck! } : { kind: "paper" }),
                      }} />
                  </motion.div>
                ))}
              </div>
              {!m.live && !m.stopped && (
                <ActionBar m={m} compact={mi < msgs.length - 1} saved={savedList.some((s) => s.messageId === m.id)} speaking={speaking === m.id}
                  onAction={(a) => runAction(m, a)} onSpeak={() => speak(m.id, api.speakable(m.run))}
                  onCopy={() => navigator.clipboard?.writeText(api.speakable(m.run))} onSave={() => toggleSave(m)} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-3 sm:px-6 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        {composer}
        <p className="mt-2 text-center text-[11px] text-faint">Beta preview with sample data. Vivran checks its work, and so should you.</p>
      </div>
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-[100dvh] flex bg-background text-foreground overflow-hidden">
        <aside className={`hidden md:block shrink-0 border-r border-border transition-[width] duration-300 overflow-hidden ${side ? "w-72" : "w-0 border-r-0"}`}>
          <div className="w-72 h-full">{ready && sidebar}</div>
        </aside>
        <AnimatePresence>
          {drawer && (
            <>
              <motion.div className="md:hidden fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
              <motion.aside className="md:hidden fixed inset-y-0 left-0 z-50 w-[85vw] max-w-80 border-r border-border shadow-panel" initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>{sidebar}</motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 shrink-0 flex items-center gap-2 px-3 sm:px-5 border-b border-border/70">
            <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="md:hidden p-2 rounded-lg text-muted"><Menu className="w-5 h-5" /></button>
            {!side && <button type="button" aria-label="Open sidebar" onClick={() => setSide(true)} className="hidden md:inline-flex p-2 rounded-lg text-muted hover:text-foreground"><PanelLeft className="w-[18px] h-[18px]" /></button>}
            {!side && <button type="button" aria-label="New chat" onClick={fresh} className="hidden md:inline-flex p-2 rounded-lg text-muted hover:text-foreground"><SquarePen className="w-[18px] h-[18px]" /></button>}
            {view !== "chat" ? (
              <button type="button" onClick={() => setView("chat")} className="text-[15px] font-medium text-foreground truncate">← Back to chat</button>
            ) : editTitle && activeId ? (
              <form onSubmit={(e) => { e.preventDefault(); setEditTitle(false); }} className="min-w-0 flex-1 max-w-md">
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => { setEditTitle(false); api.conversations.save(activeId, { title: title.trim() || "Untitled", titleEdited: true }); refresh(); }}
                  className="w-full rounded-lg border border-accent-line bg-surface px-2 py-1 text-[15px] text-foreground outline-none" />
              </form>
            ) : (
              <Tip text={activeId ? "Click to rename" : "Titles are written for you from the first request"} side="bottom">
                <button type="button" onClick={() => activeId && setEditTitle(true)} className="text-[15px] font-medium text-foreground truncate max-w-[50vw] text-left">{title}</button>
              </Tip>
            )}
            <span className={`hidden ${panel ? "xl:inline" : "sm:inline"} shrink-0 whitespace-nowrap text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-border text-faint`}>Beta preview · sample data</span>
            <span className="flex-1" />
            <Tip text={theme === "dark" ? "Light theme" : "Dark theme"} side="bottom"><button type="button" aria-label="Toggle theme" onClick={toggleTheme} className="p-2 rounded-lg text-muted hover:text-foreground">{theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button></Tip>
            <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] text-muted hover:text-foreground border border-border"><Share2 className="w-3.5 h-3.5" /> <span className={`hidden ${panel ? "2xl:inline" : "sm:inline"}`}>Share</span></button>
          </header>

          {view === "features" ? (
            <div className="flex-1 overflow-y-auto"><FeaturesView onTry={(p) => { fresh(); setTimeout(() => send(p), 60); }} onClose={() => setView("chat")} /></div>
          ) : view === "saved" ? (
            <div className="flex-1 overflow-y-auto">
              <SavedView items={savedList} collections={config.collections}
                onOpen={(s) => openConv(s.conversationId, s.messageId)}
                onRemove={(s) => { api.saved.remove(s.messageId); refresh(); }}
                onUpdate={(s, patch) => { api.saved.update(s.id, patch); refresh(); }} />
            </div>
          ) : view === "library" ? (
            <div key="library" className="flex-1 overflow-y-auto"><LibraryView items={items} onOpen={openItem} /></div>
          ) : view === "sources" ? (
            <div key="sources" className="flex-1 overflow-y-auto"><SourcesView active={source} habits={habits} onUse={useSource} /></div>
          ) : view === "memory" ? (
            <div key="memory" className="flex-1 overflow-y-auto"><MemoryView items={items} theme={theme === "dark" ? "dark" : "light"} onOpenItem={openItem} onUseSource={useSource} /></div>
          ) : empty ? welcome : thread}
        </main>

        <AnimatePresence>
          {panel && view === "chat" && (
            <motion.section key="panel" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.25 }}
              className="fixed inset-0 z-30 lg:static lg:z-auto lg:w-[44%] lg:max-w-[700px] shrink-0 flex flex-col bg-background lg:border-l border-border">
              <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-border/70">
                <span className="text-accent">{panel.kind === "deck" ? <Presentation className="w-4 h-4" /> : <FileText className="w-4 h-4" />}</span>
                <span className="text-[14px] font-semibold text-foreground truncate">{panel.kind === "deck" ? DECKS.find((d) => d.id === panel.deck)?.title : PAPER.title}</span>
                <span className="flex-1" />
                {panel.kind === "deck"
                  ? <a href={`/landing/decks/${panel.deck}.pptx`} download className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold bg-ink text-ink-fg hover:opacity-90"><Download className="w-3.5 h-3.5" /> PowerPoint</a>
                  : <Tip text="Not in the beta yet" side="bottom"><button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold bg-ink text-ink-fg opacity-80"><Download className="w-3.5 h-3.5" /> PDF</button></Tip>}
                <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="p-2 rounded-full text-muted hover:text-foreground hover:bg-card"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto">{panel.kind === "deck" ? <DeckPanel deckId={panel.deck} /> : <PaperPanel />}</div>
            </motion.section>
          )}
        </AnimatePresence>

        {saveFor && (
          <SaveDialog collections={config.collections} onClose={() => setSaveFor(null)}
            onSave={(collection, note) => {
              const c = api.conversations.get(activeId ?? "");
              api.saved.add({ messageId: saveFor.id, conversationId: activeId ?? "", collection, note, title: c?.title ?? title, excerpt: api.speakable(saveFor.run).slice(0, 220), intent: saveFor.intent.intent });
              setSaveFor(null); refresh();
            }} />
        )}
        {tour && view === "chat" && empty && <Walkthrough steps={TOUR} onDone={() => { setTour(false); api.onboarding.complete(); }} />}
      </div>
    </MotionConfig>
  );
}
