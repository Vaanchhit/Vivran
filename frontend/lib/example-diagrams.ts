/**
 * Diagrams for intuitive examples, drawn by us.
 *
 * Every label is text we place ourselves, so nothing can be misspelled the way
 * an image model misspells it, and the same functions give the on-screen version
 * (theme colours) and a standalone SVG to download (fixed colours). Output is a
 * string of SVG with every piece of text escaped, so it is safe to inject.
 */

export interface Palette {
  ink: string;      // main text
  muted: string;    // secondary text
  line: string;     // connectors and borders
  card: string;     // box fill
  accent: string;   // emphasis
  positive: string; // bars that add
  negative: string; // bars that take away
}

/** Theme colours for the page (CSS variables, so light and dark both work). */
export const THEME_PALETTE: Palette = {
  ink: "var(--text-1)",
  muted: "var(--text-2)",
  line: "var(--border-hi)",
  card: "var(--bg-card)",
  accent: "var(--accent-1)",
  positive: "var(--ok)",
  negative: "var(--err)",
};

/** Fixed colours for a downloaded file, which has no theme to inherit. */
export const FILE_PALETTE: Palette = {
  ink: "#1c1a17",
  muted: "#6b655c",
  line: "#cfc8bb",
  card: "#ffffff",
  accent: "#c6431e",
  positive: "#1a7f5a",
  negative: "#b3341a",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Word-wraps to at most `chars` per line and `maxLines` lines (an ellipsis marks anything cut). */
export function wrap(text: string, chars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > chars) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S{0,3}$/, "") + "…";
    return cut;
  }
  return lines;
}

const FONT = "font-family:Inter,system-ui,sans-serif";

function textBlock(x: number, y: number, lines: string[], size: number, fill: string, weight = 400, anchor = "start", lead = 1.35): string {
  const tspans = lines
    .map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lead}">${esc(l)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" style="${FONT};font-size:${size}px;font-weight:${weight};fill:${fill}" text-anchor="${anchor}">${tspans}</text>`;
}

/**
 * Two columns, "In the story" and "In the concept", with a line from each thing
 * to the idea it stands for. The picture of the mapping the explanation rests on.
 */
export function mappingSvg(mapping: { term: string; meaning: string; in_story: string }[], p: Palette): string {
  const rowH = 78, gap = 12, w = 640, colW = 250, left = 12, right = w - colW - 12;
  const h = 40 + mapping.length * (rowH + gap);
  const parts: string[] = [];
  parts.push(textBlock(left, 20, ["IN THE STORY"], 10.5, p.muted, 700));
  parts.push(textBlock(right, 20, ["IN THE CONCEPT"], 10.5, p.muted, 700));
  mapping.forEach((m, i) => {
    const y = 34 + i * (rowH + gap);
    const mid = y + rowH / 2;
    parts.push(`<path d="M${left + colW} ${mid} C ${left + colW + 70} ${mid}, ${right - 70} ${mid}, ${right} ${mid}" style="fill:none;stroke:${p.accent};stroke-width:1.6;stroke-dasharray:4 3"/>`);
    parts.push(`<circle cx="${left + colW}" cy="${mid}" r="3.5" style="fill:${p.accent}"/><circle cx="${right}" cy="${mid}" r="3.5" style="fill:${p.accent}"/>`);
    parts.push(`<rect x="${left}" y="${y}" width="${colW}" height="${rowH}" rx="10" style="fill:${p.card};stroke:${p.line}"/>`);
    parts.push(textBlock(left + 14, y + 26, wrap(m.in_story, 32, 3), 13, p.ink, 500));
    parts.push(`<rect x="${right}" y="${y}" width="${colW}" height="${rowH}" rx="10" style="fill:${p.card};stroke:${p.line}"/>`);
    parts.push(textBlock(right + 14, y + 24, wrap(m.term, 30, 1), 13.5, p.accent, 700));
    parts.push(textBlock(right + 14, y + 44, wrap(m.meaning, 36, 2), 11, p.muted, 400, "start", 1.3));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Which part of the story stands for which part of the concept" width="100%">${parts.join("")}</svg>`;
}

/**
 * The worked example as bars: each input, then the value after each step, ending
 * at the result. The values are the server's computed ones, never the model's.
 * Inputs are neutral (a cost is not "good" or "bad" by itself); computed values
 * are the accent colour, so the eye lands on what the example builds to.
 */
export function waterfallSvg(
  worked: {
    inputs: { name: string; label: string; value: number }[];
    steps: { name: string; label: string; expr: string; value: number }[];
    result: { label: string; value: number };
  },
  p: Palette,
): string {
  const bars: { label: string; value: number; computed: boolean }[] = [
    ...worked.inputs.map((i) => ({ label: i.label, value: i.value, computed: false })),
    ...worked.steps.map((s) => ({ label: s.label, value: s.value, computed: true })),
  ];
  const w = 640, h = 290, padL = 12, padR = 12, top = 24, bottom = 74;
  const posMax = Math.max(0, ...bars.map((b) => b.value));
  const negMax = Math.max(0, ...bars.map((b) => -b.value));
  const scale = (h - top - bottom) / (posMax + negMax || 1);
  const baseline = top + posMax * scale;
  const colW = (w - padL - padR) / bars.length;
  const barW = Math.min(64, colW * 0.62);
  const parts: string[] = [`<line x1="${padL}" x2="${w - padR}" y1="${baseline}" y2="${baseline}" style="stroke:${p.line}"/>`];
  bars.forEach((b, i) => {
    const cx = padL + colW * i + colW / 2;
    const height = Math.max(2, Math.abs(b.value) * scale);
    const y = b.value >= 0 ? baseline - height : baseline;
    parts.push(`<rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${height}" rx="5" style="fill:${b.computed ? p.accent : p.muted};opacity:${b.computed ? 1 : 0.5}"/>`);
    parts.push(textBlock(cx, b.value >= 0 ? y - 7 : y + height + 15, [String(Math.round(b.value * 100) / 100)], 11.5, p.ink, 700, "middle"));
    parts.push(textBlock(cx, h - bottom + 24, wrap(b.label, Math.max(8, Math.floor(colW / 6.2)), 3), 10.5, p.muted, 400, "middle", 1.25));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="The worked example as bars, ending at ${esc(worked.result.label)}: ${worked.result.value}" width="100%">${parts.join("")}</svg>`;
}

/** A standalone file of the same drawing, with fixed colours, ready to save. */
export function downloadable(svg: string): string {
  return svg.replace('<svg ', '<svg style="background:#ffffff" ');
}
