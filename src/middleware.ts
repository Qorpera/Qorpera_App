import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/registration-status",
  "/api/auth/logout",
  "/api/auth/check",
  "/api/invite/",
  "/api/health",
  "/login",
  "/register",
  "/invite",
  "/setup",
];

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals and static assets
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next());
  }

  // CSRF protection for mutation requests
  if (!SAFE_METHODS.includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");

    if (origin && host) {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return new NextResponse("CSRF validation failed", { status: 403 });
      }
    }
  }

  // Check for session cookie (just existence — full validation in getSessionUser)
  const sessionCookie = req.cookies.get("session_token");
  if (!sessionCookie?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return addSecurityHeaders(NextResponse.redirect(url));
  }

  return addSecurityHeaders(NextResponse.next());
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://api.openai.com https://api.anthropic.com",
    "frame-ancestors 'none'",
  ].join('; '));

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
