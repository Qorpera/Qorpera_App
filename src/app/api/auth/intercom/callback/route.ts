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
      new URL(`${returnBase}${sep}intercom=error&reason=${encodeURIComponent(error)}`, APP_BASE),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}intercom=error&reason=missing_params`, APP_BASE),
    );
  }

  const storedState = cookieStore.get("intercom_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}intercom=error&reason=invalid_state`, APP_BASE),
    );
  }
  cookieStore.delete("intercom_oauth_state");

  const clientId = process.env.INTERCOM_CLIENT_ID;
  const clientSecret = process.env.INTERCOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}intercom=error&reason=server_config`, APP_BASE),
    );
  }

  const tokenResp = await fetch("https://api.intercom.com/auth/eagle/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[intercom-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}intercom=error&reason=token_exchange`, APP_BASE),
    );
  }

  const tokens = await tokenResp.json();

  // Domain validation: fetch authenticated admin's email from Intercom
  try {
    const accessToken = tokens.token || tokens.access_token;
    if (accessToken) {
      const meResp = await fetch("https://api.intercom.io/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (meResp.ok) {
        const meData = await meResp.json();
        const userEmail = meData.email as string | undefined;
        if (userEmail) {
          const operator = await prisma.operator.findUnique({
            where: { id: operatorId },
            select: { companyDomain: true },
          });
          if (operator?.companyDomain) {
            const emailDomain = userEmail.split("@")[1]?.toLowerCase();
            if (emailDomain && emailDomain !== operator.companyDomain) {
              return NextResponse.redirect(
                new URL(`${returnBase}${sep}intercom=error&reason=domain_mismatch&domain=${encodeURIComponent(operator.companyDomain)}`, APP_BASE),
              );
            }
          } else {
            console.warn("[intercom-oauth] operator.companyDomain not set — skipping domain validation");
          }
        }
      }
    }
  } catch (err) {
    console.warn("[intercom-oauth] Domain validation fetch failed, continuing:", err);
  }

  // Intercom tokens don't expire — store access_token and admin ID
  const config: Record<string, unknown> = {
    access_token: tokens.token || tokens.access_token,
    intercomAdminId: tokens.admin?.id || null,
  };

  // Upsert pattern
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "intercom", ...ACTIVE_CONNECTOR },
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
        provider: "intercom",
        name: "Intercom",
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  const capProvider = getProvider("intercom");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[intercom-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}intercom=connected`, APP_BASE),
  );
}
