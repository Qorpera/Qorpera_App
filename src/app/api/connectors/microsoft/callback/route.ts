import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const REQUESTED_SCOPES = [
  "Mail.Read",
  "Mail.Send",
  "Files.ReadWrite",
  "Calendars.Read",
  "ChannelMessage.Read.All",
  "User.Read",
  "offline_access",
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
  const oauthReturn = cookieStore.get("microsoft_oauth_return")?.value;
  cookieStore.delete("microsoft_oauth_return");
  let returnBase = "/account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}microsoft=error&reason=${encodeURIComponent(error)}`, APP_BASE)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}microsoft=error&reason=missing_params`, APP_BASE)
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("microsoft_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}microsoft=error&reason=invalid_state`, APP_BASE)
    );
  }
  cookieStore.delete("microsoft_oauth_state");

  // Verify env vars
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[microsoft-oauth] Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET");
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}microsoft=error&reason=server_config`, APP_BASE)
    );
  }

  // Exchange code for tokens
  const tokenResp = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${APP_BASE}/api/connectors/microsoft/callback`,
        grant_type: "authorization_code",
        scope: REQUESTED_SCOPES.join(" "),
      }),
    }
  );

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[microsoft-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}microsoft=error&reason=token_exchange`, APP_BASE)
    );
  }

  const tokens = await tokenResp.json();

  // Determine which scopes were actually granted
  const grantedScopes = (tokens.scope as string || "").split(" ").filter(Boolean);

  // Fetch profile
  let emailAddress = "";
  let displayName = "";
  try {
    const profileResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileResp.ok) {
      const profile = await profileResp.json();
      emailAddress = profile.mail || profile.userPrincipalName || "";
      displayName = profile.displayName || "";
    }
  } catch (err) {
    console.warn("[microsoft-oauth] Failed to fetch profile:", err);
  }

  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    email_address: emailAddress,
    display_name: displayName,
    scopes: grantedScopes.length > 0 ? grantedScopes : REQUESTED_SCOPES,
  };

  // Upsert: personal connector (userId set)
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: user.id, provider: "microsoft" },
  });

  if (existing) {
    await prisma.sourceConnector.update({
      where: { id: existing.id },
      data: {
        config: encrypt(JSON.stringify(config)),
        status: "active",
        consecutiveFailures: 0,
        name: emailAddress ? `Microsoft (${emailAddress})` : "Microsoft 365",
      },
    });
  } else {
    await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: user.id,
        provider: "microsoft",
        name: emailAddress ? `Microsoft (${emailAddress})` : "Microsoft 365",
        status: "active",
        config: encrypt(JSON.stringify(config)),
      },
    });
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}microsoft=connected`, APP_BASE)
  );
}
