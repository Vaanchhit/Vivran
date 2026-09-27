"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, BookMarked, ChevronDown } from "lucide-react";
import { slideHTML, SLIDE_CSS, THEME } from "@/lib/slidekit/render";
import { CANVAS } from "@/lib/slidekit/tokens";
import type { DeckReady } from "@/services/api";

/** Scales one 1920x1080 slide to whatever width its column has. */
function ScaledSlide({ html }: { html: string }) {
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
    <div ref={ref} className="relative w-full overflow-hidden rounded-lg border border-border" style={{ aspectRatio: `${CANVAS.w} / ${CANVAS.h}` }}>
      {scale > 0 && (
        <div
          style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${scale})`, transformOrigin: "top left" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function printDeck(title: string, slides: string[]) {
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
html,body{margin:0;padding:0;background:${THEME.bg}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{break-after:page;page-break-after:always}
.slide:last-child{break-after:auto;page-break-after:auto}
${SLIDE_CSS}</style></head><body>${slides.join("")}</body></html>`);
  doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup);
  setTimeout(() => {
    win.focus();
    win.print();
  }, 150);
}

export function DeckView({ deck }: { deck: DeckReady }) {
  const slides = useMemo(() => deck.placements.map((p) => slideHTML(p)), [deck.placements]);
  const [openNotes, setOpenNotes] = useState<number | null>(null);
  const title = deck.context.topic;
  const sources = deck.grounding.sources;

  return (
    <div className="space-y-4 pt-2 border-t border-border">
      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-bold text-base text-foreground font-display">{title}</div>
          <div className="text-xs text-muted mt-0.5">
            {slides.length} slides · {deck.context.gradeLabel}
            {deck.grounding.retrieved > 0
              ? ` · cites ${deck.grounding.cited} of ${deck.grounding.retrieved} retrieved sources`
              : " · not grounded in your uploads"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => printDeck(title, slides)}
          className="btn-primary px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2"
        >
          <FileDown className="w-3.5 h-3.5" /> Export PDF
        </button>
      </div>

      {deck.context.warnings?.length > 0 && (
        <ul className="text-xs text-muted list-disc list-inside">
          {deck.context.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      <div className="grid gap-5">
        {deck.placements.map((p, i) => (
          <div key={i} className="space-y-1.5">
            <div className="text-[11px] font-semibold text-muted">Slide {i + 1}</div>
            <ScaledSlide html={slides[i]} />
            {p.notes.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setOpenNotes(openNotes === i ? null : i)}
                  aria-expanded={openNotes === i}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-foreground"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${openNotes === i ? "rotate-180" : ""}`} /> Speaker notes
                </button>
                {openNotes === i && (
                  <div className="mt-1 p-3 rounded-lg bg-card border border-border text-xs text-muted space-y-1.5">
                    {p.notes.map((n, j) => <p key={j}>{n}</p>)}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {sources.length > 0 && (
        <div className="p-3.5 rounded-xl bg-card border border-border text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <BookMarked className="w-3.5 h-3.5" /> Sources cited
          </div>
          {sources.map((s) => (
            <div key={s.chunk_id} className="text-muted">
              <span className="text-foreground">{s.source_material || "Uploaded material"}</span>
              {s.page_number ? ` · p.${s.page_number}` : ""} — {s.excerpt.slice(0, 140)}
              {s.excerpt.length > 140 ? "…" : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
