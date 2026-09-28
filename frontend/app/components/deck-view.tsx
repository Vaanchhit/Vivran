"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, ChevronLeft, ChevronRight, FileDown, Palette } from "lucide-react";
import { DEFAULT_THEME_ID, THEMES, customTheme, slideCSS, slideHTML, type DeckTheme } from "@/lib/slidekit/render";
import { CANVAS } from "@/lib/slidekit/tokens";
import type { DeckReady } from "@/services/api";

type ThemeChoice = { id: string } | { custom: string; dark: boolean };
const STORAGE_KEY = "vivran_deck_theme";

function loadChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && typeof c.id === "string" && THEMES[c.id]) return { id: c.id };
      if (c && typeof c.custom === "string") return { custom: c.custom, dark: !!c.dark };
    }
  } catch {}
  return { id: DEFAULT_THEME_ID };
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

  useEffect(() => {
    const c = loadChoice();
    setChoice(c);
    if ("custom" in c) {
      setCustomAccent(c.custom);
      setCustomDark(c.dark);
    }
  }, []);

  const pick = (c: ThemeChoice) => {
    setChoice(c);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {}
  };

  const theme = useMemo(() => resolve(choice), [choice]);
  const css = useMemo(() => slideCSS(theme), [theme]);
  const slides = useMemo(() => deck.placements.map((p) => slideHTML(p, "", theme)), [deck.placements, theme]);
  const total = slides.length;
  const go = useCallback((i: number) => setCurrent(Math.max(0, Math.min(total - 1, i))), [total]);

  useEffect(() => {
    setCurrent(0);
  }, [deck]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(current + 1);
    if (e.key === "ArrowLeft") go(current - 1);
  };

  const title = deck.context.topic;
  const notes = deck.placements[current]?.notes ?? [];
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
        <button
          type="button"
          onClick={() => printDeck(title, slides, css, theme.bg)}
          className="btn-primary px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2"
        >
          <FileDown className="w-3.5 h-3.5" /> Export PDF
        </button>
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
          <Slide html={slides[current] ?? ""} className="rounded-lg border border-border shadow-sm" />
          <div className="flex items-center justify-between mt-2 text-xs text-muted">
            <button type="button" onClick={() => go(current - 1)} disabled={current === 0} className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:text-foreground" aria-label="Previous slide">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>
              Slide {current + 1} of {total}
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
            className={`shrink-0 w-32 rounded-md border-2 overflow-hidden transition-colors ${i === current ? "border-accent" : "border-transparent hover:border-border"}`}
          >
            <Slide html={html} />
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
