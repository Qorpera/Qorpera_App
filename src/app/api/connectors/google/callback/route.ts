import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encryptConfig } from "@/lib/config-encryption";
import { registerConnectorCapabilities } from "@/lib/connectors/capability-registration";
import { getProvider } from "@/lib/connectors/registry";
import { ACTIVE_CONNECTOR } from "@/lib/connector-filters";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const REQUESTED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/calendar",
];

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) {
    return NextResponse.redirect(new URL("/login", APP_BASE));
  }
  const { operatorId, user } = su;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();

  // Determine return destination
  const oauthReturn = cookieStore.get("google_oauth_return")?.value;
  cookieStore.delete("google_oauth_return");
  let returnBase = "/settings?tab=account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}google=error&reason=${encodeURIComponent(error)}`, APP_BASE)
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
  cookieStore.delete("google_oauth_state");

  // Verify env vars before token exchange
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[google-oauth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}google=error&reason=server_config`, APP_BASE)
    );
  }

  // Exchange code for tokens
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${APP_BASE}/api/connectors/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[google-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}google=error&reason=token_exchange`, APP_BASE)
    );
  }

  const tokens = await tokenResp.json();

  // Determine which scopes were actually granted
  const grantedScopes = (tokens.scope as string || "").split(" ").filter(Boolean);

  // Fetch Google profile for display name
  let emailAddress = "";
  try {
    const profileResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (profileResp.ok) {
      const profile = await profileResp.json();
      emailAddress = profile.emailAddress || "";
    }
  } catch (err) {
    console.warn("[google-oauth] Failed to fetch profile:", err);
  }

  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    email_address: emailAddress,
    scopes: grantedScopes.length > 0 ? grantedScopes : REQUESTED_SCOPES,
  };

  // Upsert: if user already has a Google connector, update it; otherwise create
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: user.id, provider: "google", ...ACTIVE_CONNECTOR },
  });

  let connectorId: string;
  if (existing) {
    await prisma.sourceConnector.update({
      where: { id: existing.id },
      data: {
        config: encryptConfig(config),
        status: "active",
        consecutiveFailures: 0,
        healthStatus: "healthy",
        lastError: null,
        lastHealthCheck: new Date(),
        name: emailAddress ? `Google (${emailAddress})` : "Google",
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: user.id,
        provider: "google",
        name: emailAddress ? `Google (${emailAddress})` : "Google",
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("google");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[google-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}google=connected`, APP_BASE)
  );
}
