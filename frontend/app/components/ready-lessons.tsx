"use client";

// Ready-made lessons: the five showcase decks (tools/showcase), inside the product.
// A teacher can flip through one, download it as an editable PowerPoint, or ask
// Vivran to make the same kind of lesson for their own class and material.
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Sparkles, X } from "lucide-react";

export interface ReadyDeck { id: string; title: string; level: string; subject: string; template: string; slides: number; credits: { author: string; license: string; source: string }[] }
const BASE = "/landing/decks/";
const img = (d: ReadyDeck, n: number, thumb = false) => `${BASE}${d.id}/${thumb ? "t" : ""}${String(n).padStart(2, "0")}.jpg`;

export function ReadyLessons({ onMake }: { onMake: (d: ReadyDeck) => void }) {
  const [decks, setDecks] = useState<ReadyDeck[]>([]);
  const [open, setOpen] = useState<ReadyDeck | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => { fetch(BASE + "decks.json").then((r) => r.json()).then(setDecks).catch(() => setDecks([])); }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setI((v) => Math.min(open.slides - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  if (!decks.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold font-display text-foreground">Ready-made lessons</h2>
          <p className="text-xs text-muted mt-0.5">Designed decks with real photos and speaker notes. Teach one as it is, or have Vivran make one like it for your class.</p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {decks.map((d) => (
          <button key={d.id} type="button" onClick={() => { setOpen(d); setI(0); }}
            className="snap-start shrink-0 w-56 text-left rounded-xl border border-border bg-surface hover:border-accent-line hover:shadow-sm transition-all overflow-hidden group">
            <img src={img(d, 1, true)} alt="" className="w-full aspect-video object-cover group-hover:scale-[1.02] transition-transform" loading="lazy" />
            <div className="p-3">
              <div className="text-sm font-semibold text-foreground truncate">{d.title}</div>
              <div className="text-[11px] text-muted mt-0.5">{d.level} · {d.subject} · {d.slides} slides</div>
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 sm:p-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div role="dialog" aria-label={open.title} className="w-full max-w-5xl rounded-2xl bg-surface border border-border overflow-hidden" initial={{ y: 16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <div className="min-w-0"><div className="font-bold font-display text-foreground truncate">{open.title}</div><div className="text-[11px] text-muted">{open.level} · {open.subject} · {open.template}</div></div>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="p-1.5 rounded-lg text-muted hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <div className="relative bg-black aspect-video">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.img key={i} src={img(open, i + 1)} alt={`${open.title}, slide ${i + 1}`} className="absolute inset-0 w-full h-full object-contain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
                </AnimatePresence>
                <button type="button" aria-label="Previous slide" disabled={i === 0} onClick={() => setI(i - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 text-black disabled:opacity-0"><ChevronLeft className="w-5 h-5" /></button>
                <button type="button" aria-label="Next slide" disabled={i === open.slides - 1} onClick={() => setI(i + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 text-black disabled:opacity-0"><ChevronRight className="w-5 h-5" /></button>
                <span className="absolute right-3 bottom-3 text-[11px] text-white bg-black/50 px-2 py-0.5 rounded-full">{i + 1} / {open.slides}</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto px-4 py-3 border-b border-border">
                {Array.from({ length: open.slides }, (_, n) => (
                  <button key={n} type="button" onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} className={`shrink-0 w-24 rounded-md border-2 overflow-hidden ${n === i ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"}`}>
                    <img src={img(open, n + 1, true)} alt="" className="w-full aspect-video object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="text-[11px] text-muted max-w-md">Photos: {open.credits.map((c) => `${c.author} (${c.license})`).join(", ")}. Wikimedia Commons.</div>
                <div className="flex gap-2">
                  <a href={`${BASE}${open.id}.pptx`} download className="px-4 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-foreground inline-flex items-center gap-1.5 hover:border-accent-line"><Download className="w-3.5 h-3.5" /> Download PowerPoint</a>
                  <button type="button" onClick={() => { onMake(open); setOpen(null); }} className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Make one for my class</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
