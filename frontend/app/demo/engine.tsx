"use client";

// The tour engine: roles → scenes → steps. Each scene says how long each of its
// steps lasts; the engine advances them, moves to the next scene, and stops at
// the end of a role with a hand-off to the next one. Any click, tap, key or
// scroll inside the stage hands control to the visitor (autoplay pauses).
// With reduced motion, nothing auto-advances and every scene shows its final state.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";

export interface Scene {
  id: string;
  title: string;
  /** One sentence: what the visitor is watching. */
  caption: string;
  /** Fake address shown in the browser bar. */
  url: string;
  /** Milliseconds each step holds before the next. */
  steps: number[];
  render: (step: number) => React.ReactNode;
}

export interface Role {
  id: "teacher" | "student" | "institution";
  label: string;
  icon: React.ReactNode;
  preview?: boolean;
  tagline: string;
  nav: { label: string; icon: React.ReactNode }[];
  scenes: Scene[];
}

/** Text that types itself while `on`, or appears whole when motion is reduced. */
export function Typed({ text, on, ms = 1400, className }: { text: string; on: boolean; ms?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(on ? 0 : text.length);
  useEffect(() => {
    if (!on || reduce) { setN(text.length); return; }
    setN(0);
    const per = Math.max(12, ms / text.length);
    const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 1)), per);
    return () => clearInterval(id);
  }, [on, text, ms, reduce]);
  return (
    <span className={className}>
      {text.slice(0, n)}
      {on && n < text.length && <span className="inline-block w-[1px] h-[1em] align-[-2px] bg-foreground ml-px animate-pulse" />}
    </span>
  );
}

export function TourShell({ roles, embed }: { roles: Role[]; embed: boolean }) {
  // Only known in the browser; applying it after mount keeps the server and client render identical.
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted && !!prefersReduced;
  const [ri, setRi] = useState(0);
  const [si, setSi] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const role = roles[ri];
  const scene = role.scenes[si];
  const last = scene.steps.length - 1;
  const shownStep = reduce ? last : step;

  // autoplay
  useEffect(() => {
    if (!playing || reduce) return;
    const hold = scene.steps[step] ?? 1500;
    const t = setTimeout(() => {
      if (step < last) setStep(step + 1);
      else if (si < role.scenes.length - 1) { setSi(si + 1); setStep(0); }
      else setPlaying(false); // end of this role: offer the next one
    }, hold);
    return () => clearTimeout(t);
  }, [playing, reduce, step, last, si, role.scenes.length, scene.steps]);

  const goScene = useCallback((i: number) => { setSi(i); setStep(0); }, []);
  const goRole = useCallback((i: number) => { setRi(i); setSi(0); setStep(0); setPlaying(true); }, []);
  const takeOver = () => setPlaying(false);

  // embedded in the landing page: tell the parent how tall we are
  useEffect(() => {
    if (!embed || !rootRef.current) return;
    const el = rootRef.current;
    const post = () => window.parent?.postMessage({ type: "vivran-tour-height", height: el.scrollHeight }, "*");
    const ro = new ResizeObserver(post); ro.observe(el); post();
    return () => ro.disconnect();
  }, [embed]);

  const atEnd = !playing && si === role.scenes.length - 1 && (reduce || step === last);

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} className={embed ? "px-3 sm:px-6 pt-1 pb-10" : "max-w-6xl mx-auto px-4 py-8 sm:py-12"}>
        {/* Role switch, with the thread that links them */}
        <div className="flex justify-center">
          <div role="tablist" aria-label="Who is using Vivran" className="relative inline-flex p-1 rounded-full bg-card border border-border">
            {roles.map((r, i) => (
              <button key={r.id} role="tab" aria-selected={i === ri} type="button" onClick={() => goRole(i)}
                className={`relative z-10 flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-colors ${i === ri ? "text-foreground" : "text-muted hover:text-foreground"}`}>
                {i === ri && <motion.span layoutId="tour-role" className="absolute inset-0 -z-10 rounded-full bg-surface shadow-sm border border-border" transition={{ type: "spring", damping: 30, stiffness: 380 }} />}
                <span className={i === ri ? "text-accent" : ""}>{r.icon}</span>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-center text-sm text-muted mt-3 max-w-xl mx-auto">{role.tagline}</p>

        {/* The app window */}
        <div className="mt-6 rounded-[28px] border border-border bg-surface overflow-hidden shadow-[0_1px_2px_rgba(40,28,16,0.05),0_28px_60px_-28px_rgba(40,28,16,0.30)]"
          onPointerDown={takeOver} onKeyDown={takeOver}>
          <div className="flex items-center gap-3 px-5 h-12 border-b border-border bg-card">
            <span className="flex gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#ED6A5E]" /><i className="w-2.5 h-2.5 rounded-full bg-[#F5BF4F]" /><i className="w-2.5 h-2.5 rounded-full bg-[#61C554]" /></span>
            <span className="flex-1 min-w-0 flex justify-center">
              <span className="max-w-full truncate px-4 py-1 rounded-full bg-surface border border-border text-[11px] text-muted font-mono">{scene.url}</span>
            </span>
            <span className="hidden sm:inline text-[10px] text-faint px-2 py-0.5 rounded-full border border-border">Sample data</span>
          </div>
          <div className="flex min-h-[340px] sm:min-h-[470px]">
            <aside className="hidden md:flex w-52 shrink-0 flex-col gap-1 p-3 border-r border-border bg-surface-2">
              <div className="flex items-center gap-2 px-2 py-2 mb-2 text-sm font-extrabold font-display text-foreground"><BrandMark className="w-5 h-5" /> Vivran</div>
              {role.nav.map((n, i) => (
                <div key={n.label} className={`flex items-center gap-2.5 px-3 py-2 rounded-full text-xs transition-colors ${i === si ? "bg-accent-soft text-foreground font-semibold border border-accent-line" : "text-muted border border-transparent"}`}>
                  {n.icon} {n.label}
                </div>
              ))}
              {role.preview && <div className="mt-auto text-[10px] leading-snug text-muted p-3 rounded-2xl border border-dashed border-border">Coming next. This is a preview with sample data.</div>}
            </aside>
            <div className="flex-1 min-w-0 p-4 sm:p-6 relative">
              <AnimatePresence mode="wait">
                <motion.div key={`${role.id}-${scene.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                  {scene.render(shownStep)}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Scene rail and controls */}
        <div className="mt-4 flex items-center gap-3 sm:gap-4 rounded-full border border-border bg-card/80 p-1.5 pr-4 sm:pr-5">
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous" disabled={si === 0} onClick={() => { takeOver(); goScene(si - 1); }} className="p-2 rounded-full border border-border text-muted hover:text-foreground disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            {!reduce && (
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => { if (!playing && atEnd) goScene(0); setPlaying(!playing); }} className="p-2 rounded-full bg-foreground text-background hover:opacity-85">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            )}
            <button type="button" aria-label="Next" disabled={si === role.scenes.length - 1} onClick={() => { takeOver(); goScene(si + 1); }} className="p-2 rounded-full border border-border text-muted hover:text-foreground disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${role.scenes.length}, minmax(0, 1fr))` }}>
            {role.scenes.map((s, i) => (
              <button key={s.id} type="button" onClick={() => { takeOver(); goScene(i); }} className="text-left group">
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <motion.div className="h-full bg-accent" initial={false}
                    animate={{ width: i < si ? "100%" : i > si ? "0%" : `${((shownStep + 1) / s.steps.length) * 100}%` }} transition={{ duration: 0.4 }} />
                </div>
                <div className={`hidden sm:block mt-1.5 text-[11px] truncate ${i === si ? "text-foreground font-semibold" : "text-muted group-hover:text-foreground"}`}>{s.title}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 px-2 flex items-start justify-between gap-4">
          <p className="text-[13px] leading-relaxed text-muted max-w-2xl"><span className="sm:hidden font-semibold text-foreground">{scene.title}. </span>{scene.caption}</p>
          {atEnd && ri < roles.length - 1 && (
            <button type="button" onClick={() => goRole(ri + 1)} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
              {roles[ri + 1].label} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
