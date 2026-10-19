// ─────────────────────────────────────────────────────────────
// Meme slides. A meme is a picture the teacher's class will actually
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
import { createHmac, timingSafeEqual } from "node:crypto";
import { memeFormat, memeLines, escapeLine } from "./meme-core";
export * from "./meme-core";

const BASE = () => (process.env.MEMEGEN_BASE_URL || "https://api.memegen.link").replace(/\/+$/, "");
/** Where the browser asks for a meme image. Same origin; signed; see app/api/meme/route.ts. */
export const MEME_PROXY = "/api/meme";

const secret = () => process.env.MEME_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-only-meme-secret";
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 24);

/** The upstream image URL (server side only). */
export const upstreamUrl = (template: string, lines: string[], width = 900) =>
  `${BASE()}/images/${template}/${lines.map(escapeLine).join("/")}.png?width=${width}`;

/** The same-origin signed URL a slide's <img> points at. */
export function memeSrc(template: unknown, lines: unknown): string | null {
  const l = memeLines(template, lines);
  if (!l) return null;
  const q = new URLSearchParams({ t: String(template), l: JSON.stringify(l) });
  q.set("s", sign(`${template}|${JSON.stringify(l)}`));
  return `${MEME_PROXY}?${q.toString()}`;
}

/** Proxy side: verify the signature and the allowlist, return the upstream URL or null. */
export function verifyMemeQuery(t: string | null, l: string | null, s: string | null): string | null {
  if (!t || !l || !s || !memeFormat(t)) return null;
  const want = Buffer.from(sign(`${t}|${l}`)), got = Buffer.from(s);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let lines: unknown;
  try { lines = JSON.parse(l); } catch { return null; }
  const clean = memeLines(t, lines);
  return clean ? upstreamUrl(t, clean) : null;
}

