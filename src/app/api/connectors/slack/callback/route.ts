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

  // Determine return destination
  const oauthReturn = cookieStore.get("slack_oauth_return")?.value;
  cookieStore.delete("slack_oauth_return");
  let returnBase = "/account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}slack=error&reason=${encodeURIComponent(error)}`, APP_BASE)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}slack=error&reason=missing_params`, APP_BASE)
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("slack_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}slack=error&reason=invalid_state`, APP_BASE)
    );
  }
  cookieStore.delete("slack_oauth_state");

  // Verify env vars
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[slack-oauth] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET");
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}slack=error&reason=server_config`, APP_BASE)
    );
  }

  // Exchange code for token
  const tokenResp = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${APP_BASE}/api/connectors/slack/callback`,
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[slack-oauth] Token exchange HTTP error:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}slack=error&reason=token_exchange`, APP_BASE)
    );
  }

  const tokens = await tokenResp.json();

  if (!tokens.ok) {
    console.error("[slack-oauth] Token exchange failed:", tokens.error);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}slack=error&reason=${encodeURIComponent(tokens.error || "token_exchange")}`, APP_BASE)
    );
  }

  // Extract token data
  const botToken = tokens.access_token as string;
  const teamId = tokens.team?.id as string;
  const teamName = tokens.team?.name as string;
  const installedBySlackId = tokens.authed_user?.id as string;
  const grantedScopes = tokens.scope as string;

  const config = {
    bot_token: botToken,
    team_id: teamId,
    team_name: teamName,
    installed_by_slack_id: installedBySlackId,
    scopes: grantedScopes,
  };

  // Upsert: company connector (userId: null)
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: null, provider: "slack" },
  });

  let connectorId: string;
  if (existing) {
    await prisma.sourceConnector.update({
      where: { id: existing.id },
      data: {
        config: encrypt(JSON.stringify(config)),
        status: "active",
        consecutiveFailures: 0,
        name: `Slack (${teamName})`,
      },
    });
    connectorId = existing.id;
  } else {
    const newConnector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: null,
        provider: "slack",
        name: `Slack (${teamName})`,
        status: "active",
        config: encrypt(JSON.stringify(config)),
      },
    });
    connectorId = newConnector.id;
  }

  // Register write-back capabilities
  const capProvider = getProvider("slack");
  if (capProvider) {
    registerConnectorCapabilities(connectorId, operatorId, capProvider).catch((err) =>
      console.error("[slack-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}slack=connected`, APP_BASE)
  );
}
