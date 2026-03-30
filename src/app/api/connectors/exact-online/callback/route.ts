import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encryptConfig } from "@/lib/config-encryption";
import { registerConnectorCapabilities } from "@/lib/connectors/capability-registration";
import { getProvider } from "@/lib/connectors/registry";
import { ACTIVE_CONNECTOR } from "@/lib/connector-filters";

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

  const cookieStore = await cookies();

  // Determine return destination
  const oauthReturn = cookieStore.get("exact_oauth_return")?.value;
  cookieStore.delete("exact_oauth_return");
  let returnBase = "/account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}exact-online=error&reason=missing_params`, APP_BASE),
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("exact_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}exact-online=error&reason=invalid_state`, APP_BASE),
    );
  }
  cookieStore.delete("exact_oauth_state");

  const clientId = process.env.EXACT_CLIENT_ID;
  const clientSecret = process.env.EXACT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}exact-online=error&reason=server_config`, APP_BASE),
    );
  }

  // Exchange code for tokens
  const tokenResp = await fetch(
    "https://start.exactonline.nl/api/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${APP_BASE}/api/connectors/exact-online/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
  );

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[exact-online-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}exact-online=error&reason=token_exchange`, APP_BASE),
    );
  }

  const tokens = await tokenResp.json();
  const accessToken = tokens.access_token as string;
  const refreshToken = tokens.refresh_token as string;
  const expiresIn = (tokens.expires_in as number) || 3600;

  // Fetch current division from /Me
  let division = "";
  try {
    const meResp = await fetch(
      "https://start.exactonline.nl/api/v1/current/Me?$select=CurrentDivision",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    if (meResp.ok) {
      const meData = await meResp.json();
      division = String(meData?.d?.results?.[0]?.CurrentDivision ?? "");
    }
  } catch (err) {
    console.error("[exact-online-oauth] Failed to fetch division:", err);
  }

  if (!division) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}exact-online=error&reason=no_division`, APP_BASE),
    );
  }

  const config = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expiry: Date.now() + expiresIn * 1000,
    division,
  };

  // Upsert connector
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: null, provider: "exact-online", ...ACTIVE_CONNECTOR },
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
        name: "Exact Online",
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: null,
        provider: "exact-online",
        name: "Exact Online",
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("exact-online");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[exact-online-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}exact-online=connected`, APP_BASE),
  );
}
