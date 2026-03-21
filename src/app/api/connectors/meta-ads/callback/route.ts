import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encryptConfig } from "@/lib/config-encryption";
import { registerConnectorCapabilities } from "@/lib/connectors/capability-registration";
import { getProvider } from "@/lib/connectors/registry";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const META_API = "https://graph.facebook.com/v19.0";

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

  const oauthReturn = cookieStore.get("meta_ads_oauth_return")?.value;
  cookieStore.delete("meta_ads_oauth_return");
  let returnBase = "/account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}meta-ads=error&reason=${encodeURIComponent(error)}`, APP_BASE)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}meta-ads=error&reason=missing_params`, APP_BASE)
    );
  }

  const storedState = cookieStore.get("meta_ads_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}meta-ads=error&reason=invalid_state`, APP_BASE)
    );
  }
  cookieStore.delete("meta_ads_oauth_state");

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}meta-ads=error&reason=server_config`, APP_BASE)
    );
  }

  // Exchange code for short-lived token
  const shortTokenResp = await fetch(
    `${META_API}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${encodeURIComponent(`${APP_BASE}/api/connectors/meta-ads/callback`)}`,
  );

  if (!shortTokenResp.ok) {
    console.error("[meta-ads-oauth] Short token exchange failed");
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}meta-ads=error&reason=token_exchange`, APP_BASE)
    );
  }

  const shortTokenData = await shortTokenResp.json();
  const shortToken = shortTokenData.access_token as string;

  // Exchange for long-lived token
  const longTokenResp = await fetch(
    `${META_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`,
  );

  let accessToken = shortToken;
  let expiresIn = 3600;

  if (longTokenResp.ok) {
    const longTokenData = await longTokenResp.json();
    accessToken = longTokenData.access_token || shortToken;
    expiresIn = longTokenData.expires_in || 60 * 24 * 60 * 60; // Default 60 days
  }

  // Fetch ad account ID
  let adAccountId = "";
  let adAccountCurrency = "USD";
  let adAccountName = "";
  try {
    const accountsResp = await fetch(
      `${META_API}/me/adaccounts?fields=id,name,currency&access_token=${accessToken}`,
    );
    if (accountsResp.ok) {
      const accountsData = await accountsResp.json();
      const accounts = accountsData.data || [];
      if (accounts.length > 0) {
        adAccountId = accounts[0].id;
        adAccountCurrency = accounts[0].currency || "USD";
        adAccountName = accounts[0].name || "";
      }
    }
  } catch (err) {
    console.warn("[meta-ads-oauth] Failed to fetch ad accounts:", err);
  }

  const config = {
    access_token: accessToken,
    token_expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
    ad_account_id: adAccountId,
    ad_account_currency: adAccountCurrency,
    ad_account_name: adAccountName,
  };

  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: null, provider: "meta-ads" },
  });

  const displayName = adAccountName ? `Meta Ads (${adAccountName})` : "Meta Ads";

  let connectorId: string;
  if (existing) {
    await prisma.sourceConnector.update({
      where: { id: existing.id },
      data: {
        config: encryptConfig(config),
        status: "active",
        consecutiveFailures: 0,
        name: displayName,
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: null,
        provider: "meta-ads",
        name: displayName,
        status: "active",
        config: encryptConfig(config),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("meta-ads");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[meta-ads-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}meta-ads=connected`, APP_BASE)
  );
}
