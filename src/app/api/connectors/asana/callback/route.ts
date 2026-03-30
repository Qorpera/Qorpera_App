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
  const oauthReturn = cookieStore.get("asana_oauth_return")?.value;
  cookieStore.delete("asana_oauth_return");
  let returnBase = "/settings?tab=connections";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}asana=error&reason=missing_params`, APP_BASE),
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("asana_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}asana=error&reason=invalid_state`, APP_BASE),
    );
  }
  cookieStore.delete("asana_oauth_state");

  const clientId = process.env.ASANA_CLIENT_ID;
  const clientSecret = process.env.ASANA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}asana=error&reason=server_config`, APP_BASE),
    );
  }

  // Exchange code for tokens
  const tokenResp = await fetch("https://app.asana.com/-/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${APP_BASE}/api/connectors/asana/callback`,
      code,
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[asana-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}asana=error&reason=token_exchange`, APP_BASE),
    );
  }

  const tokens = await tokenResp.json();

  // Fetch user info to get default workspace
  let workspaceGid = "";
  try {
    const meResp = await fetch("https://app.asana.com/api/1.0/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meResp.ok) {
      const meData = await meResp.json();
      workspaceGid = meData.data?.workspaces?.[0]?.gid ?? "";
    }
  } catch {
    // workspace_gid will be empty — user can set it manually later
  }

  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    workspace_gid: workspaceGid,
  };

  // Upsert: if operator already has an Asana connector, update it; otherwise create
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "asana", ...ACTIVE_CONNECTOR },
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
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        provider: "asana",
        name: "Asana",
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("asana");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[asana-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}asana=connected`, APP_BASE),
  );
}
