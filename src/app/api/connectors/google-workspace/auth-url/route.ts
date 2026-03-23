import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * POST /api/connectors/google-workspace/auth-url
 *
 * Generates a Google OAuth URL with combined scopes for Gmail + Drive + Calendar + Sheets.
 * Single consent screen → one connector with all capabilities.
 * Uses the same GCP project credentials as the existing Google connector.
 */
export async function POST() {
  const su = await getSessionUser();
  if (!su) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 503 });
  }

  const SCOPES = [
    // Gmail
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    // Drive
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/presentations",
    // Calendar
    "https://www.googleapis.com/auth/calendar",
  ];

  // Generate CSRF state — same pattern as existing Google OAuth
  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("gws_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  // Store return path so callback redirects to onboarding
  cookieStore.set("gws_oauth_return", "onboarding", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${APP_BASE}/api/connectors/google-workspace/callback`,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.json({ url });
}
