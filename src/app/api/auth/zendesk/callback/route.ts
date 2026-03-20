import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { registerConnectorCapabilities } from "@/lib/connectors/capability-registration";
import { getProvider } from "@/lib/connectors/registry";

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
      new URL(`${returnBase}${sep}zendesk=error&reason=${encodeURIComponent(error)}`, APP_BASE),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}zendesk=error&reason=missing_params`, APP_BASE),
    );
  }

  const storedState = cookieStore.get("zendesk_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}zendesk=error&reason=invalid_state`, APP_BASE),
    );
  }
  cookieStore.delete("zendesk_oauth_state");

  // Retrieve subdomain from cookie
  const subdomain = cookieStore.get("zendesk_subdomain")?.value;
  cookieStore.delete("zendesk_subdomain");
  if (!subdomain) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}zendesk=error&reason=missing_subdomain`, APP_BASE),
    );
  }

  const clientId = process.env.ZENDESK_CLIENT_ID;
  const clientSecret = process.env.ZENDESK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}zendesk=error&reason=server_config`, APP_BASE),
    );
  }

  const tokenResp = await fetch(`https://${subdomain}.zendesk.com/oauth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${APP_BASE}/api/auth/zendesk/callback`,
      grant_type: "authorization_code",
      scope: "read write",
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[zendesk-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}zendesk=error&reason=token_exchange`, APP_BASE),
    );
  }

  const tokens = await tokenResp.json();

  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    subdomain,
    token_expiry: new Date(Date.now() + (tokens.expires_in || 7200) * 1000).toISOString(),
  };

  // Upsert pattern
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "zendesk" },
  });

  let connectorId: string;
  if (existing) {
    await prisma.sourceConnector.update({
      where: { id: existing.id },
      data: {
        config: encrypt(JSON.stringify(config)),
        status: "active",
        consecutiveFailures: 0,
        name: `Zendesk (${subdomain})`,
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        provider: "zendesk",
        name: `Zendesk (${subdomain})`,
        status: "active",
        config: encrypt(JSON.stringify(config)),
      },
    });
    connectorId = newConnector.id;
  }

  const capProvider = getProvider("zendesk");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[zendesk-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}zendesk=connected`, APP_BASE),
  );
}
