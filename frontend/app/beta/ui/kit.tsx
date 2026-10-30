"use client";
// Small shared pieces: the icon map the config refers to by name, the
// reusable tooltip, and the first-time walkthrough.
import React, { useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown, ArrowUp, BarChart3, BookOpen, Brain, Building2, Calculator, CalendarDays, Check, Columns2, FileText,
  FolderOpen, Globe, GraduationCap, Info, Lightbulb, List, Mic, Play, Plus, Presentation, Quote, Smile, Sparkles, Table2,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  slides: Presentation, paper: FileText, bulb: Lightbulb, columns: Columns2, doc: BookOpen, chart: BarChart3,
  spark: Sparkles, calendar: CalendarDays, list: List, plus: Plus, table: Table2, down: ArrowDown, up: ArrowUp,
  smile: Smile, check: Check, calc: Calculator, folder: FolderOpen, quote: Quote, brain: Brain, mic: Mic,
  globe: Globe, play: Play, grad: GraduationCap, building: Building2,
};
export function Icon({ name, className = "w-4 h-4" }: { name: string; className?: string }) {
  const I = ICONS[name] ?? Sparkles;
  return <I className={className} />;
}

/** Hover or focus shows the tip; it never blocks the click underneath. */
export function Tip({ text, children, side = "top", className = "" }: { text: string; children: React.ReactNode; side?: "top" | "bottom"; className?: string }) {
  return (
    <span className={`relative inline-flex group/tip ${className}`}>
      {children}
      <span role="tooltip"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${side === "top" ? "bottom-full mb-2" : "top-full mt-2"} z-50 w-max max-w-[240px] rounded-xl bg-ink text-ink-fg text-[12px] leading-snug px-3 py-2 shadow-panel opacity-0 translate-y-1 transition-all duration-150 delay-300 group-hover/tip:opacity-100 group-hover/tip:translate-y-0 group-has-[:focus-visible]/tip:opacity-100 group-has-[:focus-visible]/tip:translate-y-0`}>
        {text}
      </span>
    </span>
  );
}

/** An (i) that explains in place; tap on touch screens, hover elsewhere. */
export function InfoTip({ text, href }: { text: string; href?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="What is this?" onClick={() => setOpen(!open)} className="p-0.5 rounded-full text-faint hover:text-foreground"><Info className="w-3.5 h-3.5" /></button>
      <AnimatePresence>
        {open && (
          <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-full right-0 mb-2 z-50 w-64 rounded-2xl border border-border bg-surface shadow-panel p-3 text-[12.5px] leading-snug text-foreground">
            {text}
            {href && <a href={href} target="_blank" rel="noopener" className="block mt-1.5 text-accent font-semibold hover:underline">Learn more →</a>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** A spotlight over each [data-tour] element in turn. Steps whose target isn't on screen are skipped. */
export function Walkthrough({ steps, onDone }: { steps: { target: string; title: string; body: string }[]; onDone: () => void }) {
  const visible = steps.filter((s) => {
    const el = document.querySelector(`[data-tour="${s.target}"]`) as HTMLElement | null;
    return !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  });
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const s = visible[i];
  const next = () => (i < visible.length - 1 ? setI(i + 1) : onDone());
  useLayoutEffect(() => {
    if (!s) return;
    const el = document.querySelector(`[data-tour="${s.target}"]`) as HTMLElement | null;
    const place = () => setRect(el?.getBoundingClientRect() ?? null);
    el?.scrollIntoView({ block: "nearest" }); place();
    window.addEventListener("resize", place); return () => window.removeEventListener("resize", place);
  }, [s]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  if (!s || !rect) return null;
  const pad = 8;
  const below = rect.top < window.innerHeight / 2;
  const cardW = Math.min(320, window.innerWidth - 32);
  const left = Math.max(16, Math.min(rect.left + rect.width / 2 - cardW / 2, window.innerWidth - cardW - 16));
  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="Quick tour">
      <motion.div className="absolute rounded-2xl pointer-events-none" layout transition={{ type: "spring", damping: 30, stiffness: 300 }}
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(10,8,6,.58), 0 0 0 2px var(--accent-1)" }} />
      <motion.div key={i} initial={{ opacity: 0, y: below ? -6 : 6 }} animate={{ opacity: 1, y: 0 }}
        className="absolute rounded-2xl bg-surface border border-border shadow-panel p-4" style={{ width: cardW, left, ...(below ? { top: rect.bottom + pad + 12 } : { bottom: window.innerHeight - rect.top + pad + 12 }) }}>
        <div className="text-[11px] font-semibold text-accent">{i + 1} of {visible.length}</div>
        <div className="mt-1 font-semibold text-foreground">{s.title}</div>
        <p className="mt-1 text-[13.5px] text-muted leading-snug">{s.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onDone} className="text-[13px] text-muted hover:text-foreground">Skip</button>
          <span className="flex-1" />
          {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="px-3 py-1.5 rounded-full text-[13px] border border-border text-foreground">Back</button>}
          <button type="button" onClick={next} className="px-4 py-1.5 rounded-full text-[13px] font-semibold bg-ink text-ink-fg">{i < visible.length - 1 ? "Next" : "Done"}</button>
        </div>
      </motion.div>
    </div>
  );
}
