"use client";

import { useTabState } from "@/lib/tab-state";
import { ArrowDown, ArrowUp, Plus, Trash2, Wand2 } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import type { DeckOutline, OutlineSlide } from "@/services/api";

const MIN_SLIDES = 3;

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
  const [saved, setSaved] = useTabState<{ base: string; slides: OutlineSlide[] } | null>(storageKey, null);
  const slides = saved?.base === base ? saved.slides : outline.outline;
  const setSlides = (fn: (s: OutlineSlide[]) => OutlineSlide[]) =>
    setSaved((prev) => ({ base, slides: fn(prev?.base === base ? prev.slides : outline.outline) }));
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
      s.length >= max ? s : [...s.slice(0, after + 1), { type: "explanation", title: "New slide", point: "What this slide should teach." }, ...s.slice(after + 1)],
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

      <ol className="space-y-2">
        {slides.map((s, i) => (
          <li key={i} className="p-3 rounded-xl bg-card border border-border">
            <div className="flex items-start gap-3">
              <span className="text-xs font-semibold text-muted w-5 pt-2 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <select
                    value={s.type}
                    onChange={(e) => update(i, { type: e.target.value })}
                    aria-label={`Slide ${i + 1} type`}
                    className="px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground"
                  >
                    {outline.types.map((t) => (
                      <option key={t.type} value={t.type}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    value={s.title}
                    maxLength={70}
                    onChange={(e) => update(i, { title: e.target.value })}
                    aria-label={`Slide ${i + 1} title`}
                    className="flex-1 min-w-[12rem] px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground font-semibold focus:outline-none focus:border-accent"
                  />
                </div>
                <textarea
                  value={s.point}
                  maxLength={160}
                  rows={2}
                  onChange={(e) => update(i, { point: e.target.value })}
                  aria-label={`Slide ${i + 1}: what it covers`}
                  className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted resize-none focus:outline-none focus:border-accent leading-relaxed"
                />
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 rounded text-muted hover:text-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label="Move down" className="p-1 rounded text-muted hover:text-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => remove(i)} disabled={slides.length <= MIN_SLIDES} aria-label="Remove slide" className="p-1 rounded text-muted hover:text-danger disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => add(slides.length - 2)}
          disabled={slides.length >= max}
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
            onClick={() => onBuild(slides.map((s) => ({ ...s, title: s.title.trim(), point: s.point.trim() })))}
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
