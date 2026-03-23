import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encryptConfig } from "@/lib/config-encryption";
import { registerConnectorCapabilities } from "@/lib/connectors/capability-registration";
import { getProvider } from "@/lib/connectors/registry";
import { ACTIVE_CONNECTOR } from "@/lib/connector-filters";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * GET /api/connectors/google-workspace/callback
 *
 * Google redirects here after the Workspace mega-scope consent.
 * Creates/updates a single "google" SourceConnector with full Workspace scopes.
 * Follows the exact same pattern as the existing Google callback.
 */
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

  // Determine return path
  const returnPath = cookieStore.get("gws_oauth_return")?.value;
  cookieStore.delete("gws_oauth_return");
  const returnBase = returnPath === "onboarding" ? "/onboarding" : "/account";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}?workspace=error&reason=${encodeURIComponent(error)}`, APP_BASE),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}?workspace=error&reason=missing_params`, APP_BASE),
    );
  }

  // CSRF validation
  const storedState = cookieStore.get("gws_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}?workspace=error&reason=invalid_state`, APP_BASE),
    );
  }
  cookieStore.delete("gws_oauth_state");

  // Verify credentials
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}?workspace=error&reason=server_config`, APP_BASE),
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
      redirect_uri: `${APP_BASE}/api/connectors/google-workspace/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[google-workspace-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}?workspace=error&reason=token_exchange`, APP_BASE),
    );
  }

  const tokens = await tokenResp.json();
  const grantedScopes = (tokens.scope as string || "").split(" ").filter(Boolean);

  // Fetch Gmail profile for email address
  let emailAddress = "";
  try {
    const profileResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (profileResp.ok) {
      const profile = await profileResp.json();
      emailAddress = profile.emailAddress || "";
    }
  } catch (err) {
    console.warn("[google-workspace-oauth] Failed to fetch profile:", err);
  }

  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    email_address: emailAddress,
    scopes: grantedScopes,
  };

  // Upsert: single "google" connector per user (same as existing flow)
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
        name: emailAddress ? `Google Workspace (${emailAddress})` : "Google Workspace",
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: user.id,
        provider: "google",
        name: emailAddress ? `Google Workspace (${emailAddress})` : "Google Workspace",
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
      console.error("[google-workspace-oauth] Failed to register capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}?workspace=connected`, APP_BASE),
  );
}
