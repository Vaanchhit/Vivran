import { type NextRequest, NextResponse } from "next/server";

/**
 * Route guards only — a lightweight redirect UX, not a security boundary.
 *
 * This deliberately does NOT construct a `@supabase/supabase-js` client here.
 * `createServerClient`/`createClient` unconditionally builds the full client
 * (including its WebSocket-based Realtime module), which pulls in Node-only
 * code incompatible with the Edge Runtime middleware always runs under —
 * verified live: it throws `ReferenceError: __dirname is not defined` in
 * Vercel's production Edge sandbox (does not reproduce in `next dev`/`next
 * start` locally, which use a more permissive Edge shim).
 *
 * Instead we just check for the presence of Supabase's session cookie
 * (`sb-<project-ref>-auth-token`, chunked as `...-auth-token.0`/`.1` when
 * large). This is intentionally not cryptographic verification — a forged
 * cookie only gets past this redirect, not past real auth: every actual
 * Supabase query is still gated by RLS, and every backend API call is still
 * gated by real JWT verification (see backend/app/core/auth.py). Token
 * refresh happens client-side via the browser's supabase-js client
 * (autoRefreshToken, on by default), so nothing is lost by not refreshing
 * here.
 */
function hasSupabaseSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const authenticated = hasSupabaseSession(request);

  // Authenticated users skip the auth screens.
  if (authenticated && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/teacher";
    return NextResponse.redirect(url);
  }

  // Teacher workspace is private.
  if (!authenticated && pathname.startsWith("/teacher")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Back on the default Edge runtime. `runtime: "nodejs"` was tried here to
  // work around an Edge-sandbox `__dirname` crash, but that traded it for a
  // worse, confirmed-via-runtime-logs failure: Next.js 14.2.x's middleware
  // compiler emits `/var/task/middleware.js` with raw ESM `import` syntax,
  // which Vercel's Node.js middleware runtime loads as CommonJS — an
  // immediate `SyntaxError: Cannot use import statement outside a module`
  // before this file's own code ever runs. That's a Next.js/Vercel
  // bundling-target mismatch, not something fixable from application code.
  // Reverting to Edge (the actually-supported path for this Next.js
  // version) now that Next.js has been patched 14.2.15 -> 14.2.35 for the
  // React2Shell security advisories — worth re-testing since the original
  // __dirname crash was never explained and may have been fixed along with
  // it. If it recurs, the fix has to be either dropping this file's already
  // minimal Node-API-free logic further, or waiting on a Next.js patch that
  // properly supports the newer runtime option.
  matcher: [
    /*
     * Run on everything except static assets, favicon, and Supabase/OAuth
     * callback internals that Next already handles.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};