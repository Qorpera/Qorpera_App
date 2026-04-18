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
  const oauthReturn = cookieStore.get("monday_oauth_return")?.value;
  cookieStore.delete("monday_oauth_return");
  let returnBase = "/settings?tab=account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}monday=error&reason=missing_params`, APP_BASE),
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("monday_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}monday=error&reason=invalid_state`, APP_BASE),
    );
  }
  cookieStore.delete("monday_oauth_state");

  const clientId = process.env.MONDAY_CLIENT_ID;
  const clientSecret = process.env.MONDAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}monday=error&reason=server_config`, APP_BASE),
    );
  }

  // Exchange code for access token
  const tokenResp = await fetch("https://auth.monday.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${APP_BASE}/api/connectors/monday/callback`,
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[monday-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}monday=error&reason=token_exchange`, APP_BASE),
    );
  }

  const tokens = await tokenResp.json();
  const accessToken = tokens.access_token as string;

  const config = {
    access_token: accessToken,
  };

  // Upsert: company connector
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: null, provider: "monday", ...ACTIVE_CONNECTOR },
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
        name: "Monday.com",
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: null,
        provider: "monday",
        name: "Monday.com",
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("monday");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[monday-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}monday=connected`, APP_BASE),
  );
}
