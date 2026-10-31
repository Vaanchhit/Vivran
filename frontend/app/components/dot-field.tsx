"use client";

import { useEffect, useRef } from "react";

type Mount = (host: HTMLElement, opts?: { mask?: [number, number, number, number] }) => () => void;

/**
 * The live dot-matrix backdrop for entry screens. The drawing engine is
 * public/landing/dotfield.mjs, shared with the landing page; colours come from
 * --dot, --dot-hi and --dot-mark in globals.css. Put it as the first child of a
 * `relative` container whose content sits at z-10.
 */
export function DotField({ glow = true, mask }: { glow?: boolean; mask?: [number, number, number, number] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined, gone = false;
    import(/* webpackIgnore: true */ "/landing/dotfield.mjs" as string)
      .then(({ mount }: { mount: Mount }) => { if (!gone && ref.current) stop = mount(ref.current, mask ? { mask } : undefined); })
      .catch(() => {}); // decoration only: no dots is fine
    return () => { gone = true; stop?.(); };
  }, [mask]);

  return (
    <div ref={ref} className="vv-dotfield" aria-hidden="true">
      {glow && <i className="w" />}
    </div>
  );
}
