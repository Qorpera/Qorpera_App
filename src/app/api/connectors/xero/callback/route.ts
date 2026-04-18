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
  const oauthReturn = cookieStore.get("xero_oauth_return")?.value;
  cookieStore.delete("xero_oauth_return");
  let returnBase = "/settings?tab=account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}xero=error&reason=missing_params`, APP_BASE)
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("xero_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}xero=error&reason=invalid_state`, APP_BASE)
    );
  }
  cookieStore.delete("xero_oauth_state");

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}xero=error&reason=server_config`, APP_BASE)
    );
  }

  // Exchange code for tokens
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenResp = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${APP_BASE}/api/connectors/xero/callback`,
    }).toString(),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[xero-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}xero=error&reason=token_exchange`, APP_BASE)
    );
  }

  const tokens = await tokenResp.json();
  const accessToken = tokens.access_token as string;
  const refreshToken = tokens.refresh_token as string;
  const expiresIn = tokens.expires_in as number;

  // Fetch tenant ID from connections endpoint
  let tenantId: string | undefined;
  try {
    const connResp = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (connResp.ok) {
      const connections = await connResp.json();
      tenantId = connections[0]?.tenantId;
    }
  } catch {
    // tenant_id will be undefined — testConnection will fail later
  }

  if (!tenantId) {
    console.error("[xero-oauth] No tenant found in Xero connections");
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}xero=error&reason=no_tenant`, APP_BASE)
    );
  }

  const config = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expiry: Date.now() + expiresIn * 1000,
    tenant_id: tenantId,
  };

  // Upsert: company connector
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: null, provider: "xero", ...ACTIVE_CONNECTOR },
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
        name: "Xero",
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: null,
        provider: "xero",
        name: "Xero",
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("xero");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[xero-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}xero=connected`, APP_BASE)
  );
}
