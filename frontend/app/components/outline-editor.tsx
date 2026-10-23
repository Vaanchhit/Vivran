"use client";

import { useTabState } from "@/lib/tab-state";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, Wand2 } from "lucide-react";
import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import { BookLoader } from "@/app/components/book-loader";
import type { DeckOutline, OutlineSlide } from "@/services/api";

const MIN_SLIDES = 3;

/** A slide with a stable key, so dragging and the enter/exit animations track the right row. */
type Keyed = OutlineSlide & { _k: string };

/** Plan → approve → produce: the teacher edits the proposed structure before anything is written. */
export function OutlineEditor({
  outline,
  building,
  onBuild,
  onCancel,
  storageKey,
}: {
  outline: DeckOutline;
  /** Where the teacher's edits are kept, so leaving the page doesn't undo them. */
  storageKey: string;
  building: boolean;
  onBuild: (slides: OutlineSlide[]) => void;
  onCancel: () => void;
}) {
  // Edits are tied to the outline they were made on; a new outline starts clean.
  const base = outline.outline.map((s) => s.title).join("|");
  const [saved, setSaved] = useTabState<{ base: string; slides: Keyed[] } | null>(storageKey, null);
  const initial = (): Keyed[] => outline.outline.map((x, i) => ({ ...x, _k: `s${i}` }));
  // Edits saved before rows had keys get them here.
  const withKeys = (xs: Keyed[]) => xs.map((x, i) => (x._k ? x : { ...x, _k: `s${i}` }));
  const slides: Keyed[] = saved?.base === base ? withKeys(saved.slides) : initial();
  const setSlides = (fn: (s: Keyed[]) => Keyed[]) =>
    setSaved((prev) => ({ base, slides: fn(prev?.base === base ? withKeys(prev.slides) : initial()) }));
  const max = outline.maxSlides;

  const update = (i: number, patch: Partial<OutlineSlide>) => setSlides((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSlides((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setSlides((s) => (s.length > MIN_SLIDES ? s.filter((_, k) => k !== i) : s));
  const add = (after: number) =>
    setSlides((s) =>
      s.length >= max ? s : [...s.slice(0, after + 1), { type: "explanation", title: "New slide", point: "What this slide should teach.", _k: `n${Date.now()}` }, ...s.slice(after + 1)],
    );

  const valid = slides.length >= MIN_SLIDES && slides.every((s) => s.title.trim().length >= 2 && s.point.trim().length >= 2);

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div>
        <div className="font-bold text-base text-foreground font-display">Review the outline</div>
        <p className="text-xs text-muted mt-0.5">
          {outline.plannedBy === "draft"
            ? "The planner was busy, so this is a starting outline. Edit it, then build."
            : "Here is the plan for your deck. Change anything, reorder or remove slides, then build."}
          {outline.context.grounded ? " It follows your uploaded material." : ""} Nothing is written until you build.
        </p>
      </div>

      {building ? (
        <BuildingView slides={slides} />
      ) : (
        <Reorder.Group as="ol" axis="y" values={slides} onReorder={(next) => setSlides(() => next)} className="space-y-2">
          <AnimatePresence initial={false}>
            {slides.map((s, i) => (
              <Row key={s._k} slide={s} i={i} count={slides.length} types={outline.types}
                update={update} move={move} remove={remove} />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => add(slides.length - 2)}
          disabled={slides.length >= max || building}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted hover:text-foreground disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> Add a slide ({slides.length}/{max})
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} disabled={building} className="px-3 py-2 text-xs font-medium rounded-xl border border-border text-muted hover:text-foreground">
            Start over
          </button>
          <button
            type="button"
            onClick={() => onBuild(slides.map(({ _k: _unused, ...s }) => ({ ...s, title: s.title.trim(), point: s.point.trim() })))}
            disabled={!valid || building}
            className="btn-primary px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            {building ? <BookLoader className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
            {building ? "Building slides…" : "Build slides"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ slide: s, i, count, types, update, move, remove }: {
  slide: Keyed; i: number; count: number; types: DeckOutline["types"];
  update: (i: number, patch: Partial<OutlineSlide>) => void; move: (i: number, d: -1 | 1) => void; remove: (i: number) => void;
}) {
  const drag = useDragControls();
  return (
    <Reorder.Item
      value={s}
      dragListener={false}
      dragControls={drag}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      whileDrag={{ scale: 1.01, boxShadow: "0 12px 28px rgba(0,0,0,0.12)" }}
      className="p-3 rounded-xl bg-card border border-border list-none"
    >
      <div className="flex items-start gap-2">
        <button type="button" onPointerDown={(e) => drag.start(e)} aria-label={`Drag slide ${i + 1} to reorder`}
          className="mt-1.5 p-1 rounded text-faint hover:text-foreground cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold text-muted w-4 pt-2 text-right">{i + 1}</span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select value={s.type} onChange={(e) => update(i, { type: e.target.value })} aria-label={`Slide ${i + 1} type`}
              className="px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground">
              {types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <input value={s.title} maxLength={70} onChange={(e) => update(i, { title: e.target.value })} aria-label={`Slide ${i + 1} title`}
              className="flex-1 min-w-[10rem] px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none focus:border-accent" />
          </div>
          <textarea value={s.point} maxLength={160} rows={2} onChange={(e) => update(i, { point: e.target.value })} aria-label={`Slide ${i + 1}: what it covers`}
            className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted resize-none focus:outline-none focus:border-accent leading-relaxed" />
        </div>
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 rounded text-muted hover:text-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === count - 1} aria-label="Move down" className="p-1 rounded text-muted hover:text-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => remove(i)} disabled={count <= MIN_SLIDES} aria-label="Remove slide" className="p-1 rounded text-muted hover:text-danger disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </Reorder.Item>
  );
}

/**
 * While the deck is written: the approved slides as tiles with a light sweeping
 * across them. It shows what is being made, not a fake per-slide progress: the
 * whole deck is written in one request and arrives at once.
 */
function BuildingView({ slides }: { slides: OutlineSlide[] }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="text-xs text-muted">Writing {slides.length} slides, checking each one fits, then laying them out. This usually takes 15 to 40 seconds.</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {slides.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="relative aspect-video rounded-lg border border-border bg-card overflow-hidden p-2">
            <div className="text-[10px] font-semibold text-foreground line-clamp-2">{i + 1}. {s.title}</div>
            <div className="mt-1.5 space-y-1">
              <div className="h-1.5 rounded bg-border w-4/5" />
              <div className="h-1.5 rounded bg-border w-3/5" />
              <div className="h-1.5 rounded bg-border w-2/3" />
            </div>
            <motion.div aria-hidden className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              animate={{ x: ["0%", "400%"] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
