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
  const oauthReturn = cookieStore.get("dynamics_bc_oauth_return")?.value;
  cookieStore.delete("dynamics_bc_oauth_return");
  let returnBase = "/account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}dynamics-bc=error&reason=missing_params`, APP_BASE),
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("dynamics_bc_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}dynamics-bc=error&reason=invalid_state`, APP_BASE),
    );
  }
  cookieStore.delete("dynamics_bc_oauth_state");

  const clientId = process.env.DYNAMICS_BC_CLIENT_ID;
  const clientSecret = process.env.DYNAMICS_BC_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}dynamics-bc=error&reason=server_config`, APP_BASE),
    );
  }

  // Exchange code for tokens
  const tokenResp = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${APP_BASE}/api/connectors/dynamics-bc/callback`,
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://api.businesscentral.dynamics.com/.default offline_access",
      }),
    },
  );

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[dynamics-bc-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}dynamics-bc=error&reason=token_exchange`, APP_BASE),
    );
  }

  const tokens = await tokenResp.json();
  const accessToken = tokens.access_token as string;
  const refreshToken = tokens.refresh_token as string;
  const expiresIn = (tokens.expires_in as number) || 3600;
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Extract tenant_id from id_token JWT (just decode, no signature verification)
  let tenantId = "";
  try {
    const idToken = tokens.id_token as string;
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
    tenantId = payload.tid;
  } catch (err) {
    console.error("[dynamics-bc-oauth] Failed to extract tenant_id from id_token:", err);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}dynamics-bc=error&reason=tenant_extraction`, APP_BASE),
    );
  }

  // Fetch companies to auto-select default
  let companyId = "";
  let companyName = "";
  try {
    const companiesResp = await fetch(
      `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/Production/api/v2.0/companies`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (companiesResp.ok) {
      const companiesData = await companiesResp.json();
      const firstCompany = companiesData.value?.[0];
      if (firstCompany) {
        companyId = firstCompany.id;
        companyName = firstCompany.name || firstCompany.displayName || "Unknown";
      }
    }
  } catch (err) {
    console.error("[dynamics-bc-oauth] Failed to fetch companies:", err);
  }

  if (!companyId) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}dynamics-bc=error&reason=no_companies`, APP_BASE),
    );
  }

  const config = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expiry: tokenExpiry,
    tenant_id: tenantId,
    environment: "Production",
    company_id: companyId,
    company_name: companyName,
  };

  // Upsert: company connector
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: null, provider: "dynamics-bc", ...ACTIVE_CONNECTOR },
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
        name: `Dynamics 365 BC (${companyName})`,
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: null,
        provider: "dynamics-bc",
        name: `Dynamics 365 BC (${companyName})`,
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("dynamics-bc");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[dynamics-bc-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}dynamics-bc=connected`, APP_BASE),
  );
}
