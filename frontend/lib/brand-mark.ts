/**
 * The Vivran mark: a 3×3×3 stack of isometric blocks, some missing, with a
 * few loose ones drifting off it. It is built from geometry (not an image)
 * so every block is its own SVG group and can move on hover.
 *
 * `brandMarkSvg()` returns plain markup so the same mark is used by the React
 * component (app/components/brand-mark.tsx) and pasted into the static landing
 * page (public/home.html). If you change the blocks here, regenerate that copy:
 *   npx tsc lib/brand-mark.ts --outDir /tmp/bm && node -e "console.log(require('/tmp/bm/brand-mark.js').brandMarkSvg())"
 * Styling and motion live in globals.css (and its copy in home.html) under `.vv-mark`.
 */

type Tone = "cream" | "sage";
type Pt = [number, number];

interface Block {
  /** screen-space centre, in block units (cluster centre is 0,0) */
  cx: number;
  cy: number;
  size: number;
  tone: Tone;
  loose: boolean;
}

const COS30 = Math.sqrt(3) / 2;
const project = (x: number, y: number, z: number): Pt => [(x - y) * COS30, (x + y) / 2 - z];

const c: Tone = "cream";
const s: Tone = "sage";

/** [x, y, z, tone] on the 3×3×3 grid; z is up, x runs to the lower right, y to the lower left. */
const GRID: [number, number, number, Tone][] = [
  // bottom layer
  [1, 0, 0, s], [2, 0, 0, c], [0, 1, 0, c], [2, 1, 0, s],
  [0, 2, 0, c], [1, 2, 0, s], [2, 2, 0, c],
  // middle layer: the centre and one front block are missing, so you can see in
  [0, 0, 1, c], [1, 0, 1, c], [2, 0, 1, s], [0, 1, 1, s],
  [2, 1, 1, s], [0, 2, 1, c], [1, 2, 1, s],
  // top layer: the right-hand corner is missing
  [0, 0, 2, c], [1, 0, 2, s], [0, 1, 2, s], [1, 1, 2, c],
  [2, 1, 2, c], [0, 2, 2, c], [1, 2, 2, s], [2, 2, 2, c],
];

/** A few blocks sit slightly out of the stack, as in the artwork: "x,y,z" → offset in block units. */
const NUDGE: Record<string, [number, number, number]> = {
  "2,2,2": [0, 0, 0.14],
  "2,0,0": [0.16, 0, 0],
  "0,2,0": [0, 0.16, 0],
  "1,0,2": [0, 0, 0.1],
  "2,1,1": [0.12, 0, 0],
};

/** Blocks that have come loose, placed by screen position like the artwork. */
const LOOSE: [number, number, number, Tone][] = [
  [1.95, -2.5, 0.55, c],
  [2.55, -1.45, 0.3, c],
  [-3.0, 0.05, 0.45, c],
  [-2.9, 1.1, 0.22, s],
  [-2.6, 2.05, 0.5, c],
  [3.15, 1.1, 0.28, c],
];

const BLOCKS: Block[] = [
  ...GRID
    // Painter's order: blocks further from the viewer are drawn first.
    .slice()
    .sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
    .map(([x, y, z, tone]) => {
      const [nx, ny, nz] = NUDGE[`${x},${y},${z}`] ?? [0, 0, 0];
      const [cx, cy] = project(x - 1 + nx, y - 1 + ny, z - 1 + nz);
      return { cx, cy, size: 0.92, tone, loose: false };
    }),
  ...LOOSE.map(([cx, cy, size, tone]) => ({ cx, cy, size, tone, loose: true })),
];

const r = (n: number) => Math.round(n * 1000) / 1000;
const pts = (corners: [number, number, number][], b: Block) =>
  corners
    .map(([x, y, z]) => {
      const [px, py] = project(x * b.size, y * b.size, z * b.size);
      return `${r(b.cx + px)},${r(b.cy + py)}`;
    })
    .join(" ");

const h = 0.5;
const TOP: [number, number, number][] = [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]];
const RIGHT: [number, number, number][] = [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]];
const LEFT: [number, number, number][] = [[-h, h, -h], [h, h, -h], [h, h, h], [-h, h, h]];
const OUTLINE: [number, number, number][] = [[-h, -h, h], [h, -h, h], [h, -h, -h], [h, h, -h], [-h, h, -h], [-h, h, h]];

function blockSvg(b: Block, i: number) {
  // Each block drifts away from the centre when the mark is hovered.
  const len = Math.hypot(b.cx, b.cy) || 1;
  const push = b.loose ? 0.45 : 0.22;
  const style = `--i:${i};--dx:${r((b.cx / len) * push)}px;--dy:${r((b.cy / len) * push)}px`;
  return (
    `<g class="vv-block vv-${b.tone}${b.loose ? " vv-loose" : ""}" style="${style}">` +
    `<g class="vv-body">` +
    `<polygon class="vv-top" points="${pts(TOP, b)}"/>` +
    `<polygon class="vv-left" points="${pts(LEFT, b)}"/>` +
    `<polygon class="vv-right" points="${pts(RIGHT, b)}"/>` +
    `</g>` +
    // Fixed hit area, so a block lifting out from under the pointer doesn't flicker.
    `<polygon class="vv-hit" points="${pts(OUTLINE, b)}"/>` +
    `</g>`
  );
}

export function brandMarkSvg(): string {
  return (
    `<svg class="vv-mark" viewBox="-3.9 -3.9 7.8 7.8" aria-hidden="true" focusable="false">` +
    BLOCKS.map(blockSvg).join("") +
    `</svg>`
  );
}
