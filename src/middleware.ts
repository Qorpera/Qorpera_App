import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/setup", "/api/auth"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static assets
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = req.cookies.get("qorpera_session");
  if (!sessionCookie?.value) {
    // API routes: let through — getOperatorId() will redirect server-side
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }
    // Page routes: redirect to login
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Cookie exists — let the request through
  // Actual session validation happens in getOperatorId() on each page/route
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
