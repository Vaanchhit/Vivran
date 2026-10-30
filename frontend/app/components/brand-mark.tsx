"use client";

import { useId, useMemo } from "react";
import { brandMarkSvg } from "@/lib/brand-mark";

const SVG = brandMarkSvg();

/** The Vivran block mark. Size it with the wrapper's width/height classes;
 * add `vv-mark-host` to a parent (e.g. the logo link) to animate on its hover too.
 * Each mark gets its own gradient and filter ids: with shared ids, every mark
 * paints from the first one in the document, and when that one is hidden (a
 * collapsed sidebar on a phone) the rest render as an empty shadow. */
export function BrandMark({ className = "w-8 h-8" }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const html = useMemo(() => SVG.replace(/vvm-/g, `vvm${id}-`), [id]);
  return <span className={`inline-block shrink-0 ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
