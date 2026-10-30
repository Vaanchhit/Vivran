"use client";
// Larger surfaces: the artifact viewers, the feature catalogue, saved responses
// and the save dialog.
import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, Search, Trash2, X } from "lucide-react";
import { BUILT_IN, COMING, TOOLS, type FeatureStatus } from "../lib/config";
import { DECKS, PAPER } from "../lib/content";
import type { Saved } from "../lib/types";
import { Icon } from "./kit";

const pad = (n: number) => String(n).padStart(2, "0");

export function DeckPanel({ deckId }: { deckId: string }) {
  const d = DECKS.find((x) => x.id === deckId) ?? DECKS[0];
  const n = d.slides.length;
  const [i, setI] = useState(1);
  useEffect(() => setI(1), [deckId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowRight") setI((v) => Math.min(n, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(1, v - 1));
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [n]);
  const base = `/landing/decks/${d.id}`;
  return (
    <div className="p-4 sm:p-5">
      <div className="relative rounded-2xl overflow-hidden border border-border shadow-soft bg-card aspect-video">
        <AnimatePresence mode="wait">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img key={`${d.id}-${i}`} src={`${base}/${pad(i)}.jpg`} alt={d.slides[i - 1].title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 w-full h-full object-cover" />
        </AnimatePresence>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[11px] text-faint">Slide {i} of {n} · {d.slides[i - 1].move}</div>
          <div className="text-sm font-semibold text-foreground truncate">{d.slides[i - 1].title}</div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button type="button" aria-label="Previous slide" disabled={i === 1} onClick={() => setI(i - 1)} className="p-2 rounded-full border border-border text-muted hover:text-foreground disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
          <button type="button" aria-label="Next slide" disabled={i === n} onClick={() => setI(i + 1)} className="p-2 rounded-full border border-border text-muted hover:text-foreground disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {d.slides.map((s, k) => (
          <button key={k} type="button" onClick={() => setI(k + 1)} aria-label={`Slide ${k + 1}`} className={`rounded-xl overflow-hidden border-2 transition-colors ${i === k + 1 ? "border-accent" : "border-transparent hover:border-border-hi"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/t${pad(k + 1)}.jpg`} alt="" className="w-full aspect-video object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PaperPanel() {
  const [cites, setCites] = useState(false);
  let q = 0;
  return (
    <div className="p-4 sm:p-5">
      <div className="flex justify-end mb-3">
        <label className="inline-flex items-center gap-2 text-[12.5px] text-muted cursor-pointer">
          <input type="checkbox" checked={cites} onChange={(e) => setCites(e.target.checked)} className="accent-[var(--accent-1)]" /> Show where each question comes from
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
            <div className="flex items-baseline justify-between text-[13px] font-bold uppercase tracking-wide"><span>{s.name}</span><span className="text-black/50 font-semibold normal-case">{s.rule}</span></div>
            <ol className="mt-2 space-y-2">
              {s.qs.map((x) => {
                q += 1;
                return (
                  <li key={q} className={`text-[13.5px] leading-relaxed flex gap-2 ${!x.cite ? "rounded-lg bg-amber-100/70 -mx-2 px-2 py-1.5" : ""}`}>
                    <span className="w-6 shrink-0 text-black/50">{q}.</span>
                    <span className="flex-1">
                      {x.q}
                      {cites && x.cite && <span className="ml-2 font-sans text-[10px] font-semibold text-[#B3341A] border border-[#B3341A]/30 rounded-full px-1.5 py-px whitespace-nowrap">Unit 4 · {x.cite}</span>}
                      {!x.cite && <span className="mt-1 flex items-center gap-1.5 font-sans text-[11.5px] text-amber-800"><AlertTriangle className="w-3.5 h-3.5" /> Not found in your material. Review or replace.</span>}
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

const STATUS: Record<FeatureStatus, string> = {
  "Live": "bg-success-soft text-success",
  "In beta": "bg-accent-soft text-accent",
  "Coming next": "bg-card text-muted border border-border",
};

export function FeaturesView({ onTry, onClose }: { onTry: (prompt: string) => void; onClose: () => void }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">What Vivran can do</h2>
      <p className="mt-1 text-sm text-muted">{TOOLS.length} tools, each with what it needs from you and what you get back.</p>

      <div className="mt-6 rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
        {TOOLS.map((t, i) => (
          <motion.div key={t.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
            className="grid md:grid-cols-[11rem_minmax(0,1fr)_auto] gap-x-6 gap-y-2.5 p-4 sm:px-5 items-start">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 shrink-0 rounded-lg grid place-items-center bg-accent-soft text-accent"><Icon name={t.icon} className="w-4 h-4" /></span>
              <div className="min-w-0">
                <div className="font-semibold text-[14.5px] text-foreground leading-tight">{t.name}</div>
                {t.status !== "Live" && <span className={`mt-1 inline-block text-[10.5px] font-semibold px-1.5 py-px rounded-full ${STATUS[t.status]}`}>{t.status}</span>}
              </div>
            </div>
            <div className="min-w-0 text-[13px]">
              <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-y-1">
                <dt className="text-faint">You give</dt><dd className="text-muted">{t.give}</dd>
                <dt className="text-faint">You get</dt><dd className="text-foreground">{t.get}</dd>
              </dl>
              {t.includes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.includes.map((x) => <span key={x} className="rounded-full bg-card border border-border px-2 py-0.5 text-[11.5px] text-muted">{x}</span>)}
                </div>
              )}
            </div>
            <button type="button" onClick={() => { onTry(t.try); onClose(); }}
              className="justify-self-start md:mt-0.5 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:border-border-hi hover:text-accent transition-colors">
              Try it <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </div>

      <h3 className="mt-9 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Built into every tool</h3>
      <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {BUILT_IN.map((f) => (
          <div key={f.name} className="flex gap-2.5">
            <Icon name={f.icon} className="mt-0.5 w-4 h-4 shrink-0 text-accent" />
            <div className="text-[13px] leading-snug">
              <span className="font-semibold text-foreground">{f.name}</span>
              {f.beta && <span className={`ml-1.5 text-[10.5px] font-semibold px-1.5 py-px rounded-full ${STATUS["In beta"]}`}>In beta</span>}
              <span className="text-muted"> &mdash; {f.desc}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-9 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border pt-5 text-[13px]">
        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${STATUS["Coming next"]}`}>Coming next</span>
        {COMING.map((c, i) => <span key={c} className="text-muted">{c}{i < COMING.length - 1 && <span className="text-faint"> &middot;</span>}</span>)}
      </div>
    </div>
  );
}

export function SavedView({ items, collections, onOpen, onRemove, onUpdate }: {
  items: Saved[]; collections: string[];
  onOpen: (s: Saved) => void; onRemove: (s: Saved) => void; onUpdate: (s: Saved, patch: Partial<Pick<Saved, "note" | "collection">>) => void;
}) {
  const [col, setCol] = useState("All");
  const [q, setQ] = useState("");
  const all = useMemo(() => Array.from(new Set([...collections, ...items.map((s) => s.collection)])), [collections, items]);
  const shown = items.filter((s) => (col === "All" || s.collection === col) && (!q || `${s.title} ${s.excerpt} ${s.note}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Saved responses</h2>
      <p className="mt-1 text-sm text-muted">Answers you bookmarked, grouped into collections.</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {["All", ...all].map((c) => (
          <button key={c} type="button" onClick={() => setCol(c)} className={`px-3 py-1.5 rounded-full text-[12.5px] border transition-colors ${col === c ? "bg-ink text-ink-fg border-transparent" : "border-border text-muted hover:text-foreground"}`}>
            {c} <span className="opacity-60">{c === "All" ? items.length : items.filter((s) => s.collection === c).length}</span>
          </button>
        ))}
        <span className="flex-1" />
        <label className="vv-field flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 focus-within:border-accent-line">
          <Search className="w-3.5 h-3.5 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved" className="w-36 bg-transparent text-[13px] outline-none text-foreground placeholder:text-faint" />
        </label>
      </div>
      <div className="mt-6 space-y-3">
        {shown.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
            <Bookmark className="w-5 h-5 mx-auto mb-2 text-faint" />Nothing saved here yet. Use the bookmark under any answer.
          </div>
        )}
        {shown.map((s) => (
          <div key={s.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
                  <select value={s.collection} onChange={(e) => onUpdate(s, { collection: e.target.value })} aria-label="Collection"
                    className="rounded-full border border-border bg-card px-2 py-0.5 text-[11.5px] text-foreground outline-none">
                    {all.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <span>{new Date(s.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </div>
                <button type="button" onClick={() => onOpen(s)} className="mt-1.5 block text-left font-semibold text-foreground hover:text-accent">{s.title}</button>
                <p className="mt-1 text-[13.5px] text-muted line-clamp-2">{s.excerpt}</p>
                <input defaultValue={s.note} placeholder="Add a note…" onBlur={(e) => e.target.value !== s.note && onUpdate(s, { note: e.target.value })}
                  className="mt-2 w-full rounded-xl bg-card border border-transparent focus:border-border px-3 py-1.5 text-[13px] text-foreground placeholder:text-faint outline-none" />
              </div>
              <button type="button" aria-label="Remove" onClick={() => onRemove(s)} className="p-2 rounded-full text-faint hover:text-foreground hover:bg-card"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SaveDialog({ collections, onSave, onClose }: { collections: string[]; onSave: (collection: string, note: string) => void; onClose: () => void }) {
  const [col, setCol] = useState(collections[0]);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4" role="dialog" aria-label="Save response">
      <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.form initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        onSubmit={(e) => { e.preventDefault(); onSave(custom.trim() || col, note.trim()); }}
        className="relative w-full max-w-sm rounded-3xl border border-border bg-surface shadow-panel p-5">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">Save this answer</h3><button type="button" aria-label="Close" onClick={onClose} className="p-1 rounded-full text-muted hover:text-foreground"><X className="w-4 h-4" /></button></div>
        <div className="mt-4 text-[12px] font-semibold text-muted">Collection</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {collections.map((c) => (
            <button key={c} type="button" onClick={() => { setCol(c); setCustom(""); }} className={`px-3 py-1.5 rounded-full text-[13px] border ${col === c && !custom ? "bg-ink text-ink-fg border-transparent" : "border-border text-muted hover:text-foreground"}`}>{c}</button>
          ))}
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="+ New" className="w-24 px-3 py-1.5 rounded-full text-[13px] border border-dashed border-border bg-transparent outline-none text-foreground placeholder:text-faint focus:w-36 transition-all" />
        </div>
        <div className="mt-4 text-[12px] font-semibold text-muted">Note <span className="font-normal text-faint">(optional)</span></div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. use on Monday with 9B" className="mt-2 w-full rounded-2xl border border-border bg-card px-3 py-2 text-[13.5px] text-foreground placeholder:text-faint outline-none focus:border-border-hi resize-none" />
        <button type="submit" className="mt-4 w-full py-2.5 rounded-full bg-ink text-ink-fg text-sm font-semibold">Save</button>
      </motion.form>
    </div>
  );
}
