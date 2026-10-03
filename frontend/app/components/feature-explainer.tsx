"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * A one-sentence explanation attached to a feature card.
 *
 * Mouse: appears after a short hover, and stays open while the pointer moves
 * into it. Keyboard: appears while the card has focus. Touch has no hover and a
 * tap on the card already opens the feature, so touch devices get a small (i)
 * button beside the card that toggles it instead. Esc and a tap elsewhere close.
 *
 * The card is passed as a render function so it can carry aria-describedby:
 * screen readers announce the explanation as the card's description, which is
 * why the panel stays in the DOM (hidden) when closed.
 */

const OPEN_DELAY_MS = 350;
const CLOSE_DELAY_MS = 120;
/** Room the panel needs below the card before it flips above instead. */
const PANEL_ROOM_PX = 150;

interface FeatureExplainerProps {
  /** Feature name, shown above the sentence and in the (i) button's label. */
  title: string;
  text: string;
  children: (describedBy: string) => React.ReactNode;
  className?: string;
}

export function FeatureExplainer({ title, text, children, className = "" }: FeatureExplainerProps) {
  const id = useId();
  const panelId = `explain-${id}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const show = useCallback((delay: number) => {
    clear();
    timer.current = setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) {
        setAbove(rect.bottom + PANEL_ROOM_PX > window.innerHeight && rect.top > PANEL_ROOM_PX);
        setAlignRight(rect.left + 288 > window.innerWidth - 16);
      }
      setOpen(true);
    }, delay);
  }, []);

  const hide = useCallback((delay: number) => {
    clear();
    timer.current = setTimeout(() => setOpen(false), delay);
  }, []);

  useEffect(() => clear, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide(0);
    };
    const onOutside = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) hide(0);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [open, hide]);

  return (
    <div
      ref={wrapRef}
      className={`relative ${className}`}
      // Mouse only: a tap fires pointerenter too, and must not open it behind the
      // navigation the tap is about to cause.
      onPointerEnter={(e) => { if (e.pointerType === "mouse") show(OPEN_DELAY_MS); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") hide(CLOSE_DELAY_MS); }}
      onFocus={(e) => { if ((e.target as HTMLElement).matches(":focus-visible")) show(OPEN_DELAY_MS); }}
      onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget as Node)) hide(0); }}
    >
      {children(panelId)}

      <button
        type="button"
        aria-label={`What is ${title}?`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? hide(0) : show(0))}
        className="hidden [@media(hover:none)]:flex absolute top-1.5 right-1.5 w-8 h-8 items-center justify-center rounded-full text-faint active:text-accent"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      <div
        id={panelId}
        role="tooltip"
        className={`absolute z-30 w-72 max-w-[calc(100vw-2rem)] ${above ? "bottom-full mb-2" : "top-full mt-2"} ${
          alignRight ? "right-0" : "left-0"
        } rounded-xl border border-border-hi bg-card shadow-panel px-3.5 py-3 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
          open
            ? "opacity-100 translate-y-0 visible"
            : `opacity-0 invisible pointer-events-none motion-reduce:translate-y-0 ${above ? "translate-y-0.5" : "-translate-y-0.5"}`
        }`}
      >
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</div>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground">{text}</p>
      </div>
    </div>
  );
}
