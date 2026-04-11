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
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();

  const oauthReturn = cookieStore.get("oauth_return")?.value;
  cookieStore.delete("oauth_return");
  let returnBase = "/settings?tab=connections";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}pipedrive=error&reason=${encodeURIComponent(error)}`, APP_BASE),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}pipedrive=error&reason=missing_params`, APP_BASE),
    );
  }

  const storedState = cookieStore.get("pipedrive_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}pipedrive=error&reason=invalid_state`, APP_BASE),
    );
  }
  cookieStore.delete("pipedrive_oauth_state");

  const clientId = process.env.PIPEDRIVE_CLIENT_ID;
  const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}pipedrive=error&reason=server_config`, APP_BASE),
    );
  }

  const tokenResp = await fetch("https://oauth.pipedrive.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      code,
      redirect_uri: `${APP_BASE}/api/auth/pipedrive/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[pipedrive-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}pipedrive=error&reason=token_exchange`, APP_BASE),
    );
  }

  const tokens = await tokenResp.json();

  // Domain validation: fetch authenticated user's email from Pipedrive
  try {
    const apiDomain = tokens.api_domain || "https://api.pipedrive.com";
    const meResp = await fetch(`${apiDomain}/v1/users/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meResp.ok) {
      const meData = await meResp.json();
      const userEmail = meData.data?.email as string | undefined;
      if (userEmail) {
        const operator = await prisma.operator.findUnique({
          where: { id: operatorId },
          select: { companyDomain: true },
        });
        if (operator?.companyDomain) {
          const emailDomain = userEmail.split("@")[1]?.toLowerCase();
          if (emailDomain && emailDomain !== operator.companyDomain) {
            return NextResponse.redirect(
              new URL(`${returnBase}${sep}pipedrive=error&reason=domain_mismatch&domain=${encodeURIComponent(operator.companyDomain)}`, APP_BASE),
            );
          }
        } else {
          console.warn("[pipedrive-oauth] operator.companyDomain not set — skipping domain validation");
        }
      }
    }
  } catch (err) {
    console.warn("[pipedrive-oauth] Domain validation fetch failed, continuing:", err);
  }

  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };

  // Upsert: if operator already has a Pipedrive connector, update it; otherwise create
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "pipedrive", ...ACTIVE_CONNECTOR },
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
        provider: "pipedrive",
        name: "Pipedrive CRM",
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  const capProvider = getProvider("pipedrive");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[pipedrive-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}pipedrive=connected`, APP_BASE),
  );
}
