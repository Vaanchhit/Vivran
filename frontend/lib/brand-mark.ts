/**
 * The Vivran mark: a 2×2×2 cube of cream and sage blocks. At rest the blocks
 * have drifted apart; on hover they slide back together into one neat cube.
 * It is built from geometry (not an image) so every block can move on its own.
 *
 * Its look follows the original artwork: glossy, softly lit faces, a light
 * catch along each block's top edges, a small shadow under each block, a soft
 * shadow on the ground and a faint glow behind. This is artwork, so its
 * colours live here rather than in the theme tokens.
 *
 * `brandMarkSvg()` returns plain markup so the same mark is used by the React
 * component (app/components/brand-mark.tsx) and pasted into the static landing
 * page (public/home.html). If you change the blocks here, regenerate that copy:
 *   npx tsc lib/brand-mark.ts --outDir /tmp/bm && node -e "console.log(require('/tmp/bm/brand-mark.js').brandMarkSvg())"
 * Motion lives in globals.css (and its copy in home.html) under `.vv-mark`.
 * The favicon (app/icon.svg) is this cube assembled.
 */

type Tone = "cream" | "sage";
type Face = "top" | "left" | "right";

const COS30 = Math.sqrt(3) / 2;
const project = (x: number, y: number, z: number): [number, number] => [(x - y) * COS30, (x + y) / 2 - z];

/**
 * [x, y, z, tone, drift] — x runs to the lower right, y to the lower left, z up;
 * ±1 picks the octant. `drift` is how far (in block units) the block has come
 * loose at rest: most sit close, two have clearly come away, as in the
 * original artwork. The back-bottom block is never seen.
 */
const BLOCKS: [number, number, number, Tone, [number, number, number]][] = [
  [-1, -1, 1, "cream", [0, 0, 0.25]],
  [1, -1, 1, "sage", [0.55, -0.1, 0.35]],
  [-1, 1, 1, "sage", [0, 0.12, 0.05]],
  [1, -1, -1, "cream", [0.15, 0, -0.05]],
  [-1, 1, -1, "cream", [-0.1, 0.5, -0.25]],
  [1, 1, 1, "cream", [0.2, 0.2, 0.3]],
  [1, 1, -1, "sage", [0.1, 0.1, -0.1]],
];

/** Each face runs from a lit colour to a shaded one: [from, to]. */
const PAINT: Record<Tone, Record<Face, [string, string]>> = {
  cream: { top: ["#FBF4EC", "#EEE1D3"], left: ["#E3D7C6", "#CDBFAB"], right: ["#C4B7A3", "#A89A86"] },
  sage: { top: ["#A6B8A9", "#899C8C"], left: ["#647B69", "#4F6555"], right: ["#41574A", "#2F4337"] },
};

const r = (n: number) => Math.round(n * 1000) / 1000;
const h = 0.5;
type Corner = [number, number, number];
const FACES: Record<Face, Corner[]> = {
  top: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]],
  left: [[-h, h, -h], [h, h, -h], [h, h, h], [-h, h, h]],
  right: [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]],
};
/** The top face's two front edges, where light catches. */
const RIM: Corner[] = [[-h, h, h], [h, h, h], [h, -h, h]];

const points = (corners: Corner[], x: number, y: number, z: number) =>
  corners.map(([a, b, c]) => project(x * h + a, y * h + b, z * h + c).map(r).join(",")).join(" ");

function defs() {
  const grad = (id: string, [from, to]: [string, string], vertical: boolean) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 0.35}" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
  const faces = (Object.keys(PAINT) as Tone[]).flatMap((tone) =>
    (["top", "left", "right"] as Face[]).map((face) => grad(`vvm-${tone}-${face}`, PAINT[tone][face], face !== "top")),
  );
  return (
    `<defs>` +
    faces.join("") +
    // Gloss: a soft white sheen from the back of each top face, and a fainter one down the sides.
    `<linearGradient id="vvm-shine" x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.65" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="vvm-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.14"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="vvm-glow"><stop offset="0" stop-color="#F2E6DA" stop-opacity="0.55"/><stop offset="1" stop-color="#F2E6DA" stop-opacity="0"/></radialGradient>` +
    `<filter id="vvm-lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0.07" stdDeviation="0.07" flood-color="#0E1812" flood-opacity="0.35"/></filter>` +
    `<filter id="vvm-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.16"/></filter>` +
    `</defs>`
  );
}

function blockSvg([x, y, z, tone, drift]: (typeof BLOCKS)[number], i: number) {
  const [dx, dy] = project(...drift);
  const style = `--i:${i};--dx:${r(dx)}px;--dy:${r(dy)}px`;
  const face = (f: Face) => `<polygon fill="url(#vvm-${tone}-${f})" stroke="url(#vvm-${tone}-${f})" points="${points(FACES[f], x, y, z)}"/>`;
  return (
    `<g class="vv-block" style="${style}"><g filter="url(#vvm-lift)">` +
    face("top") + face("left") + face("right") +
    `<polygon class="vv-gloss" fill="url(#vvm-shine)" points="${points(FACES.top, x, y, z)}"/>` +
    `<polygon class="vv-gloss" fill="url(#vvm-sheen)" points="${points(FACES.left, x, y, z)}"/>` +
    `<polygon class="vv-gloss" fill="url(#vvm-sheen)" points="${points(FACES.right, x, y, z)}"/>` +
    `<polyline class="vv-rim" points="${points(RIM, x, y, z)}"/>` +
    `</g></g>`
  );
}

export function brandMarkSvg(): string {
  // Painter's order: blocks further from the viewer are drawn first.
  const ordered = BLOCKS.slice().sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  return (
    `<svg class="vv-mark" viewBox="-2.6 -2.6 5.2 5.2" aria-hidden="true" focusable="false">` +
    defs() +
    // Transparent backing so the gaps between loose blocks still count as hovering the mark.
    `<rect class="vv-hit" x="-2.6" y="-2.6" width="5.2" height="5.2"/>` +
    `<circle class="vv-glow" cx="0" cy="0" r="2.5" fill="url(#vvm-glow)"/>` +
    `<ellipse class="vv-ground" cx="0" cy="2.05" rx="1.75" ry="0.38" fill="#0E1812" filter="url(#vvm-blur)"/>` +
    ordered.map(blockSvg).join("") +
    `</svg>`
  );
}
