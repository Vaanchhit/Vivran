"use client";
// Everything that can appear inside an answer, and the bar of actions under it.
import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Bookmark, BookmarkCheck, Check, ChevronDown, ChevronRight, Copy, FileText,
  Presentation, Sparkles, Volume2, VolumeX, X,
} from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";
import { ACTIONS, ACTIONS_FOR, LEVELS, TIPS } from "../lib/config";
import { EXPLANATIONS } from "../lib/content";
import type { ActionId, Block, BotMsg, Source, TableData } from "../lib/types";
import { Icon, Tip } from "./kit";

/** **bold** and [S1] citations, nothing else. */
export function Rich({ text, onCite }: { text: string; onCite?: (tag: string) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[S\d\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
        const m = p.match(/^\[(S\d)\]$/);
        if (m) return (
          <button key={i} type="button" onClick={() => onCite?.(m[1])} aria-label={`Source ${m[1]}`}
            className="inline-flex items-center align-[1px] mx-0.5 px-1.5 h-[18px] rounded-full text-[10px] font-semibold bg-accent-soft text-accent border border-accent-line hover:bg-accent-soft-hi">{m[1]}</button>
        );
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

export function Stream({ text, live, onCite }: { text: string; live: boolean; onCite?: (t: string) => void }) {
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

export function Thinking({ m }: { m: BotMsg }) {
  const steps = m.run.steps;
  const [open, setOpen] = useState(false);
  if (m.live && m.step < steps.length) {
    const cur = steps[m.step];
    return (
      <div className="mb-3">
        <div className="flex items-center gap-2.5 text-sm">
          <BrandMark className="w-5 h-5 animate-pulse" />
          <span className="font-medium text-foreground">{cur.label}…</span>
          <span className="text-faint tabular-nums"><Elapsed from={m.startedAt} /></span>
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={m.step} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-2 ml-2.5 pl-4 border-l-2 border-border text-[13px] italic text-muted leading-relaxed">{cur.detail}</motion.p>
        </AnimatePresence>
      </div>
    );
  }
  const secs = Math.max(1, Math.round((m.tookMs ?? 0) / 1000));
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Tip text={TIPS.thinking} side="bottom">
        <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-accent" />{m.stopped ? "Stopped" : `Worked for ${secs}s`}
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </Tip>
      <Tip text={TIPS.intent} side="bottom">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-border text-muted">{m.intent.label}</span>
      </Tip>
      {m.derived && <span className="text-[11.5px] text-faint italic">{m.derived}</span>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="basis-full overflow-hidden ml-1.5 pl-4 border-l-2 border-border space-y-2">
            {steps.slice(0, m.step).map((s) => (
              <li key={s.label} className="text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><Check className="w-3.5 h-3.5 text-success" />{s.label}</span>
                <p className="text-muted italic mt-0.5">{s.detail}</p>
              </li>
            ))}
            <li className="text-[12px] text-faint">Understood as {m.intent.label.toLowerCase()} · {Math.round(m.intent.confidence * 100)}% sure</li>
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

function Choices({ b, locked, onSubmit }: { b: Extract<Block, { t: "choices" }>; locked: boolean; onSubmit: (text: string) => void }) {
  const [pick, setPick] = useState<Record<number, string>>(() => Object.fromEntries(b.questions.map((q, i) => [i, q.options[Math.min(1, q.options.length - 1)]])));
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4">
      {b.questions.map((q, i) => (
        <div key={q.q}>
          <div className="text-sm font-semibold text-foreground">{i + 1}. {q.q}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {q.options.map((o) => (
              <button key={o} type="button" disabled={locked} onClick={() => setPick({ ...pick, [i]: o })}
                className={`px-3.5 py-1.5 rounded-full text-[13px] border transition-colors ${pick[i] === o ? "bg-ink text-ink-fg border-transparent" : "border-border text-muted hover:text-foreground hover:border-border-hi"} disabled:opacity-60`}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      {!locked && (
        <button type="button" onClick={() => onSubmit(Object.values(pick).join(" · "))} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ink-fg text-sm font-semibold hover:opacity-90">
          {b.submit} <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function Ask({ b, locked, onAnswer }: { b: Extract<Block, { t: "ask" }>; locked: boolean; onAnswer: (a: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="rounded-2xl border border-accent-line bg-accent-soft/50 p-4 sm:p-5">
      <div className="text-[15px] font-semibold text-foreground">{b.question}</div>
      {!locked ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {b.options.map((o) => (
              <button key={o} type="button" onClick={() => onAnswer(o)} className="px-3.5 py-1.5 rounded-full text-[13px] border border-border bg-surface text-foreground hover:border-accent-line transition-colors">{o}</button>
            ))}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onAnswer(v); }}>
            <input value={v} onChange={(e) => setV(e.target.value)} placeholder={b.placeholder}
              className="flex-1 min-w-0 rounded-full border border-border bg-surface px-4 py-2 text-[13.5px] text-foreground placeholder:text-faint outline-none focus:border-accent-line" />
            <button type="submit" disabled={!v.trim()} className="px-4 py-2 rounded-full bg-ink text-ink-fg text-[13px] font-semibold disabled:opacity-30">Go</button>
          </form>
          <p className="mt-2 text-[11.5px] text-muted">Your request is on hold and picks up from here.</p>
        </>
      ) : <p className="mt-1 text-[12px] text-muted">Answered below.</p>}
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
          <button type="button" onClick={onApprove} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ink-fg text-sm font-semibold hover:opacity-90">Approve and write <ArrowRight className="w-4 h-4" /></button>
          <span className="text-[12px] text-muted">Nothing is written until you approve.</span>
        </div>
      )}
    </div>
  );
}

function ArtifactCard({ b, onOpen }: { b: Extract<Block, { t: "artifact" }>; onOpen: () => void }) {
  const deck = b.kind === "deck";
  return (
    <button type="button" onClick={onOpen} className="group w-full text-left flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 pr-5 hover:border-border-hi hover:shadow-soft transition-all">
      <div className="relative w-28 sm:w-36 aspect-video shrink-0 rounded-xl overflow-hidden border border-border bg-card">
        {deck ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/landing/decks/${b.deck}/t01.jpg`} alt="" className="w-full h-full object-cover" />
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
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-muted"><span className="px-1.5 rounded-full bg-accent-soft text-accent">{s.tag}</span><span className="truncate">{s.file}</span><span className="shrink-0">· {s.where}</span></div>
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

function Explain({ topic }: { topic: string }) {
  const x = EXPLANATIONS[topic];
  if (!x) return null;
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-1 sm:gap-3 py-3 border-t border-border first:border-t-0 first:pt-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-faint pt-0.5">{k}</span>
      <div className="text-sm text-foreground leading-relaxed">{v}</div>
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      {row("The idea", x.idea)}
      {row("Like…", x.like)}
      {row("Maps to", <div className="flex flex-wrap gap-1.5">{x.maps.map(([a, b]) => <span key={a} className="text-[12px] px-2.5 py-1 rounded-full border border-border bg-card">{a} <span className="text-faint">→</span> <strong className="font-semibold">{b}</strong></span>)}</div>)}
      {row("Where it breaks", <span className="text-muted">{x.breaks}</span>)}
      {row("Check", <ol className="list-decimal ml-4 space-y-1">{x.check.map((c) => <li key={c}>{c}</li>)}</ol>)}
    </div>
  );
}

export function Table({ data }: { data: TableData }) {
  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead className="bg-card"><tr>{data.columns.map((c, i) => <th key={i} className="text-left font-semibold text-foreground px-4 py-2.5 whitespace-nowrap">{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-border bg-surface">{data.rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} className={`px-4 py-2.5 align-top ${k === 0 ? "font-medium text-foreground" : "text-foreground/85"}`}><Rich text={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
      {data.caption && <div className="px-4 py-2 text-[11.5px] text-muted border-t border-border bg-card">{data.caption}</div>}
    </div>
  );
}

export interface BlockHandlers {
  onCite: (t: string) => void;
  onSend: (text: string) => void;
  onChoices: (text: string, resume: string) => void;
  onAnswer: (answer: string) => void;
  onApprove: (deck: string) => void;
  onOpen: (b: Extract<Block, { t: "artifact" }>) => void;
}

export function BlockView({ b, live, locked, focus, h }: { b: Block; live: boolean; locked: boolean; focus: string | null; h: BlockHandlers }) {
  switch (b.t) {
    case "text": return <p className="text-[15px] leading-7 text-foreground/90"><Stream text={b.text} live={live} onCite={h.onCite} /></p>;
    case "memory": return (
      <div className="flex gap-3 rounded-2xl border border-success-line bg-success-soft px-4 py-3">
        <Icon name="brain" className="w-[18px] h-[18px] text-success shrink-0 mt-0.5" />
        <div className="text-sm"><Rich text={b.text} /><div className="text-[12px] text-muted mt-0.5">{b.why}</div></div>
      </div>
    );
    case "choices": return <Choices b={b} locked={locked} onSubmit={(t) => h.onChoices(t, b.resume)} />;
    case "ask": return <Ask b={b} locked={locked} onAnswer={h.onAnswer} />;
    case "outline": return <Outline b={b} locked={locked} onApprove={() => h.onApprove(b.deck)} />;
    case "artifact": return <ArtifactCard b={b} onOpen={() => h.onOpen(b)} />;
    case "explain": return <Explain topic={b.topic} />;
    case "bullets": return (
      <div>
        {b.title && <div className="text-[13px] font-semibold text-foreground mb-2">{b.title}</div>}
        <ul className="space-y-2">{b.items.map((x, i) => (
          <motion.li key={i} initial={live ? { opacity: 0, x: -4 } : false} animate={{ opacity: 1, x: 0 }} transition={{ delay: live ? i * 0.08 : 0 }} className="flex gap-3 text-[15px] leading-7 text-foreground/90">
            <span className="mt-[11px] w-1.5 h-1.5 rounded-full bg-accent shrink-0" /><span><Rich text={x} onCite={h.onCite} /></span>
          </motion.li>
        ))}</ul>
      </div>
    );
    case "table": return <Table data={b.data} />;
    case "sources": return <Sources items={b.items} focus={focus} />;
    case "followups": return locked ? null : (
      <div className="flex flex-wrap gap-2">{b.items.map((s) => (
        <button key={s} type="button" onClick={() => h.onSend(s)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-border text-[13px] text-muted hover:text-foreground hover:border-border-hi transition-colors">{s} <ArrowRight className="w-3.5 h-3.5" /></button>
      ))}</div>
    );
  }
}

/** Under every finished answer: read aloud, copy, save; and on the latest one, simplify / elaborate and quick actions. */
export function ActionBar({ m, saved, speaking, compact, onAction, onSpeak, onCopy, onSave }: {
  m: BotMsg; saved: boolean; speaking: boolean; compact: boolean;
  onAction: (a: ActionId) => void; onSpeak: () => void; onCopy: () => void; onSave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (m.run.blocks.every((b) => b.t === "ask")) return null;
  const askOnly = m.run.blocks.some((b) => b.t === "ask" || b.t === "choices" || b.t === "outline");
  const actions = askOnly || compact ? [] : ACTIONS_FOR[m.intent.intent].filter((a) => a !== "simplify" && a !== "elaborate");
  const lv = LEVELS[m.intent.intent];
  const icon = "inline-flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-foreground hover:bg-card transition-colors";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 shrink-0 -ml-1.5 mr-1">
        <Tip text={speaking ? "Stop reading" : TIPS.speak}><button type="button" aria-label={speaking ? "Stop reading" : "Read aloud"} onClick={onSpeak} className={`${icon} ${speaking ? "text-accent" : ""}`}>{speaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button></Tip>
        <Tip text={copied ? "Copied" : TIPS.copy}><button type="button" aria-label="Copy" onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1400); }} className={icon}>{copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</button></Tip>
        <Tip text={saved ? "Saved. Click to remove." : TIPS.save}><button type="button" aria-label={saved ? "Remove from saved" : "Save"} onClick={onSave} className={`${icon} ${saved ? "text-accent" : ""}`}>{saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}</button></Tip>
      </span>
      {!askOnly && !compact && (
        <div className="inline-flex rounded-full border border-border p-0.5">
          <Tip text="Easier words, shorter sentences"><button type="button" onClick={() => onAction("simplify")} className="px-3 py-1 rounded-full text-[12.5px] text-foreground/85 hover:bg-card">{lv?.simplify ?? "Simplify"}</button></Tip>
          <Tip text="More detail, for stronger students"><button type="button" onClick={() => onAction("elaborate")} className="px-3 py-1 rounded-full text-[12.5px] text-foreground/85 hover:bg-card">{lv?.elaborate ?? "Elaborate"}</button></Tip>
        </div>
      )}
      {actions.map((a) => (
        <Tip key={a} text={ACTIONS[a].tip}>
          <button type="button" onClick={() => onAction(a)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[12.5px] text-muted hover:text-foreground hover:border-border-hi transition-colors">
            <Icon name={ACTIONS[a].icon} className="w-3.5 h-3.5" />{ACTIONS[a].label}
          </button>
        </Tip>
      ))}
    </div>
  );
}
