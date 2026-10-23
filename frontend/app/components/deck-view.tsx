"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, ChevronLeft, ChevronRight, FileDown, Laugh, Palette, Presentation, Shapes, Trash2, Wand2 } from "lucide-react";
import { MemeComposer } from "@/app/components/meme-composer";
import { AnimatePresence, motion } from "framer-motion";
import { SKINS, SKIN_LABELS, type Skin } from "@/lib/slidekit/skin";
import type { Placement } from "@/lib/slidekit/matcher";
import { saveDeckEdit } from "@/services/api";
import { DEFAULT_THEME_ID, THEMES, customTheme, slideCSS, slideHTML, type DeckTheme } from "@/lib/slidekit/render";
import { CANVAS } from "@/lib/slidekit/tokens";
import type { DeckReady } from "@/services/api";

type ThemeChoice = { id: string } | { custom: string; dark: boolean };
const STORAGE_KEY = "vivran_deck_theme";
const SKIN_KEY = "vivran_deck_skin";

function loadSkin(): Skin | null {
  try {
    const s = localStorage.getItem(SKIN_KEY);
    return s && (SKINS as readonly string[]).includes(s) ? (s as Skin) : null;
  } catch {
    return null;
  }
}

/** The teacher's saved theme, or null when they never chose one (then the design rules' pick is used). */
function loadChoice(): ThemeChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && typeof c.id === "string" && THEMES[c.id]) return { id: c.id };
      if (c && typeof c.custom === "string") return { custom: c.custom, dark: !!c.dark };
    }
  } catch {}
  return null;
}

const resolve = (c: ThemeChoice): DeckTheme => ("id" in c ? THEMES[c.id].theme : customTheme(c.custom, c.dark));

/** One 1920x1080 slide, scaled to whatever box it is given. */
function Slide({ html, className = "" }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / CANVAS.w));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: `${CANVAS.w} / ${CANVAS.h}` }}>
      {scale > 0 && (
        <div
          style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${scale})`, transformOrigin: "top left" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function printDeck(title: string, slides: string[], css: string, bg: string) {
  // A throwaway iframe rather than window.print() on the app: the PDF gets
  // exactly one 16:9 page per slide and none of the app's chrome.
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:${CANVAS.w}px ${CANVAS.h}px;margin:0}
html,body{margin:0;padding:0;background:${bg}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{break-after:page;page-break-after:always}
.slide:last-child{break-after:auto;page-break-after:auto}
${css}</style></head><body>${slides.join("")}</body></html>`);
  doc.close();
  win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500));
  setTimeout(() => {
    win.focus();
    win.print();
  }, 150);
}

export function DeckView({ deck }: { deck: DeckReady }) {
  const [choice, setChoice] = useState<ThemeChoice>({ id: DEFAULT_THEME_ID });
  const [customAccent, setCustomAccent] = useState("#B8461F");
  const [customDark, setCustomDark] = useState(false);
  const [current, setCurrent] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const [exporting, setExporting] = useState(false);
  // The deck as the teacher has edited it (memes added or removed); saved back to the library.
  const [placements, setPlacements] = useState<Placement[]>(deck.placements);
  const [skin, setSkin] = useState<Skin>("classic");
  const [composing, setComposing] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  useEffect(() => {
    setPlacements(deck.placements);
    setComposing(false);
    setSkin(loadSkin() ?? deck.design?.skin ?? "classic");
  }, [deck]);

  const pickSkin = (s: Skin) => {
    setSkin(s);
    try {
      localStorage.setItem(SKIN_KEY, s);
    } catch {}
  };

  const commit = (next: Placement[], at: number) => {
    setPlacements(next);
    setCurrent(Math.max(0, Math.min(next.length - 1, at)));
    if (!deck.libraryId) return;
    setSaveNote("Saving…");
    saveDeckEdit(deck.libraryId, { ...deck, placements: next, quality: { ...deck.quality, slides: next.length } })
      .then(() => setSaveNote("Saved to your library"))
      .catch(() => setSaveNote("Not saved: the change is only in this view"));
  };

  // A theme the teacher saved always wins; otherwise the design rules' choice for this deck.
  useEffect(() => {
    const saved = loadChoice();
    const suggested: ThemeChoice | null = deck.design?.themeId && THEMES[deck.design.themeId]
      ? { id: deck.design.themeId }
      : deck.design?.custom ? { custom: deck.design.custom.accent, dark: deck.design.custom.dark } : null;
    const c = saved ?? suggested ?? { id: DEFAULT_THEME_ID };
    setChoice(c);
    if ("custom" in c) {
      setCustomAccent(c.custom);
      setCustomDark(c.dark);
    }
  }, [deck]);

  const pick = (c: ThemeChoice) => {
    setChoice(c);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {}
  };

  const theme = useMemo(() => resolve(choice), [choice]);
  const css = useMemo(() => slideCSS(theme), [theme]);
  const title = deck.context.topic;
  const slides = useMemo(
    () => placements.map((p, index) => slideHTML(p, "", theme, { skin, index, total: placements.length, deckTitle: title })),
    [placements, theme, skin, title],
  );
  const total = slides.length;
  const [dir, setDir] = useState(1);
  const go = useCallback((i: number) => {
    setDir(i >= current ? 1 : -1);
    setCurrent(Math.max(0, Math.min(total - 1, i)));
  }, [total, current]);

  useEffect(() => {
    setCurrent(0);
  }, [deck]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(current + 1);
    if (e.key === "ArrowLeft") go(current - 1);
  };

  const notes = placements[current]?.notes ?? [];
  const currentIsMeme = placements[current]?.block.type === "meme";
  const slideText = (placements[current]?.elements ?? []).filter((e) => e.t === "text").map((e) => (e as { text: string }).text).join(" · ");
  const sources = deck.grounding.sources;
  const isCustom = "custom" in choice;

  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-base text-foreground font-display">{title}</div>
          <div className="text-xs text-muted mt-0.5">
            {total} slides · {deck.context.gradeLabel}
            {deck.grounding.retrieved > 0
              ? ` · cites ${deck.grounding.cited} of ${deck.grounding.retrieved} retrieved sources`
              : " · not grounded in your uploads"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setComposing((v) => !v)}
            aria-expanded={composing}
            className="px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 border border-border bg-card text-foreground hover:border-accent-line"
          >
            <Laugh className="w-3.5 h-3.5 text-accent" /> Add meme
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const { exportPptx } = await import("@/lib/slidekit/pptx");
                await exportPptx(placements, title, theme, `${title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "vivran-slides"}.pptx`, skin);
              } finally {
                setExporting(false);
              }
            }}
            className="btn-primary px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 disabled:opacity-60"
          >
            <Presentation className="w-3.5 h-3.5" /> {exporting ? "Preparing…" : "Export PowerPoint"}
          </button>
          <button
            type="button"
            onClick={() => printDeck(title, slides, css, theme.bg)}
            className="btn-primary px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2"
          >
            <FileDown className="w-3.5 h-3.5" /> Export PDF
          </button>
        </div>
      </div>

      {deck.template && (
        <div className="flex items-start gap-2 text-xs text-muted">
          <Wand2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
          <span>
            Built on the <strong className="text-foreground">{deck.template.name}</strong> template
            {deck.template.reasons.length ? ` because ${deck.template.reasons.slice(0, 2).join(" and ")}` : ""}.
            {deck.design?.applied.length ? ` Design: ${deck.design.applied.slice(0, 2).map((a) => a.why.replace(/\.$/, "").toLowerCase()).join("; ")}.` : ""}
          </span>
        </div>
      )}

      <AnimatePresence>
      {composing && (
        <motion.div key="composer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
        <MemeComposer
          topic={title}
          grade={deck.context.gradeLabel}
          band={deck.context.grade}
          subject={deck.context.subject}
          language={deck.context.language}
          context={slideText}
          after={current + 1}
          onClose={() => setComposing(false)}
          onAdd={(p) => {
            setComposing(false);
            commit([...placements.slice(0, current + 1), p, ...placements.slice(current + 1)], current + 1);
          }}
        />
        </motion.div>
      )}
      </AnimatePresence>

      {/* Style: the template's look (drawn in the margins only), switchable. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted font-medium mr-1">
          <Shapes className="w-3.5 h-3.5" /> Style
        </span>
        {SKINS.map((s) => (
          <button key={s} type="button" onClick={() => pickSkin(s)} aria-pressed={skin === s}
            className={`px-2.5 py-1 rounded-lg border transition-colors ${skin === s ? "border-accent bg-accent-soft text-foreground" : "border-border bg-card text-muted hover:text-foreground"}`}>
            {SKIN_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Theme: the teacher's choice, applied at render time. Never sent to the model. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted font-medium mr-1">
          <Palette className="w-3.5 h-3.5" /> Theme
        </span>
        {Object.entries(THEMES).map(([id, t]) => {
          const on = "id" in choice && choice.id === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => pick({ id })}
              aria-pressed={on}
              title={t.name}
              className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-lg border transition-colors ${
                on ? "border-accent bg-accent-soft text-foreground" : "border-border bg-card text-muted hover:text-foreground"
              }`}
            >
              <span className="w-5 h-5 rounded-md border border-border flex items-end overflow-hidden" style={{ background: t.theme.bg }}>
                <span className="w-full h-1.5" style={{ background: t.theme.accent }} />
              </span>
              {t.name}
            </button>
          );
        })}
        <span className={`flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border ${isCustom ? "border-accent bg-accent-soft" : "border-border bg-card"}`}>
          <span className={isCustom ? "text-foreground" : "text-muted"}>Custom</span>
          <input
            type="color"
            aria-label="Custom accent colour"
            value={customAccent}
            onChange={(e) => {
              setCustomAccent(e.target.value);
              pick({ custom: e.target.value, dark: customDark });
            }}
            className="w-6 h-6 rounded border border-border bg-transparent cursor-pointer p-0"
          />
          <button
            type="button"
            onClick={() => {
              setCustomDark(!customDark);
              pick({ custom: customAccent, dark: !customDark });
            }}
            className="px-1.5 py-0.5 rounded border border-border text-[11px] text-muted hover:text-foreground"
          >
            {customDark ? "Dark" : "Light"}
          </button>
        </span>
      </div>

      {deck.context.warnings?.length > 0 && (
        <ul className="text-xs text-muted list-disc list-inside">
          {deck.context.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      {/* Viewer: one slide at a time, capped by both width and screen height. */}
      <div tabIndex={0} onKeyDown={onKey} className="outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl" aria-label="Slide viewer. Use the left and right arrow keys to move between slides.">
        <div className="mx-auto" style={{ width: "min(100%, calc((100vh - 320px) * 16 / 9))", minWidth: "min(100%, 480px)" }}>
          <div className="relative">
            {/* Moving between slides slides the next one in from the side you're heading. */}
            <AnimatePresence initial={false} mode="popLayout" custom={dir}>
              <motion.div key={current} custom={dir}
                variants={{ enter: (d: number) => ({ opacity: 0, x: d * 24 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: d * -24 }) }}
                initial="enter" animate="center" exit="exit" transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}>
                <Slide html={slides[current] ?? ""} className="rounded-lg border border-border shadow-sm" />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted">
            <button type="button" onClick={() => go(current - 1)} disabled={current === 0} className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:text-foreground" aria-label="Previous slide">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="flex items-center gap-2">
              Slide {current + 1} of {total}
              {currentIsMeme && (
                <button type="button" onClick={() => commit(placements.filter((_, i) => i !== current), current - 1)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-muted hover:text-danger">
                  <Trash2 className="w-3 h-3" /> Remove meme
                </button>
              )}
              {saveNote && <span className="text-faint">· {saveNote}</span>}
            </span>
            <button type="button" onClick={() => go(current + 1)} disabled={current === total - 1} className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:text-foreground" aria-label="Next slide">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {slides.map((html, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === current}
            className="relative shrink-0 w-32 rounded-md border-2 border-transparent hover:border-border overflow-hidden transition-colors"
          >
            <Slide html={html} />
            {i === current && <motion.span layoutId="thumb-ring" className="absolute inset-0 rounded-[5px] ring-2 ring-accent pointer-events-none" transition={{ duration: 0.2 }} />}
          </button>
        ))}
      </div>

      {notes.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowNotes(!showNotes)} aria-expanded={showNotes} className="text-[11px] font-medium text-muted hover:text-foreground">
            {showNotes ? "Hide" : "Show"} speaker notes for this slide
          </button>
          {showNotes && (
            <div className="mt-1 p-3 rounded-lg bg-card border border-border text-xs text-muted space-y-1.5">
              {notes.map((n, j) => <p key={j}>{n}</p>)}
            </div>
          )}
        </div>
      )}

      {sources.length > 0 && (
        <div className="p-3.5 rounded-xl bg-card border border-border text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <BookMarked className="w-3.5 h-3.5" /> Sources cited
          </div>
          {sources.map((s) => (
            <div key={s.chunk_id} className="text-muted">
              <span className="text-foreground">{s.source_material || "Uploaded material"}</span>
              {s.page_number ? ` · p.${s.page_number}` : ""}: {s.excerpt.slice(0, 140)}
              {s.excerpt.length > 140 ? "…" : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
