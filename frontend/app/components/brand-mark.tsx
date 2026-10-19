import { brandMarkSvg } from "@/lib/brand-mark";

const SVG = brandMarkSvg();

/** The Vivran block mark. Size it with the wrapper's width/height classes;
 * add `vv-mark-host` to a parent (e.g. the logo link) to animate on its hover too. */
export function BrandMark({ className = "w-8 h-8" }: { className?: string }) {
  return <span className={`inline-block shrink-0 ${className}`} dangerouslySetInnerHTML={{ __html: SVG }} />;
}
