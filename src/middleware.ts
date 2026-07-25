/**
 * Next.js Edge Middleware — route protection.
 *
 * All /dashboard/* routes require an active ct_session cookie.
 * Public routes (login, register, forgot-password, landing, API auth) are
 * always accessible. The rest redirect to /login with a `next` param so the
 * user is sent back after authenticating.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *   - _next/static / _next/image (Next.js internals)
     *   - favicon.ico, robots.txt, sitemap.xml
     *   - /login, /register, /forgot-password, /reset-password (public auth pages)
     *   - / (landing page)
     *   - /api/auth/* (auth API routes)
     *   - /dashboards/shared/* (public shared-dashboard token links)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|login|register|forgot-password|reset-password|api/auth|dashboards/shared).*)",
  ],
};

// Routes the landing page lives at — do not redirect these
const PUBLIC_PATHS = new Set(["/", "/pricing", "/features", "/about", "/demo"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Landing and marketing pages are always public
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // API routes — let individual handlers enforce auth, except /api/auth/*
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Check for a session cookie
  const session = request.cookies.get("ct_session")?.value;

  // Demo mode cookie — users who clicked "Explore Demo" are allowed in
  const demoMode = request.cookies.get("ct_demo")?.value === "1";

  if (!session && !demoMode) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Add security headers to every response
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}
