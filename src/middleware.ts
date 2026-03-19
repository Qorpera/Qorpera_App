import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/registration-status",
  "/api/auth/logout",
  "/api/auth/check",
  "/api/auth/hubspot/callback",
  "/api/auth/stripe/callback",
  "/api/connectors/google/callback",
  "/api/connectors/slack/callback",
  "/api/connectors/microsoft/callback",
  "/api/webhooks/",
  "/api/cron/",
  "/api/invite/",
  "/api/health",
  "/login",
  "/register",
  "/invite",
];

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals and static assets
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // CSRF protection for mutation requests — checked BEFORE public path bypass.
  // Webhooks are exempt (external services don't send Origin headers).
  if (!SAFE_METHODS.includes(req.method) && !pathname.startsWith("/api/webhooks")) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");

    if (!origin) {
      return new NextResponse("CSRF validation failed: missing origin", { status: 403 });
    }

    if (host) {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return new NextResponse("CSRF validation failed", { status: 403 });
      }
    }
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next());
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
