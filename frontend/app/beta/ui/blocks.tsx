"use client";
// Everything that can appear inside an answer, and the bar of actions under it.
import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, ArrowRight, Bookmark, BookmarkCheck, Check, ChevronDown, ChevronRight, Copy, Cpu, Download, FileText,
  Loader2, Presentation, RotateCcw, Sparkles, Volume2, VolumeX, Wand2, X,
} from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";
import { enhancePrompt, type EnhancedPrompt, type ExampleResult, type LessonNotesResult } from "@/services/api";
import { ACTIONS, ACTIONS_FOR, ACTIVITY_MINUTES, IMAGE_STYLES, LEVELS, TIPS, VIDEO_SECS, VIDEO_STYLES } from "../lib/config";
import type { ActionId, Block, BotMsg, OutlineRow, RouteInfo, Source, TableData, VideoSecs } from "../lib/types";
import { Icon, Tip } from "./kit";

/** **bold** and [S1] citations, nothing else. */
export function Rich({ text, onCite }: { text: string; onCite?: (tag: string) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[S\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
        const m = p.match(/^\[(S\d+)\]$/);
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

const LANE: Record<RouteInfo["intelligence"], string> = { rules: "Rules", slm: "SLM", llm: "LLM", media: "Media" };

/** Internal: which intelligence ran each task. Shown only with "Show routing" on. */
function Routes({ routes }: { routes: RouteInfo[] }) {
  return (
    <div className="basis-full flex flex-wrap gap-1.5">
      {routes.map((r, i) => {
        const ran = r.ran_on ? `${r.ran_on.model} (${r.ran_on.provider})` : r.model ? `${r.model}${r.provider && r.provider !== "rules" ? ` (${r.provider})` : ""}` : r.pins ? "" : "no model";
        return (
          <Tip key={i} text={r.why} side="bottom">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted">
              <Cpu className="w-3 h-3" />
              <span className={`font-semibold ${r.intelligence === "llm" ? "text-accent" : r.intelligence === "slm" ? "text-success" : "text-foreground"}`}>{LANE[r.intelligence]}</span>
              <span>{r.task}</span><span className="text-faint">→ {r.pipeline}{r.input !== "text" ? ` · ${r.input} in` : ""}</span>
              {ran && <span className="text-faint">· {ran}</span>}
              {r.pins && !r.ran_on && <span className="text-faint">· {Object.entries(r.pins).map(([k, v]) => `${k}: ${v}`).join(", ")}</span>}
            </span>
          </Tip>
        );
      })}
    </div>
  );
}

export function Thinking({ m, showRoute }: { m: BotMsg; showRoute?: boolean }) {
  const steps = m.run.steps;
  const [open, setOpen] = useState(false);
  if (m.waiting) {
    return (
      <div className="mb-3 flex items-center gap-2.5 text-sm">
        <BrandMark className="w-5 h-5 animate-pulse" />
        <span className="font-medium text-foreground">{m.run.steps[0]?.label ?? "Working"}…</span>
        <span className="text-faint tabular-nums"><Elapsed from={m.startedAt} /></span>
      </div>
    );
  }
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
      {showRoute && !!m.routes?.length && <Routes routes={m.routes} />}
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="basis-full overflow-hidden ml-1.5 pl-4 border-l-2 border-border space-y-2">
            {steps.slice(0, m.step).map((s) => (
              <li key={`${s.label}-${s.detail}`} className="text-[13px]">
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

function Outline({ b, locked, onApprove }: { b: Extract<Block, { t: "outline" }>; locked: boolean; onApprove: (slides: OutlineRow[]) => void }) {
  const [slides, setSlides] = useState(b.slides);
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-card">
        <span className="text-[13px] font-semibold text-foreground">Outline · {slides.length} slides</span>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${locked ? "bg-success-soft text-success" : "bg-accent-soft text-accent"}`}>{locked ? "Approved" : "Waiting for you"}</span>
      </div>
      <ol className="divide-y divide-border">
        {slides.map((s, i) => (
          <li key={i} className="flex items-start gap-3 px-4 sm:px-5 py-2.5 group">
            <span className="w-5 pt-1.5 text-[12px] text-faint tabular-nums">{i + 1}</span>
            <span className="hidden sm:inline-flex shrink-0 mt-1 text-[10.5px] px-2 py-0.5 rounded-full border border-border text-muted capitalize">{s.move}</span>
            <div className="flex-1 min-w-0">
              <input value={s.title} disabled={locked} aria-label={`Slide ${i + 1} title`}
                onChange={(e) => setSlides(slides.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
                className="w-full bg-transparent text-sm text-foreground outline-none rounded-lg px-1.5 py-1 focus:bg-card disabled:opacity-100" />
              {s.point && <p className="px-1.5 text-[12px] text-muted leading-snug">{s.point}</p>}
            </div>
            {!locked && i > 0 && i < slides.length - 1 && (
              <button type="button" aria-label="Remove slide" onClick={() => setSlides(slides.filter((_, k) => k !== i))}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full text-faint hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            )}
          </li>
        ))}
      </ol>
      {!locked && (
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-t border-border">
          <button type="button" onClick={() => onApprove(slides)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ink-fg text-sm font-semibold hover:opacity-90">Approve and write <ArrowRight className="w-4 h-4" /></button>
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
      <div className="relative w-24 sm:w-32 aspect-video shrink-0 rounded-xl overflow-hidden border border-border bg-card grid place-items-center">
        <span className="w-10 h-10 rounded-xl grid place-items-center bg-accent-soft text-accent">{deck ? <Presentation className="w-5 h-5" /> : <FileText className="w-5 h-5" />}</span>
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
        {items.length} {items.length === 1 ? "source" : "sources"} from your material {show ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
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

function Example({ x }: { x: ExampleResult }) {
  const [show, setShow] = useState<number | null>(null);
  const an = x.analogy;
  if (!an) return null;
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-3 py-3 border-t border-border first:border-t-0 first:pt-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-faint pt-0.5">{k}</span>
      <div className="text-sm text-foreground leading-relaxed">{v}</div>
    </div>
  );
  const w = an.worked_example;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      {x.concept?.one_line && row("The idea", x.concept.one_line)}
      {row(an.setting ? `Like… ${an.setting}` : "Like…", an.story)}
      {!!an.mapping.length && row("Maps to", <div className="flex flex-wrap gap-1.5">{an.mapping.map((m) => <span key={m.term} className="text-[12px] px-2.5 py-1 rounded-full border border-border bg-card">{m.in_story} <span className="text-faint">→</span> <strong className="font-semibold">{m.term}</strong></span>)}</div>)}
      {w && row("Worked example", (
        <div>
          <div className="font-medium">{w.title}</div>
          <ol className="mt-1 space-y-0.5 text-[13px]">{w.steps.map((st) => <li key={st.name}>{st.label}: <span className="text-muted">{st.expr}</span> = <strong className="font-semibold">{st.value.toLocaleString("en-IN")}</strong></li>)}</ol>
          <div className="mt-1 text-[13px]">{w.result.label}: <strong className="font-semibold">{w.result.value.toLocaleString("en-IN")}</strong></div>
        </div>
      ))}
      {!!an.where_it_breaks.length && row("Where it breaks", <ul className="text-muted space-y-1">{an.where_it_breaks.map((t) => <li key={t}>{t}</li>)}</ul>)}
      {an.common_mistake && row("Watch for", <span className="text-muted">{an.common_mistake}</span>)}
      {!!an.check.length && row("Check", (
        <ol className="list-decimal ml-4 space-y-1">{an.check.map((c, i) => (
          <li key={c.q}>{c.q} <button type="button" onClick={() => setShow(show === i ? null : i)} className="ml-1 text-[12px] font-semibold text-accent">{show === i ? "Hide" : "Answer"}</button>
            {show === i && <div className="text-[13px] text-muted">{c.a}</div>}</li>
        ))}</ol>
      ))}
    </div>
  );
}

function Notice({ b, onRetry }: { b: Extract<Block, { t: "notice" }>; onRetry: (t: string) => void }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${b.tone === "error" ? "border-danger-line bg-danger-soft" : "border-warning-line bg-warning-soft"}`}>
      <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${b.tone === "error" ? "text-danger" : "text-warning"}`} />
      <div className="flex-1 text-foreground">{b.text}</div>
      {b.retry && <button type="button" onClick={() => onRetry(b.retry!)} className="inline-flex items-center gap-1 shrink-0 text-[12.5px] font-semibold text-foreground hover:text-accent"><RotateCcw className="w-3.5 h-3.5" /> Try again</button>}
    </div>
  );
}

/* ── what the old Teach screen made ── */

function Notes({ n }: { n: LessonNotesResult }) {
  return (
    <div className="rounded-2xl border border-border bg-surface divide-y divide-border">
      {n.sections.map((x, i) => (
        <div key={i} className="px-4 sm:px-5 py-3.5">
          <div className="text-[14px] font-semibold text-foreground">{x.heading}</div>
          <p className="mt-1 text-[14px] leading-relaxed text-foreground/85 whitespace-pre-line">{x.content}</p>
        </div>
      ))}
      {!!n.real_life_examples?.length && (
        <div className="px-4 sm:px-5 py-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Everyday examples</div>
          <ul className="mt-1.5 space-y-1 text-[14px] text-foreground/85">{n.real_life_examples.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-accent shrink-0" />{x}</li>)}</ul>
        </div>
      )}
      {n.recap && <div className="px-4 sm:px-5 py-3.5 bg-card rounded-b-2xl text-[14px]"><span className="font-semibold text-foreground">Recap: </span><span className="text-foreground/85">{n.recap}</span></div>}
    </div>
  );
}

function ShowAnswer({ answer }: { answer?: string }) {
  const [open, setOpen] = useState(false);
  if (!answer) return null;
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen(!open)} className="text-[12px] font-semibold text-accent">{open ? "Hide answer" : "Show answer"}</button>
      {open && <div className="mt-0.5 text-[13px] text-foreground/85">{answer}</div>}
    </div>
  );
}

function Activity({ b, locked, onLength }: { b: Extract<Block, { t: "activity" }>; locked: boolean; onLength: (minutes: number) => void }) {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const steps = [...b.data.blocks].sort((x, y) => x.position - y.position);
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <ol className="divide-y divide-border">
        {steps.map((x, i) => {
          const c = x.content;
          const qs = Array.isArray(c.questions) ? (c.questions as { text?: string; answer?: string }[]) : [];
          return (
            <li key={i} className="flex gap-3 px-4 sm:px-5 py-3.5">
              <span className="w-5 pt-0.5 text-[12px] text-faint tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0 text-[14px] leading-relaxed text-foreground/90">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">{x.type.replace(/_/g, " ")}</div>
                {str(c.text) && <p className="mt-1">{str(c.text)}</p>}
                {str(c.instructions) && <p className="mt-1 text-muted"><span className="font-semibold text-foreground">Task: </span>{str(c.instructions)}</p>}
                <ShowAnswer answer={str(c.answer)} />
                {qs.length > 0 && (
                  <ol className="mt-1.5 list-decimal ml-4 space-y-1.5">{qs.map((q, k) => <li key={k}>{q.text}<ShowAnswer answer={q.answer} /></li>)}</ol>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!locked && (
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-t border-border bg-card">
          <span className="text-[12px] text-muted mr-1">Length</span>
          {ACTIVITY_MINUTES.map((m) => (
            <button key={m} type="button" disabled={m === b.data.duration_minutes} onClick={() => onLength(m)}
              className={`px-3 py-1 rounded-full text-[12.5px] border transition-colors ${m === b.data.duration_minutes ? "bg-ink text-ink-fg border-transparent" : "border-border text-muted hover:text-foreground hover:border-border-hi"}`}>{m} min</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Media({ b }: { b: Extract<Block, { t: "media" }> }) {
  const name = b.kind === "audio" ? "narration" : b.kind;
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {b.kind === "audio" && <div className="p-4"><audio controls src={b.url} className="w-full" /></div>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {b.kind === "image" && <img src={b.url} alt={b.title} className="w-full max-h-[520px] object-contain bg-card" />}
      {b.kind === "video" && <video controls src={b.url} className="w-full max-h-[520px] bg-black" />}
      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border">
        <span className="flex-1 min-w-0 text-[12.5px] text-muted truncate">{b.title}</span>
        <a href={b.url} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 shrink-0 text-[12.5px] font-semibold text-foreground hover:text-accent"><Download className="w-3.5 h-3.5" /> Download {name}</a>
      </div>
    </div>
  );
}

/** Style presets, Enhance with AI (both versions one click away) and, for video, the length: the old Teach screen's controls. */
function MediaSetup({ b, locked, onMake }: { b: Extract<Block, { t: "mediaSetup" }>; locked: boolean; onMake: (prompt: string, secs: VideoSecs) => void }) {
  const [prompt, setPrompt] = useState(b.prompt);
  const [secs, setSecs] = useState<VideoSecs>(b.secs);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [enh, setEnh] = useState<{ original: string; enhanced: string; ideas: EnhancedPrompt | null } | null>(null);
  const styles = b.kind === "image" ? IMAGE_STYLES : VIDEO_STYLES;
  const style = (modifier: string) => setPrompt((p) => (p.trim() ? `${p.trim()}, ${modifier}` : modifier.replace(/^as /, "")));
  const enhance = async () => {
    const original = prompt;
    setBusy(true); setErr("");
    try {
      const r = await enhancePrompt(original, b.kind);
      if (r.error || !r.enhanced_prompt?.trim()) { setErr(r.error || "Couldn't improve that description. Try again."); return; }
      setEnh({ original, enhanced: r.enhanced_prompt, ideas: r });
      setPrompt(r.enhanced_prompt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't improve that description.");
    } finally { setBusy(false); }
  };
  const version = !enh ? null : prompt === enh.original ? "original" : prompt === enh.enhanced ? "enhanced" : "edited";
  const ideas = [...(enh?.ideas?.illustration_suggestions ?? []), ...(enh?.ideas?.animation_suggestions ?? [])];
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-card">
        <span className="text-[13px] font-semibold text-foreground">{b.kind === "image" ? "Image" : "Video"} · style and description</span>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${locked ? "bg-success-soft text-success" : "bg-accent-soft text-accent"}`}>{locked ? "Started" : "Waiting for you"}</span>
      </div>
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {styles.map((x) => (
            <button key={x.label} type="button" disabled={locked} onClick={() => style(x.modifier)}
              className="px-3 py-1 rounded-full border border-border bg-card text-[12.5px] font-medium text-muted hover:text-foreground hover:border-accent-line hover:bg-accent-soft transition-colors disabled:opacity-50">{x.label}</button>
          ))}
        </div>
        {version && !locked && (
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <span className="px-2 py-0.5 rounded-md border border-accent-line bg-accent-soft text-accent font-semibold">
              {version === "original" ? "Your original wording" : version === "enhanced" ? "The enhanced description" : "The enhanced description, with your edits"}
            </span>
            {version !== "original" && <button type="button" onClick={() => setPrompt(enh!.original)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-muted hover:text-foreground font-medium"><RotateCcw className="w-3 h-3" /> Back to mine</button>}
            {version !== "enhanced" && <button type="button" onClick={() => setPrompt(enh!.enhanced)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-muted hover:text-foreground font-medium"><Wand2 className="w-3 h-3" /> Enhanced again</button>}
          </div>
        )}
        <textarea value={prompt} disabled={locked} onChange={(e) => setPrompt(e.target.value)} rows={4} aria-label={`What the ${b.kind} should show`}
          className="w-full rounded-xl border border-border bg-card p-3 text-[13.5px] leading-relaxed text-foreground outline-none focus:border-accent-line resize-y disabled:opacity-70" />
        {ideas.length > 0 && !locked && (
          <div className="rounded-xl border border-border bg-card p-3 text-[12.5px]">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Ideas you could add</div>
            <ul className="mt-1 space-y-0.5 text-muted list-disc ml-4">{ideas.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <div className="mt-1 text-[11px] text-faint">Nothing is added for you.</div>
          </div>
        )}
        {err && <p className="text-[12.5px] text-danger">{err}</p>}
        {!locked && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={enhance} disabled={busy || !prompt.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-accent-line bg-accent-soft text-accent text-[13px] font-semibold hover:bg-accent-soft-hi disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}{busy ? "Enhancing…" : enh ? "Enhance again" : "Enhance with AI"}
            </button>
            {b.kind === "video" && (
              <select value={secs} onChange={(e) => setSecs(Number(e.target.value) as VideoSecs)} aria-label="Length"
                className="px-3 py-2 rounded-full border border-border bg-card text-[13px] text-foreground">
                {VIDEO_SECS.map((n) => <option key={n} value={n}>{n} seconds</option>)}
              </select>
            )}
            <span className="flex-1" />
            <button type="button" onClick={() => onMake(prompt.trim(), secs)} disabled={!prompt.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ink-fg text-sm font-semibold hover:opacity-90 disabled:opacity-40">
              {b.kind === "image" ? "Make the image" : "Make the video"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
        {b.kind === "video" && !locked && <p className="text-[11.5px] text-muted">A clip takes 1 to 3 minutes. You can keep chatting while it's made.</p>}
      </div>
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
  onApprove: (ref: string, slides: OutlineRow[]) => void;
  onOpen: (b: Extract<Block, { t: "artifact" }>) => void;
  onMedia: (ref: string, prompt: string, secs: VideoSecs, kind: "image" | "video") => void;
  onActivityLength: (ref: string, minutes: number) => void;
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
    case "outline": return <Outline b={b} locked={locked} onApprove={(slides) => h.onApprove(b.ref, slides)} />;
    case "artifact": return <ArtifactCard b={b} onOpen={() => h.onOpen(b)} />;
    case "example": return <Example x={b.data} />;
    case "notice": return <Notice b={b} onRetry={h.onSend} />;
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
    case "notes": return <Notes n={b.data} />;
    case "activity": return <Activity b={b} locked={locked} onLength={(m) => h.onActivityLength(b.ref, m)} />;
    case "media": return <Media b={b} />;
    case "mediaSetup": return <MediaSetup b={b} locked={locked} onMake={(p, secs) => h.onMedia(b.ref, p, secs, b.kind)} />;
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
  if (m.run.blocks.every((b) => b.t === "ask" || b.t === "notice")) return null;
  const askOnly = m.run.blocks.some((b) => b.t === "ask" || b.t === "choices" || b.t === "outline" || b.t === "mediaSetup");
  // Rewording only fits answers made of words: not decks, media, or an activity (its length chips change it instead).
  const leveled = !["slides", "activity", "narration", "image", "video"].includes(m.intent.intent);
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
      {!askOnly && !compact && leveled && (
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
