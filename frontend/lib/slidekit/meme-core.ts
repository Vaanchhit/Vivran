// ─────────────────────────────────────────────────────────────
// Meme slides (pure part: formats, captions, escaping; safe to import anywhere). A meme is a picture the teacher's class will actually
// look at, so the safeguards live here, in code, not in the prompt:
//   - only formats in memes.json can be used (cartoon / animal ones);
//   - captions are cleaned and length-capped before they become a URL;
//   - the image is fetched through our own signed proxy
//     (app/api/meme), never hot-linked from the browser, so a student
//     laptop never contacts the meme host and a URL can't be rewritten.
// Reddit is deliberately not a source: its API needs pre-approval and a
// commercial agreement for products. memegen (MIT, github.com/jacebrowning
// /memegen) renders the image from a template id and caption text, and
// can be self-hosted by setting MEMEGEN_BASE_URL.
// ─────────────────────────────────────────────────────────────
import data from "./memes.json";

export interface MemeFormat { id: string; name: string; lines: number; use: string }
export const MEME_FORMATS: readonly MemeFormat[] = data.formats;
export const MEME_IDS = MEME_FORMATS.map(f => f.id) as [string, ...string[]];
export const memeFormat = (id: unknown) => MEME_FORMATS.find(f => f.id === id);

/** Compact catalogue for the prompt: the model picks an id, code does the rest. */
export const memeCatalogue = () =>
  MEME_FORMATS.map(f => `${f.id} (${f.lines} line${f.lines > 1 ? "s" : ""}): ${f.use}`).join("\n");

const BAD_WORDS = /\b(fuck\w*|shit\w*|bitch\w*|cunt|nigg\w*|slut|whore|dick|cock|pussy|rape\w*|porn\w*|nazi)\b/i;

/** Caption text safe to put on a classroom wall: short, single-line, no markup, no profanity. */
export function cleanCaption(raw: unknown, max = 70): string {
  const t = String(raw ?? "").replace(/<[^>]*>/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return BAD_WORDS.test(t) ? "" : t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** memegen's path escapes: https://github.com/jacebrowning/memegen#special-characters */
export function escapeLine(s: string): string {
  const t = s.replace(/…/g, "...");
  return encodeURIComponent(
    t.replace(/_/g, "__").replace(/-/g, "--").replace(/ /g, "_").replace(/\?/g, "~q").replace(/%/g, "~p")
      .replace(/#/g, "~h").replace(/\//g, "~s").replace(/\\/g, "~b").replace(/"/g, "''").replace(/&/g, "~a")
      .replace(/</g, "~l").replace(/>/g, "~g"),
  ).replace(/%7E/gi, "~").replace(/%27/g, "'").replace(/%5F/gi, "_");
}

/** Lines padded or trimmed to the format's count, cleaned. Null when the format is unknown or no caption survives. */
export function memeLines(template: unknown, lines: unknown): string[] | null {
  const fmt = memeFormat(template);
  if (!fmt || !Array.isArray(lines)) return null;
  const clean = lines.map(l => cleanCaption(l)).filter(Boolean).slice(0, fmt.lines);
  if (!clean.length) return null;
  while (clean.length < fmt.lines) clean.push(clean[clean.length - 1]); // never invent words; repeat the last caption
  return clean;
}

/** Alt text / speaker-note description of what the meme shows. */
export const memeAlt = (template: string, lines: string[]) => `Meme (${template}): ${lines.join(" / ")}`;
