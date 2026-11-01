"use client";

// /beta: Vivran as a conversation, on the real backend. Each request is read and
// routed by POST /api/chat/route (backend app/ai/task_router.py), then answered
// by the generator its route names (lib/live.ts). Chats are kept in this
// browser per account; everything made is saved to the Library on the server.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowRight, ArrowUp, BookOpen, Check, Download, FileText, LayoutGrid, Loader2, Menu, Mic, Moon, PanelLeft, Paperclip,
  ArrowUpRight, Presentation, Square, SquarePen, Sun, Wand2, X,
} from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { downloadAssessmentPdf, libraryHref, listSources, type AssessmentGenerateResponse, type DeckReady, type LibraryEntry, type Source as SourceRow } from "@/services/api";
import * as api from "./lib/api";
import * as live from "./lib/live";
import { TIPS, TOUR } from "./lib/config";
import type { ActionId, Block, BotMsg, Conversation, Folder, Intent, Msg, Saved, Starter } from "./lib/types";
import { useSpeaker, useSpeechInput } from "./lib/voice";
import { ActionBar, BlockView, Thinking } from "./ui/blocks";
import { Icon, InfoTip, Tip, Walkthrough } from "./ui/kit";
import { DeckPanel, FeaturesView, PaperPanel, SaveDialog, SavedView } from "./ui/panels";
import { Sidebar, type Since } from "./ui/sidebar";
import { AccountSettings } from "@/app/components/account-settings";
import { DotField } from "@/app/components/dot-field";
import { AddSourceDialog, LibraryView, MemoryView, SourcesView } from "./ui/workspace";

type Panel = { kind: "deck"; deck: DeckReady } | { kind: "paper"; data: AssessmentGenerateResponse } | { kind: "loading"; title: string } | null;
type View = "chat" | "features" | "saved" | "library" | "sources" | "memory" | "account";
type Active = live.ActiveSource & { reading?: boolean };

export default function BetaPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const config = api.getConfig();
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
  const [source, setSource] = useState<Active | null>(null);
  const [sourceMenu, setSourceMenu] = useState<SourceRow[] | null>(null);
  const [adding, setAdding] = useState<File | null>(null);
  const [sourcesVersion, setSourcesVersion] = useState(0);
  const [cite, setCite] = useState<string | null>(null);
  const [side, setSide] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [tour, setTour] = useState(false);
  const [saveFor, setSaveFor] = useState<BotMsg | null>(null);
  const [query, setQuery] = useState("");
  const [since, setSince] = useState<Since>("all");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [autoRead, setAutoRead] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [better, setBetter] = useState<{ from: string; to: string; added: string[] } | null>(null);
  const [voiced, setVoiced] = useState(false);
  const stopped = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const { speaking, speak } = useSpeaker();

  const name = user?.name ?? "Teacher";
  const profile: live.Profile = { name, grade: user?.preferredGrades?.[0], subject: user?.preferredSubjects?.[0], language: user?.preferredLanguage };
  const last = msgs[msgs.length - 1];
  const running = !!last && last.role === "assistant" && last.live;

  /* ── data ── */
  const refresh = useCallback(() => {
    setConvs(api.search(query, { folderId: folderFilter, since }));
    setFolders(api.folders.list().slice());
    setSavedList(api.saved.list());
  }, [query, folderFilter, since]);

  useEffect(() => {
    if (!user) return;
    api.scope(user.id); live.scopeStore(user.id);
    setAutoRead(api.prefs.get().autoRead); setShowRoute(api.prefs.get().showRoute);
    setReady(true);
    if (!api.onboarding.completed()) setTimeout(() => setTour(true), 700);
  }, [user]);
  useEffect(() => { if (ready) refresh(); }, [ready, refresh]);

  // persist the open chat whenever it settles
  useEffect(() => {
    if (!activeId || running) return;
    api.conversations.save(activeId, { messages: msgs });
    refresh();
  }, [msgs, activeId, running, refresh]);

  // a file just added is read in the background; say when it's ready
  useEffect(() => {
    if (!source?.reading) return;
    const t = setInterval(() => listSources().then((r) => {
      const s = r.sources.find((x) => x.id === source.id);
      if (s?.facts?.status === "READY") setSource({ id: s.id, title: s.title });
      if (s?.facts?.status === "FAILED") setSource(null);
    }).catch(() => {}), 3500);
    return () => clearInterval(t);
  }, [source]);

  /* ── sending ── */
  const patch = (id: string, f: (m: BotMsg) => BotMsg) => setMsgs((m) => m.map((x) => (x.id === id && x.role === "assistant" ? f(x) : x)));

  const send = useCallback(async (raw: string, opts: { command?: live.Command; voice?: boolean } = {}) => {
    let text = raw.trim();
    if (!text && !starter) return;
    if (running) { if (text) setQueue((q) => [...q, text]); setDraft(""); return; }
    let forced: Intent | undefined;
    let shown = text;
    if (starter && !opts.command) {
      text = api.starterPrompt(starter.id, text, !!source);
      forced = starter.intent; shown = text;
    }
    // a reply to "which one?" resumes the request that was put on hold
    const prev = msgs[msgs.length - 1];
    if (prev?.role === "assistant" && prev.pending && !opts.command) { text = api.resume(prev.pending, text); forced = prev.pending.intent; }

    const botId = api.uid();
    const first = opts.command?.kind === "writeDeck" ? "Writing your slides" : opts.command?.kind === "writePaper" ? "Writing the paper" : "Reading your request";
    const bot: BotMsg = {
      id: botId, role: "assistant", run: { steps: [{ label: first, detail: "", ms: 0 }], blocks: [] },
      intent: { intent: forced ?? "general", label: "Working", confidence: 0, entities: {} },
      step: 0, shown: 0, live: true, waiting: true, startedAt: Date.now(), request: text,
    };
    const userMsg: Msg = { id: api.uid(), role: "user", text: shown, starter: starter && !opts.command ? starter.label : undefined, voice: opts.voice };
    let id = activeId;
    if (!id) { id = api.conversations.create("New chat").id; setActiveId(id); }
    const history = msgs;
    setMsgs((m) => [...m, userMsg, bot]);
    setDraft(""); setCite(null); setView("chat"); setStarter(null); setBetter(null); setVoiced(false);

    const reply = await live.respond(text, { source: source?.reading ? null : source, profile, history, forced, command: opts.command, voice: opts.voice });
    if (stopped.current.has(botId)) return;
    const c = api.conversations.get(id);
    const settled = history.some((m) => m.role === "assistant" && !m.pending);
    if (c && !c.titleEdited && !settled && !reply.ask && !opts.command && reply.run.blocks[0]?.t !== "notice") {
      const t = api.titleFor(reply.result, text); api.conversations.save(id, { title: t }); setTitle(t);
    } else if (c) setTitle(c.title);
    patch(botId, (x) => ({
      ...x, run: reply.run, intent: reply.result, waiting: false, step: 0, shown: 0, routes: reply.routes,
      pending: reply.ask ? { text, intent: reply.result.intent, field: reply.ask.field } : undefined,
    }));
  }, [running, starter, source, msgs, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAction = useCallback(async (m: BotMsg, a: ActionId) => {
    if (running) return;
    const botId = api.uid();
    const userMsg: Msg = { id: api.uid(), role: "user", text: a === "simplify" || a === "elaborate" ? (a === "simplify" ? "Simpler, please" : "More depth, please") : `${a[0].toUpperCase()}${a.slice(1)}` };
    const bot: BotMsg = { id: botId, role: "assistant", run: { steps: [{ label: "Working on the answer above", detail: "", ms: 0 }], blocks: [] }, intent: m.intent, step: 0, shown: 0, live: true, waiting: true, startedAt: Date.now(), request: m.request };
    setMsgs((x) => [...x, userMsg, bot]);
    const t = await live.transform(m, a, msgs);
    if (stopped.current.has(botId)) return;
    patch(botId, (x) => ({ ...x, run: t.run, derived: t.derived, routes: t.routes, waiting: false, step: 0, shown: 0 }));
  }, [running, msgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const openArtifact = useCallback(async (b: Extract<Block, { t: "artifact" }>) => {
    setPanel({ kind: "loading", title: b.title });
    const v = await live.loadArtifact(b.kind, b.ref, b.libraryId).catch(() => null);
    if (v?.kind === "deck") setPanel({ kind: "deck", deck: v.deck });
    else if (v?.kind === "paper") setPanel({ kind: "paper", data: v.data });
    else setPanel(null);
  }, []);

  // the run: finish each thinking step, then reveal blocks one by one
  useEffect(() => {
    if (!last || last.role !== "assistant" || !last.live || last.waiting) return;
    const r = last.run;
    const thinking = last.step < r.steps.length;
    const wait = thinking ? r.steps[last.step].ms : r.blocks[last.shown]?.t === "text" ? 500 : 260;
    const t = setTimeout(() => {
      let next: BotMsg;
      if (thinking) next = { ...last, step: last.step + 1 };
      else {
        const shown = last.shown + 1;
        const blk = r.blocks[last.shown];
        if (blk?.t === "artifact" && window.innerWidth >= 1100) openArtifact(blk);
        next = shown >= r.blocks.length ? { ...last, shown, live: false, tookMs: Date.now() - last.startedAt } : { ...last, shown };
        if (!next.live && autoRead) speak(next.id, live.speakable(next.run));
      }
      setMsgs((m) => m.map((x) => (x.id === last.id ? next : x)));
    }, wait);
    return () => clearTimeout(t);
  }, [last, autoRead, speak, openArtifact]);

  useEffect(() => { if (!running && queue.length) { const [q, ...rest] = queue; setQueue(rest); send(q); } }, [running, queue, send]);
  useEffect(() => { if (!flash) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, flash]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => document.getElementById(`msg-${flash}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    const u = setTimeout(() => setFlash(null), 2400);
    return () => { clearTimeout(t); clearTimeout(u); };
  }, [flash]);

  /* ── voice ── */
  const mic = useSpeechInput((text, final) => { setDraft(text); setVoiced(true); if (final) setTimeout(() => send(text, { voice: true }), 250); });

  /* ── improve my request ── */
  const improve = async () => {
    const text = draft.trim();
    if (text.split(/\s+/).length < 2 || improving) return;
    setImproving(true);
    try {
      const r = await live.improve(text, profile, starter?.intent);
      setBetter(r.changed ? { from: text, to: r.improved, added: r.added } : { from: text, to: "", added: [] });
    } catch { setBetter({ from: text, to: "", added: [] }); }
    setImproving(false);
  };

  /* ── navigation ── */
  const stopRun = () => {
    if (last?.role === "assistant") stopped.current.add(last.id);
    setMsgs((m) => m.map((x) => (x === last && x.role === "assistant" ? { ...x, live: false, waiting: false, stopped: true, tookMs: Date.now() - x.startedAt } : x)));
  };
  const fresh = () => {
    if (running) stopRun();
    setActiveId(null); setMsgs([]); setPanel(null); setTitle("New chat"); setQueue([]); setDrawer(false); setView("chat"); setStarter(null); setBetter(null);
    setTimeout(() => box.current?.focus(), 50);
  };
  const openConv = (id: string, focusMsg?: string) => {
    const c = api.conversations.get(id); if (!c) return;
    setActiveId(id); setMsgs(c.messages.map((m) => (m.role === "assistant" ? { ...m, live: false, waiting: false } : m))); setTitle(c.title);
    setPanel(null); setDrawer(false); setQueue([]); setView("chat"); setFlash(focusMsg ?? null);
  };
  const toggleSave = (m: BotMsg) => {
    if (api.saved.isSaved(m.id)) { api.saved.remove(m.id); refresh(); }
    else setSaveFor(m);
  };
  const openEntry = async (e: LibraryEntry) => {
    fresh();
    setPanel({ kind: "loading", title: e.title });
    const r = await live.runFromLibrary(e).catch(() => null);
    if (!r) { setPanel(null); window.location.href = libraryHref(e); return; }
    const c = api.conversations.create(e.title);
    const bot: BotMsg = { id: api.uid(), role: "assistant", run: r.run, intent: { intent: r.intent, label: e.title, confidence: 1, entities: {} }, step: r.run.steps.length, shown: r.run.blocks.length, live: false, startedAt: Date.now(), tookMs: 0, derived: "Opened from your Library", request: e.title };
    const msgsNow: Msg[] = [{ id: api.uid(), role: "user", text: `Open “${e.title}”` }, bot];
    api.conversations.save(c.id, { messages: msgsNow });
    setActiveId(c.id); setMsgs(msgsNow); setTitle(c.title); refresh();
    const art = r.run.blocks.find((b) => b.t === "artifact");
    if (art?.t === "artifact") openArtifact(art); else setPanel(null);
  };
  const useSource = (s: live.ActiveSource | null) => { setSource(s); setSourceMenu(null); if (s) fresh(); };
  const pickSource = () => {
    if (sourceMenu) { setSourceMenu(null); return; }
    setSourceMenu([]);
    listSources().then((r) => setSourceMenu(r.sources.filter((s) => s.facts?.status === "READY" && !s.id.startsWith("style:")))).catch(() => setSourceMenu([]));
  };
  const empty = msgs.length === 0;

  if (!ready) return <div className="h-[100dvh] grid place-items-center bg-background"><Loader2 className="w-5 h-5 animate-spin text-muted" /></div>;

  const sidebar = (
    <Sidebar
      convs={convs} folders={folders} activeId={activeId} view={view} savedCount={savedList.length}
      query={query} since={since} folderFilter={folderFilter} autoRead={autoRead} showRoute={showRoute}
      user={{ name, email: user?.email ?? "" }}
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
      onReset={() => { if (!window.confirm("Clear every chat in this browser? Your Library and sources are kept.")) return; api.resetAll(); fresh(); refresh(); }}
      onAutoRead={(v) => { setAutoRead(v); api.prefs.set({ autoRead: v }); }}
      onShowRoute={(v) => { setShowRoute(v); api.prefs.set({ showRoute: v }); }}
      onSignOut={() => { logout(); }}
    />
  );

  const canImprove = !running && draft.trim().split(/\s+/).length >= 2;
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
      <AnimatePresence>
        {better && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="mb-2 rounded-2xl border border-accent-line bg-accent-soft/60 p-3.5">
            {better.to ? (
              <>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent"><Wand2 className="w-3.5 h-3.5" /> A fuller request</div>
                <p className="mt-1.5 text-[14px] text-foreground leading-snug">{better.to}</p>
                {better.added.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{better.added.map((a) => <span key={a} className="text-[11px] px-2 py-0.5 rounded-full bg-surface border border-border text-muted">+ {a}</span>)}</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => send(better.to)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-ink text-ink-fg text-[12.5px] font-semibold"><Check className="w-3.5 h-3.5" /> Use and send</button>
                  <button type="button" onClick={() => { setDraft(better.to); setBetter(null); box.current?.focus(); }} className="px-3.5 py-1.5 rounded-full border border-border bg-surface text-[12.5px] font-semibold text-foreground">Edit it first</button>
                  <button type="button" onClick={() => setBetter(null)} className="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold text-muted hover:text-foreground">Keep mine</button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 text-[13px] text-foreground">
                Your request already has what Vivran needs.
                <button type="button" aria-label="Close" onClick={() => setBetter(null)} className="p-1 text-muted hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div data-tour="composer" className="vv-composer rounded-[26px] border border-border bg-surface shadow-soft focus-within:border-accent-line focus-within:shadow-panel transition-all">
        {starter && (
          <div className="px-4 pt-3 -mb-1">
            <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-ink text-ink-fg text-[12.5px] font-medium">
              <Icon name={starter.icon} className="w-3.5 h-3.5" />{starter.label}
              <button type="button" aria-label="Clear starter" onClick={() => setStarter(null)} className="ml-0.5 p-0.5 rounded-full hover:bg-white/15"><X className="w-3 h-3" /></button>
            </span>
          </div>
        )}
        <textarea ref={box} value={draft} rows={empty ? 3 : 2} onChange={(e) => { setDraft(e.target.value); setVoiced(false); if (better && e.target.value !== better.from) setBetter(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft, { voice: voiced }); } }}
          placeholder={mic.listening ? "Listening…" : running ? "Send a follow-up. It's held and sent when this finishes…" : starter ? starter.placeholder : "Ask Vivran to plan, teach, assess or explain…"}
          className="w-full resize-none bg-transparent px-5 pt-4 text-[15px] text-foreground placeholder:text-faint outline-none" />
        <div className="relative flex items-center gap-1.5 px-3 pb-3">
          <input ref={file} type="file" accept=".pdf,.docx,.pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setAdding(f); }} />
          <Tip text={TIPS.attach}><button type="button" aria-label="Attach a file" onClick={() => file.current?.click()} className="w-9 h-9 grid place-items-center rounded-full text-muted hover:text-foreground hover:bg-card"><Paperclip className="w-4 h-4" /></button></Tip>
          <span data-tour="source" className="min-w-0 inline-flex">
            {source ? (
              <Tip text={source.reading ? "Still reading this file. Answers use it once it's ready." : TIPS.source}>
                <span className="inline-flex items-center gap-1.5 min-w-0 px-3 py-1.5 rounded-full text-[12.5px] bg-accent-soft text-foreground border border-accent-line">
                  {source.reading ? <Loader2 className="w-3.5 h-3.5 text-accent shrink-0 animate-spin" /> : <BookOpen className="w-3.5 h-3.5 text-accent shrink-0" />}
                  <span className={`truncate max-w-[110px] ${panel ? "sm:max-w-[150px]" : "sm:max-w-[220px]"}`}>{source.title}</span>
                  <button type="button" aria-label="Don't use this source" onClick={() => setSource(null)} className="text-muted hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                </span>
              </Tip>
            ) : (
              <button type="button" onClick={pickSource} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] text-muted border border-dashed border-border hover:text-foreground"><BookOpen className="w-3.5 h-3.5" /> Use a source</button>
            )}
          </span>
          {sourceMenu && !source && (
            <div className="absolute left-3 bottom-14 z-20 w-72 max-w-[calc(100vw-3rem)] rounded-2xl border border-border bg-background shadow-panel p-1.5">
              {sourceMenu.length === 0 && <p className="px-3 py-2 text-[12.5px] text-muted">No ready files yet.</p>}
              <div className="max-h-56 overflow-y-auto">
                {sourceMenu.map((s) => (
                  <button key={s.id} type="button" onClick={() => useSource({ id: s.id, title: s.title })} className="w-full text-left px-3 py-2 rounded-xl hover:bg-card">
                    <span className="block text-[13px] text-foreground truncate">{s.title}</span>
                    <span className="block text-[11.5px] text-muted">{s.facts?.chunks ?? 0} passages</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { setSourceMenu(null); file.current?.click(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-card text-[13px] font-semibold text-foreground border-t border-border mt-1"><Paperclip className="w-3.5 h-3.5" /> Upload a file</button>
            </div>
          )}
          <span className="flex-1" />
          <span className={`hidden ${panel ? "2xl:inline-flex" : "sm:inline-flex"} items-center gap-1 text-[12px] text-faint`}>Grounded <InfoTip text={TIPS.grounded} /></span>
          <Tip text={TIPS.improve}>
            <button type="button" aria-label="Improve my request" disabled={!canImprove} onClick={improve}
              className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium text-muted hover:text-foreground hover:bg-card disabled:opacity-30 disabled:hover:bg-transparent">
              {improving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}<span className={`hidden ${panel ? "2xl:inline" : "sm:inline"}`}>Improve</span>
            </button>
          </Tip>
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
            <button type="button" aria-label="Send" disabled={!draft.trim() && !starter} onClick={() => send(draft, { voice: voiced })} className="w-9 h-9 rounded-full grid place-items-center bg-ink text-ink-fg disabled:opacity-30 transition-opacity"><ArrowUp className="w-[18px] h-[18px]" /></button>
          )}
        </div>
      </div>
      {mic.error && <p className="mt-1.5 text-center text-[12px] text-danger">{mic.error}</p>}
    </div>
  );

  const welcome = (
    <div className="flex-1 overflow-y-auto">
      <div className="relative min-h-full flex flex-col items-center justify-center px-4 py-10">
        <DotField />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-3xl">
          <div className="flex items-center justify-center gap-3 mb-2">
            <BrandMark className="w-9 h-9" />
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">What are we teaching today?</h2>
          </div>
          <p className="text-center text-[14px] text-muted mb-7">
            Good to see you, {name.split(/\s+/)[0]}. {source ? <>Answers will come from <strong className="font-semibold text-foreground">{source.title}</strong> first.</> : "Attach a chapter and answers cite its pages."}
          </p>
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
              {(m.starter || m.voice) && <span className="text-[11px] text-faint">{[m.starter, m.voice && "Spoken"].filter(Boolean).join(" · ")}</span>}
              <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-card border border-border px-4 py-2.5 text-[15px] text-foreground">{m.text}</div>
            </motion.div>
          ) : (
            <div key={m.id} id={`msg-${m.id}`} className={`rounded-3xl transition-shadow duration-700 ${flash === m.id ? "ring-2 ring-accent ring-offset-8 ring-offset-background" : ""}`}>
              <Thinking m={m} showRoute={showRoute} />
              <div className="space-y-4">
                {m.run.blocks.slice(0, m.shown).map((b, bi) => (
                  <motion.div key={bi} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <BlockView b={b} live={m.live && bi === m.shown - 1} locked={mi < msgs.length - 1} focus={mi === msgs.length - 1 ? cite : null}
                      h={{
                        onCite: setCite, onSend: (t) => send(t),
                        onChoices: (t, ref) => send(t, { command: { kind: "writePaper", ref, choice: t } }),
                        onAnswer: (a) => send(a),
                        onApprove: (ref, slides) => send("Approved. Write the deck.", { command: { kind: "writeDeck", ref, slides } }),
                        onOpen: openArtifact,
                      }} />
                  </motion.div>
                ))}
              </div>
              {!m.live && !m.stopped && (
                <ActionBar m={m} compact={mi < msgs.length - 1} saved={savedList.some((s) => s.messageId === m.id)} speaking={speaking === m.id}
                  onAction={(a) => runAction(m, a)} onSpeak={() => speak(m.id, live.speakable(m.run))}
                  onCopy={() => navigator.clipboard?.writeText(live.textOf(m.run).replace(/\*\*/g, ""))} onSave={() => toggleSave(m)} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-3 sm:px-6 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        {composer}
        <p className="mt-2 text-center text-[11px] text-faint">Beta. Vivran checks its work, and so should you.</p>
      </div>
    </>
  );

  const panelTitle = panel?.kind === "deck" ? panel.deck.context.topic : panel?.kind === "paper" ? String((panel.data.assessment as { title?: string } | null)?.title ?? "Exam paper") : panel?.kind === "loading" ? panel.title : "";

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-[100dvh] flex bg-background text-foreground overflow-clip">
        <aside className={`hidden md:block shrink-0 border-r border-border transition-[width] duration-300 overflow-clip ${side ? "w-72" : "w-0 border-r-0"}`}>
          <div className="w-72 h-full">{sidebar}</div>
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
            <span className={`hidden ${panel ? "xl:inline" : "sm:inline"} shrink-0 whitespace-nowrap text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-border text-faint`}>Beta</span>
            <span className="flex-1" />
            <Tip text={theme === "dark" ? "Light theme" : "Dark theme"} side="bottom"><button type="button" aria-label="Toggle theme" onClick={toggleTheme} className="p-2 rounded-lg text-muted hover:text-foreground">{theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button></Tip>
          </header>

          {view === "features" ? (
            <div className="flex-1 overflow-y-auto"><FeaturesView onTry={(p) => { fresh(); setTimeout(() => send(p), 60); }} onClose={() => setView("chat")} /></div>
          ) : view === "saved" ? (
            <div className="flex-1 overflow-y-auto">
              <SavedView items={savedList} collections={config.collections}
                onOpen={(s) => openConv(s.conversationId, s.messageId)}
                onRemove={(s) => { api.saved.remove(s.messageId); refresh(); }}
                onUpdate={(s, p) => { api.saved.update(s.id, p); refresh(); }} />
            </div>
          ) : view === "library" ? (
            <div key="library" className="flex-1 overflow-y-auto"><LibraryView onOpen={openEntry} /></div>
          ) : view === "sources" ? (
            <div key="sources" className="flex-1 overflow-y-auto"><SourcesView active={source} version={sourcesVersion} onUse={useSource} onAddFile={setAdding} /></div>
          ) : view === "account" ? (
            <div key="account" className="flex-1 overflow-y-auto px-4 py-8"><AccountSettings onDeleted={() => api.resetAll()} /></div>
          ) : view === "memory" ? (
            <div key="memory" className="flex-1 overflow-y-auto"><MemoryView name={name} theme={theme === "dark" ? "dark" : "light"} onOpenItem={openEntry} onUseSource={useSource} /></div>
          ) : empty ? welcome : thread}
        </main>

        <AnimatePresence>
          {panel && view === "chat" && (
            <motion.section key="panel" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.25 }}
              className="fixed inset-0 z-30 lg:static lg:z-auto lg:w-[46%] lg:max-w-[760px] shrink-0 flex flex-col bg-background lg:border-l border-border">
              <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-border/70">
                <span className="text-accent">{panel.kind === "paper" ? <FileText className="w-4 h-4" /> : <Presentation className="w-4 h-4" />}</span>
                <span className="text-[14px] font-semibold text-foreground truncate">{panelTitle}</span>
                <span className="flex-1" />
                {panel.kind === "paper" && panel.data.assessment && (
                  <button type="button" onClick={() => downloadAssessmentPdf(panel.data.assessment!, true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold bg-ink text-ink-fg hover:opacity-90"><Download className="w-3.5 h-3.5" /> PDF</button>
                )}
                <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="p-2 rounded-full text-muted hover:text-foreground hover:bg-card"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {panel.kind === "deck" ? <DeckPanel deck={panel.deck} /> : panel.kind === "paper" ? <PaperPanel data={panel.data} />
                  : <div className="h-full grid place-items-center text-sm text-muted"><span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Opening…</span></div>}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {adding && (
          <AddSourceDialog file={adding} onClose={() => setAdding(null)}
            onAdded={(s) => { setAdding(null); setSource({ ...s, reading: true }); setSourcesVersion((v) => v + 1); }} />
        )}
        {saveFor && (
          <SaveDialog collections={config.collections} onClose={() => setSaveFor(null)}
            onSave={(collection, note) => {
              const c = api.conversations.get(activeId ?? "");
              api.saved.add({ messageId: saveFor.id, conversationId: activeId ?? "", collection, note, title: c?.title ?? title, excerpt: live.speakable(saveFor.run).slice(0, 220), intent: saveFor.intent.intent });
              setSaveFor(null); refresh();
            }} />
        )}
        {tour && view === "chat" && empty && <Walkthrough steps={TOUR} onDone={() => { setTour(false); api.onboarding.complete(); }} />}
      </div>
    </MotionConfig>
  );
}
