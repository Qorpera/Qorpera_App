import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limiter";

const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/registration-status",
  "/api/auth/logout",
  "/api/auth/check",
  "/api/auth/hubspot/callback",
  "/api/auth/stripe/callback",
  "/api/auth/pipedrive/callback",
  "/api/auth/salesforce/callback",
  "/api/auth/intercom/callback",
  "/api/auth/zendesk/callback",
  "/api/connectors/google/callback",
  "/api/connectors/google-workspace/callback",
  "/api/connectors/google-ads/callback",
  "/api/connectors/shopify/callback",
  "/api/connectors/linkedin/callback",
  "/api/connectors/meta-ads/callback",
  "/api/connectors/slack/callback",
  "/api/connectors/microsoft/callback",
  "/api/connectors/dynamics-bc/callback",
  "/api/connectors/xero/callback",
  "/api/connectors/fortnox/callback",
  "/api/connectors/vismanet/callback",
  "/api/connectors/exact-online/callback",
  "/api/connectors/sage/callback",
  "/api/connectors/monday/callback",
  "/api/connectors/asana/callback",
  "/api/connectors/jira/callback",
  "/api/webhooks/",
  "/api/cron/",
  "/api/invite/",
  "/api/health",
  "/login",
  "/register",
  "/terms",
  "/privacy",
  "/dpa",
  "/invite",
];

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals and static assets (images, icons, etc.)
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|gif)$/)) {
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

  // Rate limiting for API routes — skip session/auth-check routes so
  // rate-limited users don't get false "not authenticated" redirects
  const RATE_LIMIT_EXEMPT = ["/api/auth/check", "/api/auth/me", "/api/auth/logout"];
  if (pathname.startsWith("/api/") && !RATE_LIMIT_EXEMPT.some(p => pathname === p)) {
    const tier = pathname.startsWith("/api/auth/") ? "auth" as const
      : pathname.startsWith("/api/billing/") ? "billing" as const
      : pathname.startsWith("/api/copilot/") ? "copilot" as const
      : "global" as const;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const result = await rateLimit(ip, tier);

    if (!result.success) {
      const retryAfter = String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)));
      return addSecurityHeaders(new NextResponse(
        JSON.stringify({ error: "Too many requests", retryAfter }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfter,
          },
        },
      ));
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
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://*.ingest.sentry.io",
    "frame-ancestors 'none'",
  ].join('; '));

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
