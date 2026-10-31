"use client";

import { useEffect, useRef } from "react";

/**
 * The dot-grid backdrop for entry screens (styles: .vv-dotfield in globals.css).
 * Put it as the first child of a `relative` container whose content sits at
 * z-10. On a pointer that can hover, the dots under the cursor light up.
 */
export function DotField({ glow = true }: { glow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = ref.current;
    const host = field?.parentElement;
    if (!field || !host || !window.matchMedia("(hover: hover)").matches) return;
    let raf = 0, x = 0, y = 0;
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      x = e.clientX - r.left; y = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; field.style.setProperty("--mx", `${x}px`); field.style.setProperty("--my", `${y}px`); });
      field.classList.add("lit");
    };
    const leave = () => field.classList.remove("lit");
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(raf); host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave); };
  }, []);

  return (
    <div ref={ref} className="vv-dotfield" aria-hidden="true">
      <i className="d" /><i className="h" />{glow && <i className="w" />}
    </div>
  );
}
