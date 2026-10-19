// Same-origin meme images. A slide's <img> points here, never at the meme host:
// the browser (a student laptop in a classroom) contacts only Vivran, and the
// URL carries an HMAC over the template and captions, so it cannot be edited
// into an arbitrary image. The upstream is memegen (MIT, self-hostable via
// MEMEGEN_BASE_URL). Failures return a tiny SVG so a slide never shows a broken icon.
import { verifyMemeQuery } from "@/lib/slidekit/meme";

export const runtime = "nodejs";

const FALLBACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="#F3EEE5"/><text x="320" y="205" font-family="Arial" font-size="22" fill="#6B6258" text-anchor="middle">Meme unavailable. Reload to try again.</text></svg>`;
const svg = (status: number) => new Response(FALLBACK, { status, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });

const MAX_BYTES = 2_000_000;
// Same captions → same picture, so the last few hundred are kept in memory: a
// class opening the deck at once costs the meme host one fetch, not forty.
const CACHE = new Map<string, ArrayBuffer>();
const CACHE_MAX = 300;
const png = (buf: ArrayBuffer) => new Response(buf, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800, immutable" } });

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const upstream = verifyMemeQuery(q.get("t"), q.get("l"), q.get("s"));
  if (!upstream) return svg(400);
  const hit = CACHE.get(upstream);
  if (hit) return png(hit);
  try {
    const res = await fetch(upstream, { signal: AbortSignal.timeout(15000), redirect: "error", headers: { Accept: "image/png" } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/png")) return svg(502);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return svg(502);
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
    CACHE.set(upstream, buf);
    return png(buf);
  } catch {
    return svg(502);
  }
}
