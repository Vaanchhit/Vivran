"use client";

// Add a meme slide to a deck: pick a format, write (or ask for) captions, say the
// idea it lands. Only cartoon/animal formats from the allowlist; captions are
// cleaned on the server; the image comes through Vivran's own signed proxy.
import React, { useEffect, useState } from "react";
import { Laugh, Sparkles, X } from "lucide-react";
import { BookLoader } from "@/app/components/book-loader";
import { buildMemeSlide, getMemeFormats, suggestMeme, type MemeDraft, type MemeFormatInfo } from "@/services/api";
import type { Placement } from "@/lib/slidekit/matcher";

export function MemeComposer({ topic, grade, band, subject, language, context, after, onAdd, onClose }: {
  topic: string; grade: string; band: string; subject?: string; language?: string;
  /** Text of the slide the meme goes after, so a suggestion fits it. */
  context: string;
  after: number;
  onAdd: (p: Placement) => void;
  onClose: () => void;
}) {
  const [formats, setFormats] = useState<MemeFormatInfo[] | null>(null);
  const [draft, setDraft] = useState<MemeDraft>({ template: "", lines: [], takeaway: "" });
  const [busy, setBusy] = useState<"suggest" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMemeFormats().then(setFormats).catch((e) => setError(e instanceof Error ? e.message : "Could not load formats."));
  }, []);

  const fmt = formats?.find((f) => f.id === draft.template);
  const choose = (f: MemeFormatInfo) =>
    setDraft((d) => ({ ...d, template: f.id, lines: Array.from({ length: f.lines }, (_, i) => d.lines[i] ?? "") }));

  const suggest = async () => {
    setBusy("suggest"); setError(null);
    try {
      const { block } = await suggestMeme({ topic, grade, subject, language, context });
      setDraft(block);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not suggest a meme."); }
    finally { setBusy(null); }
  };

  const add = async () => {
    setBusy("add"); setError(null);
    try {
      const { placement } = await buildMemeSlide({ ...draft, lines: draft.lines.map((l) => l.trim()).filter(Boolean) }, band);
      onAdd(placement);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not make that meme slide."); }
    finally { setBusy(null); }
  };

  const ready = !!draft.template && draft.lines.some((l) => l.trim()) && draft.takeaway.trim().length > 3;

  return (
    <section className="p-4 rounded-2xl bg-surface border border-accent-line space-y-4" aria-label="Add a meme slide">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold font-display text-foreground flex items-center gap-2"><Laugh className="w-4 h-4 text-accent" /> Add a meme after slide {after}</div>
          <p className="text-xs text-muted mt-0.5">A light moment that makes the idea stick. Cartoon and animal formats only; never about a real person.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      <button type="button" onClick={suggest} disabled={!!busy}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-foreground hover:border-accent-line disabled:opacity-50">
        {busy === "suggest" ? <BookLoader className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5 text-accent" />}
        Suggest one for this slide
      </button>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Or pick a format</div>
        {!formats && !error && <div className="text-xs text-muted">Loading formats…</div>}
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
          {formats?.map((f) => (
            <button key={f.id} type="button" onClick={() => choose(f)} title={f.use} aria-pressed={draft.template === f.id}
              className={`rounded-lg border-2 overflow-hidden bg-card text-left transition-colors ${draft.template === f.id ? "border-accent" : "border-transparent hover:border-border"}`}>
              <div className="relative aspect-[4/3] bg-card flex items-center justify-center">
                <span className="absolute text-[10px] text-faint px-1 text-center">{f.name}</span>
                {f.preview && <img src={f.preview} alt={`${f.name} meme format`} loading="lazy" className="relative w-full h-full object-cover" />}
              </div>
              <div className="px-1.5 py-1 text-[10px] text-muted truncate"><span className="text-foreground">{f.name}</span> · {f.lines}</div>
            </button>
          ))}
        </div>
        {fmt && <p className="text-[11px] text-muted mt-2">Best for: {fmt.use}</p>}
      </div>

      {draft.template && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            {draft.lines.map((l, i) => (
              <input key={i} value={l} maxLength={70} placeholder={`Caption ${i + 1}`}
                onChange={(e) => setDraft((d) => ({ ...d, lines: d.lines.map((x, j) => (j === i ? e.target.value : x)) }))}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-accent" />
            ))}
          </div>
          <label className="text-xs text-muted space-y-1.5">
            <span className="block">The idea it helps students remember</span>
            <textarea value={draft.takeaway} maxLength={140} rows={3}
              onChange={(e) => setDraft((d) => ({ ...d, takeaway: e.target.value }))}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent" />
          </label>
        </div>
      )}

      {error && <div className="text-xs text-danger">{error}</div>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl border border-border bg-card text-xs text-muted hover:text-foreground">Cancel</button>
        <button type="button" onClick={add} disabled={!ready || !!busy}
          className="btn-primary px-4 py-2 text-xs font-semibold rounded-xl inline-flex items-center gap-2 disabled:opacity-50">
          {busy === "add" && <BookLoader className="w-3.5 h-3.5" />} Add slide
        </button>
      </div>
    </section>
  );
}
