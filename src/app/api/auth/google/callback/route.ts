import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) {
    return NextResponse.redirect(new URL("/login", APP_BASE));
  }
  const { operatorId } = su;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();

  // Determine return destination
  const oauthReturn = cookieStore.get("oauth_return")?.value;
  cookieStore.delete("oauth_return");
  let returnBase = "/settings?tab=connections";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  } else if (oauthReturn?.startsWith("department:")) {
    const deptId = oauthReturn.replace("department:", "");
    returnBase = `/map/${deptId}`;
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}google=error&reason=${error}`, APP_BASE)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}google=error&reason=missing_params`, APP_BASE)
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("google_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}google=error&reason=invalid_state`, APP_BASE)
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
      redirect_uri: `${APP_BASE}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("Google token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}google=error&reason=token_exchange`, APP_BASE)
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
      config: encrypt(JSON.stringify(config)),
    },
  });

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}google=connected`, APP_BASE)
  );
}
