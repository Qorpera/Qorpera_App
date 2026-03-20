import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

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

  const oauthReturn = cookieStore.get("linkedin_oauth_return")?.value;
  cookieStore.delete("linkedin_oauth_return");
  let returnBase = "/account";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}linkedin=error&reason=${encodeURIComponent(error)}`, APP_BASE)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}linkedin=error&reason=missing_params`, APP_BASE)
    );
  }

  const storedState = cookieStore.get("linkedin_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}linkedin=error&reason=invalid_state`, APP_BASE)
    );
  }
  cookieStore.delete("linkedin_oauth_state");

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}linkedin=error&reason=server_config`, APP_BASE)
    );
  }

  // Exchange code for access token
  const tokenResp = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${APP_BASE}/api/connectors/linkedin/callback`,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[linkedin-oauth] Token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}linkedin=error&reason=token_exchange`, APP_BASE)
    );
  }

  const tokens = await tokenResp.json();
  const accessToken = tokens.access_token as string;
  const expiresIn = tokens.expires_in || 60 * 24 * 60 * 60; // Default 60 days

  // Fetch admin pages to get organization ID
  let organizationId = "";
  let orgName = "";
  try {
    const aclResp = await fetch(
      "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (aclResp.ok) {
      const aclData = await aclResp.json();
      const elements = aclData.elements || [];
      if (elements.length > 0) {
        // Extract org ID from URN like "urn:li:organization:12345"
        const orgUrn = elements[0].organization || "";
        organizationId = orgUrn.replace("urn:li:organization:", "");
      }
    }
  } catch (err) {
    console.warn("[linkedin-oauth] Failed to fetch admin pages:", err);
  }

  // Fetch org name if we have an ID
  if (organizationId) {
    try {
      const orgResp = await fetch(
        `https://api.linkedin.com/v2/organizations/${organizationId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (orgResp.ok) {
        const orgData = await orgResp.json();
        orgName = orgData.localizedName || "";
      }
    } catch {
      // Fallback
    }
  }

  const config = {
    access_token: accessToken,
    token_expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
    organization_id: organizationId,
    organization_name: orgName,
  };

  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, userId: null, provider: "linkedin" },
  });

  const displayName = orgName ? `LinkedIn (${orgName})` : "LinkedIn";

  if (existing) {
    await prisma.sourceConnector.update({
      where: { id: existing.id },
      data: {
        config: encrypt(JSON.stringify(config)),
        status: "active",
        consecutiveFailures: 0,
        name: displayName,
      },
    });
  } else {
    await prisma.sourceConnector.create({
      data: {
        operatorId,
        userId: null,
        provider: "linkedin",
        name: displayName,
        status: "active",
        config: encrypt(JSON.stringify(config)),
      },
    });
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}linkedin=connected`, APP_BASE)
  );
}
