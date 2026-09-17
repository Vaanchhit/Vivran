import { type NextRequest, NextResponse } from "next/server";

/**
 * Route guards only — a lightweight redirect UX, not a security boundary.
 *
 * Root cause of the long-running `ReferenceError: __dirname is not defined`
 * crash, finally found by grepping the actual compiled
 * `.next/server/middleware.js` for `__dirname`: it was never our code, and
 * never Supabase specifically. `NextRequest.cookies` (i.e. `request.cookies`)
 * is backed by Next.js's internal, ncc-bundled copy of the `cookie` npm
 * package, whose module wrapper unconditionally evaluates
 * `__nccwpck_require__.ab = __dirname + "/"` as boilerplate the moment that
 * module is required — which happens the instant any code touches
 * `request.cookies`, regardless of what the surrounding code does. `__dirname`
 * doesn't exist in Vercel's Edge sandbox, so simply calling
 * `request.cookies.getAll()` here was enough to crash the function on its
 * own, independent of the Supabase client we removed from this file earlier.
 *
 * Fix: read the raw `Cookie` request header ourselves instead of going
 * through `NextRequest.cookies`, which sidesteps that internal dependency
 * entirely. Verified: `.next/server/middleware.js` no longer contains the
 * bundled `cookie` package or any `__dirname` reference after this change.
 *
 * This is intentionally not cryptographic verification — a forged cookie
 * only gets past this redirect, not past real auth: every actual Supabase
 * query is still gated by RLS, and every backend API call is still gated by
 * real JWT verification (see backend/app/core/auth.py). Token refresh
 * happens client-side via the browser's supabase-js client
 * (autoRefreshToken, on by default), so nothing is lost by not refreshing
 * here.
 */
function hasSupabaseSession(request: NextRequest): boolean {
  const cookieHeader = request.headers.get("cookie") ?? "";
  return cookieHeader
    .split(";")
    .some((pair) => {
      const name = pair.trim().split("=", 1)[0];
      return name.startsWith("sb-") && name.includes("-auth-token");
    });
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
  // Default Edge runtime. `runtime: "nodejs"` was tried at one point and
  // reverted — it hit a separate, real Next.js 14.2.x bug (the compiled
  // middleware.js uses ESM `import` syntax that Vercel's Node.js middleware
  // runtime can't load via its CommonJS loader). Edge is the correctly
  // supported runtime for this Next.js version, and the actual crash on
  // Edge (see hasSupabaseSession's comment above) is now fixed at the root.
  matcher: [
    /*
     * Run on everything except static assets, favicon, and Supabase/OAuth
     * callback internals that Next already handles.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};