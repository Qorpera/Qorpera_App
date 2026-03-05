import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?tab=connections&google=error&reason=${error}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings?tab=connections&google=error&reason=missing_params", req.url)
    );
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/settings?tab=connections&google=error&reason=invalid_state", req.url)
    );
  }

  // Clear the state cookie
  cookieStore.delete("google_oauth_state");

  // Exchange code for tokens
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback",
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("Google token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL("/settings?tab=connections&google=error&reason=token_exchange", req.url)
    );
  }

  const tokens = await tokenResp.json();

  // Create a pending SourceConnector with tokens stored in config
  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    spreadsheet_id: "", // to be filled by user
  };

  await prisma.sourceConnector.create({
    data: {
      operatorId,
      provider: "google-sheets",
      name: "",
      status: "pending",
      config: JSON.stringify(config),
    },
  });

  return NextResponse.redirect(
    new URL("/settings?tab=connections&google=connected", req.url)
  );
}
