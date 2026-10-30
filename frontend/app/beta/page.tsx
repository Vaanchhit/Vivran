"use client";

// /beta: Vivran as a conversation. A frontend-only preview of a chat-style
// product: every run is scripted (script.ts) from sample data, and nothing
// calls a model. Plan-before-produce, teaching memory, sources and the
// artifact panel are the parts of Vivran this layout is meant to show off.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Brain, Check, ChevronDown, ChevronRight,
  Download, FileText, FolderOpen, Library, Lightbulb, Menu, Moon, PanelLeft, Paperclip, Presentation,
  Search, Settings, Share2, Sparkles, Square, SquarePen, Sun, X,
} from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";
import { useTheme } from "@/lib/theme-context";
import { DECK_SLIDES, FLOWS, PAPER, RECENTS, SOURCE_FILE, USER_LINES, route, type Block, type FlowId, type Source } from "./script";

type UserMsg = { id: string; role: "user"; text: string };
type BotMsg = {
  id: string; role: "assistant"; flow: FlowId;
  step: number;          // steps finished
  shown: number;         // blocks revealed
  live: boolean;         // still running
  stopped?: boolean;
  startedAt: number; tookMs?: number;
};
type Msg = UserMsg | BotMsg;

const uid = () => Math.random().toString(36).slice(2, 9);
const DECK = "/landing/decks/french-revolution";
const pad = (n: number) => String(n).padStart(2, "0");

function doneBot(flow: FlowId): BotMsg {
  const f = FLOWS[flow];
  const took = f.steps.reduce((a, s) => a + s.ms, 0) + f.blocks.length * 450;
  return { id: uid(), role: "assistant", flow, step: f.steps.length, shown: f.blocks.length, live: false, startedAt: 0, tookMs: took };
}

/* ───────────────────────── small pieces ───────────────────────── */

/** **bold** and [S1] citations, nothing else. */
function Rich({ text, onCite }: { text: string; onCite?: (tag: string) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[S\d\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
        const m = p.match(/^\[(S\d)\]$/);
        if (m) return (
          <button key={i} type="button" onClick={() => onCite?.(m[1])}
            className="inline-flex items-center align-[1px] mx-0.5 px-1.5 h-[18px] rounded-full text-[10px] font-semibold bg-accent-soft text-accent border border-accent-line hover:bg-accent-soft-hi">
            {m[1]}
          </button>
        );
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

/** Text that writes itself word by word while live. */
function Stream({ text, live, onCite }: { text: string; live: boolean; onCite?: (t: string) => void }) {
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  const [n, setN] = useState(live ? 0 : words.length);
  useEffect(() => {
    if (!live) { setN(words.length); return; }
    const id = setInterval(() => setN((v) => (v >= words.length ? (clearInterval(id), v) : v + 2)), 28);
    return () => clearInterval(id);
  }, [live, words]);
  return <Rich text={words.slice(0, n).join("")} onCite={onCite} />;
}

function Elapsed({ from }: { from: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  return <>{Math.max(0, Math.floor((now - from) / 1000))}s</>;
}

/* ───────────────────────── thinking trail ───────────────────────── */

function Thinking({ m }: { m: BotMsg }) {
  const f = FLOWS[m.flow];
  const [open, setOpen] = useState(false);
  const thinking = m.live && m.step < f.steps.length;
  const cur = f.steps[Math.min(m.step, f.steps.length - 1)];
  if (thinking) {
    return (
      <div className="mb-3">
        <div className="flex items-center gap-2.5 text-sm">
          <span className="relative w-5 h-5"><BrandMark className="w-5 h-5 animate-pulse" /></span>
          <span className="font-medium text-foreground">{cur.label}…</span>
          <span className="text-faint tabular-nums"><Elapsed from={m.startedAt} /></span>
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={m.step} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-2 ml-2.5 pl-4 border-l-2 border-border text-[13px] italic text-muted leading-relaxed">
            {cur.detail}
          </motion.p>
        </AnimatePresence>
      </div>
    );
  }
  const secs = Math.max(1, Math.round((m.tookMs ?? 0) / 1000));
  return (
    <div className="mb-3">
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
        <Sparkles className="w-3.5 h-3.5 text-accent" />
        {m.stopped ? "Stopped" : `Worked for ${secs}s`}
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2 ml-1.5 pl-4 border-l-2 border-border space-y-2">
            {f.steps.slice(0, m.step).map((s) => (
              <li key={s.label} className="text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><Check className="w-3.5 h-3.5 text-success" />{s.label}</span>
                <p className="text-muted italic mt-0.5">{s.detail}</p>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────── blocks ───────────────────────── */

function Clarify({ b, locked, onSubmit }: { b: Extract<Block, { t: "clarify" }>; locked: boolean; onSubmit: (text: string, next: FlowId) => void }) {
  const [pick, setPick] = useState<Record<number, string>>({ 0: b.questions[0].options[1], 1: b.questions[1]?.options[0] });
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4">
      {b.questions.map((q, i) => (
        <div key={q.q}>
          <div className="text-sm font-semibold text-foreground">{i + 1}. {q.q}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {q.options.map((o) => (
              <button key={o} type="button" disabled={locked} onClick={() => setPick({ ...pick, [i]: o })}
                className={`px-3.5 py-1.5 rounded-full text-[13px] border transition-colors ${pick[i] === o ? "bg-ink text-ink-fg border-transparent" : "border-border text-muted hover:text-foreground hover:border-border-hi"} disabled:opacity-60`}>
                {o}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!locked && (
        <button type="button" onClick={() => onSubmit(Object.values(pick).filter(Boolean).join(" · "), b.next)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ink-fg text-sm font-semibold hover:opacity-90">
          Write the paper <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function Outline({ b, locked, onApprove }: { b: Extract<Block, { t: "outline" }>; locked: boolean; onApprove: () => void }) {
  const [slides, setSlides] = useState(b.slides);
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-card">
        <span className="text-[13px] font-semibold text-foreground">Outline · {slides.length} slides</span>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${locked ? "bg-success-soft text-success" : "bg-accent-soft text-accent"}`}>{locked ? "Approved" : "Waiting for you"}</span>
      </div>
      <ol className="divide-y divide-border">
        {slides.map((s, i) => (
          <li key={i} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 group">
            <span className="w-5 text-[12px] text-faint tabular-nums">{i + 1}</span>
            <span className="hidden sm:inline-flex shrink-0 text-[10.5px] px-2 py-0.5 rounded-full border border-border text-muted">{s.move}</span>
            <input value={s.title} disabled={locked} aria-label={`Slide ${i + 1} title`}
              onChange={(e) => setSlides(slides.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground outline-none rounded-lg px-1.5 py-1 focus:bg-card disabled:opacity-100" />
            {!locked && i > 0 && i < slides.length - 1 && (
              <button type="button" aria-label="Remove slide" onClick={() => setSlides(slides.filter((_, k) => k !== i))}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full text-faint hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            )}
          </li>
        ))}
      </ol>
      {!locked && (
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-t border-border">
          <button type="button" onClick={onApprove} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ink-fg text-sm font-semibold hover:opacity-90">
            Approve and write <ArrowRight className="w-4 h-4" />
          </button>
          <span className="text-[12px] text-muted">Nothing is written until you approve.</span>
        </div>
      )}
    </div>
  );
}

function ArtifactCard({ b, onOpen }: { b: Extract<Block, { t: "artifact" }>; onOpen: () => void }) {
  const deck = b.kind === "deck";
  return (
    <button type="button" onClick={onOpen}
      className="group w-full text-left flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 pr-5 hover:border-border-hi hover:shadow-soft transition-all">
      <div className="relative w-28 sm:w-36 aspect-video shrink-0 rounded-xl overflow-hidden border border-border bg-card">
        {deck ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${DECK}/t01.jpg`} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 p-2.5 flex flex-col gap-1">
            <div className="h-1.5 w-2/3 rounded bg-border-hi" /><div className="h-1 w-full rounded bg-border" /><div className="h-1 w-5/6 rounded bg-border" />
            <div className="h-1 w-full rounded bg-border mt-1" /><div className="h-1 w-3/4 rounded bg-border" /><div className="h-1 w-4/5 rounded bg-border" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
          {deck ? <Presentation className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}{deck ? "Slides" : "Exam paper"}
        </div>
        <div className="mt-1 font-semibold text-foreground truncate">{b.title}</div>
        <div className="text-[12.5px] text-muted truncate">{b.meta}</div>
      </div>
      <span className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-foreground group-hover:text-accent">Open <ArrowRight className="w-4 h-4" /></span>
    </button>
  );
}

function Sources({ items, focus }: { items: Source[]; focus: string | null }) {
  const [open, setOpen] = useState(false);
  const show = open || !!focus;
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-foreground">
        <span className="flex -space-x-1">{items.slice(0, 3).map((s) => <span key={s.tag} className="w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold bg-accent-soft text-accent border-2 border-background">{s.tag}</span>)}</span>
        {items.length} sources from your material {show ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              {items.map((s) => (
                <div key={s.tag} className={`rounded-2xl border p-3 text-[12.5px] transition-colors ${focus === s.tag ? "border-accent-line bg-accent-soft" : "border-border bg-surface"}`}>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
                    <span className="px-1.5 rounded-full bg-accent-soft text-accent">{s.tag}</span>
                    <span className="truncate">{s.file}</span><span className="shrink-0">· {s.where}</span>
                  </div>
                  <p className="mt-1.5 text-foreground/90 leading-snug">&ldquo;{s.quote}&rdquo;</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Explain() {
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-3 border-t border-border first:border-t-0 first:pt-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-faint pt-0.5">{k}</span>
      <div className="text-sm text-foreground leading-relaxed">{v}</div>
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      {row("The idea", <>From 1793 to 1794 the Jacobin government ruled through fear: anyone seen as an enemy of the republic could be arrested and executed.</>)}
      {row("Like…", <>A class monitor given full power to keep order, who starts punishing anyone who even <em>might</em> talk, until the whole class is afraid, including the monitor&rsquo;s own friends.</>)}
      {row("Maps to", (
        <div className="flex flex-wrap gap-1.5">
          {[["monitor", "Robespierre"], ["keeping order", "saving the republic"], ["punishments", "the guillotine"], ["the class", "French citizens"]].map(([a, b]) => (
            <span key={a} className="text-[12px] px-2.5 py-1 rounded-full border border-border bg-card">{a} <span className="text-faint">→</span> <strong className="font-semibold">{b}</strong></span>
          ))}
        </div>
      ))}
      {row("Where it breaks", <span className="text-muted">A monitor can&rsquo;t execute anyone, and the Terror happened during a war and a food crisis, not just one person&rsquo;s choices.</span>)}
      {row("Check", <ol className="list-decimal ml-4 space-y-1"><li>Why did the Jacobins say the Terror was necessary?</li><li>How did the Terror end for Robespierre himself?</li></ol>)}
    </div>
  );
}

/* ───────────────────────── artifact panel ───────────────────────── */

function DeckPanel() {
  const [i, setI] = useState(1);
  const n = DECK_SLIDES.length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowRight") setI((v) => Math.min(n, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(1, v - 1));
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [n]);
  return (
    <div className="p-4 sm:p-5">
      <div className="relative rounded-2xl overflow-hidden border border-border shadow-soft bg-card aspect-video">
        <AnimatePresence mode="wait">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img key={i} src={`${DECK}/${pad(i)}.jpg`} alt={DECK_SLIDES[i - 1].title}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 w-full h-full object-cover" />
        </AnimatePresence>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[11px] text-faint">Slide {i} of {n} · {DECK_SLIDES[i - 1].move}</div>
          <div className="text-sm font-semibold text-foreground truncate">{DECK_SLIDES[i - 1].title}</div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button type="button" aria-label="Previous slide" disabled={i === 1} onClick={() => setI(i - 1)} className="p-2 rounded-full border border-border text-muted hover:text-foreground disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
          <button type="button" aria-label="Next slide" disabled={i === n} onClick={() => setI(i + 1)} className="p-2 rounded-full border border-border text-muted hover:text-foreground disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {DECK_SLIDES.map((s, k) => (
          <button key={k} type="button" onClick={() => setI(k + 1)} aria-label={`Slide ${k + 1}`}
            className={`rounded-xl overflow-hidden border-2 transition-colors ${i === k + 1 ? "border-accent" : "border-transparent hover:border-border-hi"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${DECK}/t${pad(k + 1)}.jpg`} alt="" className="w-full aspect-video object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function PaperPanel() {
  const [key, setKey] = useState(false);
  let q = 0;
  return (
    <div className="p-4 sm:p-5">
      <div className="flex justify-end mb-3">
        <label className="inline-flex items-center gap-2 text-[12.5px] text-muted cursor-pointer">
          <input type="checkbox" checked={key} onChange={(e) => setKey(e.target.checked)} className="accent-[var(--accent-1)]" /> Show where each question comes from
        </label>
      </div>
      <div className="rounded-2xl border border-border bg-[#FFFDF9] text-[#1b1712] shadow-soft p-5 sm:p-8 font-serif">
        <div className="text-center border-b border-black/10 pb-4">
          <div className="text-[13px] tracking-wide">{PAPER.school}</div>
          <div className="text-lg font-bold mt-1">{PAPER.title}</div>
          <div className="text-[12px] text-black/60 mt-1">{PAPER.meta}</div>
        </div>
        {PAPER.sections.map((s) => (
          <div key={s.name} className="mt-5">
            <div className="flex items-baseline justify-between text-[13px] font-bold uppercase tracking-wide">
              <span>{s.name}</span><span className="text-black/50 font-semibold normal-case">{s.rule}</span>
            </div>
            <ol className="mt-2 space-y-2">
              {s.qs.map((x) => {
                q += 1;
                return (
                  <li key={q} className={`text-[13.5px] leading-relaxed flex gap-2 ${!x.cite ? "rounded-lg bg-amber-100/70 -mx-2 px-2 py-1.5" : ""}`}>
                    <span className="w-6 shrink-0 text-black/50">{q}.</span>
                    <span className="flex-1">
                      {x.q}
                      {key && x.cite && <span className="ml-2 font-sans text-[10px] font-semibold text-[#B3341A] border border-[#B3341A]/30 rounded-full px-1.5 py-px whitespace-nowrap">Unit 4 · {x.cite}</span>}
                      {!x.cite && (
                        <span className="mt-1 flex items-center gap-1.5 font-sans text-[11.5px] text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5" /> Not found in your material. Review or replace.
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function BetaPage() {
  const { theme, toggleTheme } = useTheme();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [panel, setPanel] = useState<null | "deck" | "paper">(null);
  const [side, setSide] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [cite, setCite] = useState<string | null>(null);
  const [source, setSource] = useState(true);
  const [title, setTitle] = useState("New chat");
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const last = msgs[msgs.length - 1];
  const running = !!last && last.role === "assistant" && last.live;

  const send = useCallback((text: string, forced?: FlowId) => {
    const t = text.trim(); if (!t) return;
    if (running) { setQueue((q) => [...q, t]); setDraft(""); return; }
    const flow = forced ?? route(t);
    setTitle((cur) => (cur === "New chat" ? FLOWS[flow].title : cur));
    setMsgs((m) => [...m, { id: uid(), role: "user", text: t },
      { id: uid(), role: "assistant", flow, step: 0, shown: 0, live: true, startedAt: Date.now() }]);
    setDraft(""); setCite(null);
  }, [running]);

  // the run: finish each thinking step, then reveal blocks one by one
  useEffect(() => {
    if (!last || last.role !== "assistant" || !last.live) return;
    const f = FLOWS[last.flow];
    const thinking = last.step < f.steps.length;
    const wait = thinking ? f.steps[last.step].ms : f.blocks[last.shown]?.t === "text" ? 900 : 450;
    const t = setTimeout(() => {
      let next: BotMsg;
      if (thinking) next = { ...last, step: last.step + 1 };
      else {
        const shown = last.shown + 1;
        const blk = f.blocks[last.shown];
        // the finished artifact opens beside the chat when there is room for it
        if (blk?.t === "artifact" && window.innerWidth >= 1100) setPanel(blk.kind);
        next = shown >= f.blocks.length ? { ...last, shown, live: false, tookMs: Date.now() - last.startedAt } : { ...last, shown };
      }
      setMsgs((m) => m.map((x) => (x.id === last.id ? next : x)));
    }, wait);
    return () => clearTimeout(t);
  }, [last]);

  // a follow-up typed during a run goes out when the run finishes
  useEffect(() => {
    if (!running && queue.length) { const [q, ...rest] = queue; setQueue(rest); send(q); }
  }, [running, queue, send]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

  const stop = () => setMsgs((m) => m.map((x) => (x === last && x.role === "assistant" ? { ...x, live: false, stopped: true, tookMs: Date.now() - x.startedAt } : x)));
  const fresh = () => { setMsgs([]); setPanel(null); setTitle("New chat"); setQueue([]); setDrawer(false); setTimeout(() => box.current?.focus(), 50); };
  const openRecent = (r: (typeof RECENTS)[number]) => {
    const list: Msg[] = [];
    r.flows.forEach((f) => { list.push({ id: uid(), role: "user", text: USER_LINES[f] }); list.push(doneBot(f)); });
    setMsgs(list); setTitle(r.title); setPanel(null); setDrawer(false); setQueue([]);
  };

  const empty = msgs.length === 0;

  const Sidebar = (
    <div className="h-full flex flex-col bg-surface-2">
      <div className="flex items-center justify-between px-4 h-14">
        <a href="/" className="flex items-center gap-2 font-display font-extrabold text-[17px] text-foreground"><BrandMark className="w-6 h-6" /> Vivran</a>
        <button type="button" aria-label="Collapse sidebar" onClick={() => { setSide(false); setDrawer(false); }} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card"><PanelLeft className="w-[18px] h-[18px]" /></button>
      </div>
      <nav className="px-2 space-y-0.5">
        {[
          { icon: <SquarePen className="w-4 h-4" />, label: "New chat", on: fresh },
          { icon: <Search className="w-4 h-4" />, label: "Search" },
          { icon: <Library className="w-4 h-4" />, label: "Library" },
          { icon: <FolderOpen className="w-4 h-4" />, label: "My sources" },
          { icon: <Brain className="w-4 h-4" />, label: "Teaching memory" },
        ].map((n) => (
          <button key={n.label} type="button" onClick={n.on}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-foreground/85 hover:bg-card hover:text-foreground transition-colors">
            <span className="text-muted">{n.icon}</span>{n.label}
          </button>
        ))}
      </nav>
      <div className="mt-6 px-5 text-[11px] font-semibold uppercase tracking-wider text-faint">Recent</div>
      <div className="mt-1.5 px-2 space-y-0.5 flex-1 overflow-y-auto">
        {RECENTS.map((r) => (
          <button key={r.id} type="button" onClick={() => openRecent(r)}
            className={`w-full text-left px-3 py-2 rounded-xl text-[13.5px] truncate transition-colors ${title === r.title ? "bg-card text-foreground font-medium" : "text-foreground/80 hover:bg-card"}`}>
            {r.title}
          </button>
        ))}
      </div>
      <div className="p-3 space-y-1 border-t border-border">
        <div className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-muted"><span className="w-3.5 h-3.5 rounded-full border-2 border-success" /> Free for teachers</div>
        <button type="button" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-foreground/85 hover:bg-card"><Settings className="w-4 h-4 text-muted" /> Settings</button>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <span className="w-7 h-7 rounded-full grid place-items-center bg-accent text-white text-[12px] font-bold">AR</span>
          <div className="min-w-0"><div className="text-[13.5px] font-medium text-foreground truncate">Ms. Anjali Rao</div><div className="text-[11px] text-faint">Class 9 · History</div></div>
        </div>
      </div>
    </div>
  );

  const Composer = (
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
      <div className="vv-composer rounded-[26px] border border-border bg-surface shadow-soft focus-within:border-accent-line focus-within:shadow-panel transition-all">
        <textarea ref={box} value={draft} rows={empty ? 3 : 2} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          placeholder={running ? "Send a follow-up. It's held and sent when this finishes, even if you close the tab…" : "Ask Vivran to plan, teach, assess or explain…"}
          className="w-full resize-none bg-transparent px-5 pt-4 text-[15px] text-foreground placeholder:text-faint outline-none" />
        <div className="flex items-center gap-2 px-3 pb-3">
          <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] text-muted hover:text-foreground hover:bg-card"><Paperclip className="w-4 h-4" /> <span className="hidden sm:inline">Attach</span></button>
          {source ? (
            <span className="inline-flex items-center gap-1.5 min-w-0 px-3 py-1.5 rounded-full text-[12.5px] bg-accent-soft text-foreground border border-accent-line">
              <BookOpen className="w-3.5 h-3.5 text-accent shrink-0" /><span className="truncate max-w-[150px] sm:max-w-[240px]">{SOURCE_FILE}</span>
              <button type="button" aria-label="Don't use this source" onClick={() => setSource(false)} className="text-muted hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </span>
          ) : (
            <button type="button" onClick={() => setSource(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] text-muted border border-dashed border-border hover:text-foreground"><BookOpen className="w-3.5 h-3.5" /> Use a source</button>
          )}
          <span className="flex-1" />
          <span className="hidden sm:inline text-[12px] text-faint">Grounded</span>
          {running ? (
            <button type="button" aria-label="Stop" onClick={stop} className="w-9 h-9 rounded-full grid place-items-center bg-ink text-ink-fg"><Square className="w-3.5 h-3.5 fill-current" /></button>
          ) : (
            <button type="button" aria-label="Send" disabled={!draft.trim()} onClick={() => send(draft)} className="w-9 h-9 rounded-full grid place-items-center bg-ink text-ink-fg disabled:opacity-30 transition-opacity"><ArrowUp className="w-[18px] h-[18px]" /></button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-[100dvh] flex bg-background text-foreground overflow-hidden">
        {/* sidebar: docked on desktop, a drawer on phones */}
        <aside className={`hidden md:block shrink-0 border-r border-border transition-[width] duration-300 overflow-hidden ${side ? "w-64" : "w-0 border-r-0"}`}>
          <div className="w-64 h-full">{Sidebar}</div>
        </aside>
        <AnimatePresence>
          {drawer && (
            <>
              <motion.div className="md:hidden fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
              <motion.aside className="md:hidden fixed inset-y-0 left-0 z-50 w-72 border-r border-border shadow-panel" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>{Sidebar}</motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* conversation */}
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 shrink-0 flex items-center gap-2 px-3 sm:px-5 border-b border-border/70">
            <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="md:hidden p-2 rounded-lg text-muted"><Menu className="w-5 h-5" /></button>
            {!side && <button type="button" aria-label="Open sidebar" onClick={() => setSide(true)} className="hidden md:inline-flex p-2 rounded-lg text-muted hover:text-foreground"><PanelLeft className="w-[18px] h-[18px]" /></button>}
            {!side && <button type="button" aria-label="New chat" onClick={fresh} className="hidden md:inline-flex p-2 rounded-lg text-muted hover:text-foreground"><SquarePen className="w-[18px] h-[18px]" /></button>}
            <h1 className="text-[15px] font-medium text-foreground truncate">{title}</h1>
            <span className={`hidden ${panel ? "xl:inline" : "sm:inline"} shrink-0 whitespace-nowrap text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-border text-faint`}>Beta preview · sample data</span>
            <span className="flex-1" />
            <button type="button" aria-label="Toggle theme" onClick={toggleTheme} className="p-2 rounded-lg text-muted hover:text-foreground">{theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
            <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] text-muted hover:text-foreground border border-border"><Share2 className="w-3.5 h-3.5" /> Share</button>
          </header>

          {empty ? (
            <div className="flex-1 overflow-y-auto">
              <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
                  <div className="flex items-center justify-center gap-3 mb-8">
                    <BrandMark className="w-9 h-9" />
                    <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">What are we teaching today?</h2>
                  </div>
                  {Composer}
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      { icon: <Presentation className="w-4 h-4" />, label: "Slides", text: USER_LINES.slidesPlan },
                      { icon: <FileText className="w-4 h-4" />, label: "Exam paper", text: USER_LINES.paperAsk },
                      { icon: <Lightbulb className="w-4 h-4" />, label: "Explain simply", text: USER_LINES.explain },
                    ].map((c) => (
                      <button key={c.label} type="button" onClick={() => send(c.text)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-surface text-[13.5px] text-foreground/85 hover:border-border-hi hover:text-foreground transition-colors">
                        <span className="text-accent">{c.icon}</span>{c.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-8 text-center text-[12.5px] text-faint">Vivran writes from your sources and shows where every fact came from.</p>
                </motion.div>
              </div>
            </div>
          ) : (
            <>
              <div ref={scroller} className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
                  {msgs.map((m, mi) => m.role === "user" ? (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                      <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-card border border-border px-4 py-2.5 text-[15px] text-foreground">{m.text}</div>
                    </motion.div>
                  ) : (
                    <div key={m.id}>
                      <Thinking m={m} />
                      <div className="space-y-4">
                        {FLOWS[m.flow].blocks.slice(0, m.shown).map((b, bi) => {
                          const live = m.live && bi === m.shown - 1;
                          const locked = mi < msgs.length - 1; // a choice is spent once the chat moved on
                          return (
                            <motion.div key={bi} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                              {b.t === "text" && <p className="text-[15px] leading-7 text-foreground/90"><Stream text={b.text} live={live} onCite={setCite} /></p>}
                              {b.t === "memory" && (
                                <div className="flex gap-3 rounded-2xl border border-success-line bg-success-soft px-4 py-3">
                                  <Brain className="w-[18px] h-[18px] text-success shrink-0 mt-0.5" />
                                  <div className="text-sm"><Rich text={b.text} /><div className="text-[12px] text-muted mt-0.5">{b.why}</div></div>
                                </div>
                              )}
                              {b.t === "clarify" && <Clarify b={b} locked={locked} onSubmit={(t, n) => send(t, n)} />}
                              {b.t === "outline" && <Outline b={b} locked={locked} onApprove={() => send(USER_LINES.slidesWrite, b.next)} />}
                              {b.t === "artifact" && <ArtifactCard b={b} onOpen={() => setPanel(b.kind)} />}
                              {b.t === "explain" && <Explain />}
                              {b.t === "sources" && <Sources items={b.items} focus={mi === msgs.length - 1 ? cite : null} />}
                              {b.t === "followups" && !locked && (
                                <div className="flex flex-wrap gap-2">
                                  {b.items.map((s) => (
                                    <button key={s} type="button" onClick={() => send(s)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-border text-[13px] text-muted hover:text-foreground hover:border-border-hi transition-colors">
                                      {s} <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="shrink-0 px-3 sm:px-6 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
                {Composer}
                <p className="mt-2 text-center text-[11px] text-faint">Beta preview with sample data. Vivran checks its work, and so should you.</p>
              </div>
            </>
          )}
        </main>

        {/* artifact panel: beside the chat on wide screens, over it on small ones */}
        <AnimatePresence>
          {panel && (
            <motion.section key="panel" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.25 }}
              className="fixed inset-0 z-30 lg:static lg:z-auto lg:w-[46%] lg:max-w-[720px] shrink-0 flex flex-col bg-background lg:border-l border-border">
              <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-border/70">
                <span className="text-accent">{panel === "deck" ? <Presentation className="w-4 h-4" /> : <FileText className="w-4 h-4" />}</span>
                <span className="text-[14px] font-semibold text-foreground truncate">{panel === "deck" ? "The French Revolution" : PAPER.title}</span>
                <span className="flex-1" />
                {panel === "deck" && (
                  <a href={`${DECK}.pptx`} download className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold bg-ink text-ink-fg hover:opacity-90"><Download className="w-3.5 h-3.5" /> PowerPoint</a>
                )}
                {panel === "paper" && (
                  <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold bg-ink text-ink-fg hover:opacity-90"><Download className="w-3.5 h-3.5" /> PDF</button>
                )}
                <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="p-2 rounded-full text-muted hover:text-foreground hover:bg-card"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto">{panel === "deck" ? <DeckPanel /> : <PaperPanel />}</div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
