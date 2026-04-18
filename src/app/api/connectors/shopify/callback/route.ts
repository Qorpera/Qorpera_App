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
  const oauthReturn = cookieStore.get("shopify_oauth_return")?.value;
  cookieStore.delete("shopify_oauth_return");
  let returnBase = "/settings?tab=account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}shopify=error&reason=missing_params`, APP_BASE)
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("shopify_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}shopify=error&reason=invalid_state`, APP_BASE)
    );
  }
  cookieStore.delete("shopify_oauth_state");

  // Retrieve store domain
  const storeDomain = cookieStore.get("shopify_store_domain")?.value;
  cookieStore.delete("shopify_store_domain");
  if (!storeDomain) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}shopify=error&reason=missing_domain`, APP_BASE)
    );
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}shopify=error&reason=server_config`, APP_BASE)
    );
  }

  // Exchange code for permanent access token
  const tokenResp = await fetch(
    `https://${storeDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    }
  );

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[shopify-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}shopify=error&reason=token_exchange`, APP_BASE)
    );
  }

  const tokens = await tokenResp.json();
  const accessToken = tokens.access_token as string;

  // Fetch shop info for display name
  let shopName = storeDomain;
  try {
    const shopResp = await fetch(
      `https://${storeDomain}/admin/api/2024-01/shop.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    if (shopResp.ok) {
      const shopData = await shopResp.json();
      shopName = shopData.shop?.name || storeDomain;
    }
  } catch {
    // Use domain as fallback
  }

  const config = {
    store_domain: storeDomain,
    access_token: accessToken,
    shop_name: shopName,
  };

  // Upsert: company connector
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: null, provider: "shopify", ...ACTIVE_CONNECTOR },
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
        name: `Shopify (${shopName})`,
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: null,
        provider: "shopify",
        name: `Shopify (${shopName})`,
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("shopify");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[shopify-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}shopify=connected`, APP_BASE)
  );
}
