import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();

  // Determine return destination
  const oauthReturn = cookieStore.get("oauth_return")?.value;
  cookieStore.delete("oauth_return");
  let returnBase = "/settings?tab=connections";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  } else if (oauthReturn?.startsWith("department:")) {
    const deptId = oauthReturn.replace("department:", "");
    returnBase = `/map/${deptId}`;
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}hubspot=error&reason=${error}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}hubspot=error&reason=missing_params`, req.url)
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("hubspot_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}hubspot=error&reason=invalid_state`, req.url)
    );
  }

  // Clear the state cookie
  cookieStore.delete("hubspot_oauth_state");

  // Exchange code for tokens
  const tokenResp = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      redirect_uri:
        process.env.HUBSPOT_REDIRECT_URI ||
        "http://localhost:3000/api/auth/hubspot/callback",
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("HubSpot token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}hubspot=error&reason=token_exchange`, req.url)
    );
  }

  const tokens = await tokenResp.json();

  // HubSpot doesn't need additional config — token gives full CRM access
  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };

  const connector = await prisma.sourceConnector.create({
    data: {
      operatorId,
      provider: "hubspot",
      name: "HubSpot CRM",
      status: "active",
      config: encrypt(JSON.stringify(config)),
    },
  });

  if (oauthReturn?.startsWith("department:")) {
    const deptId = oauthReturn.replace("department:", "");
    try {
      await prisma.connectorDepartmentBinding.create({
        data: {
          operatorId,
          connectorId: connector.id,
          departmentId: deptId,
          entityTypeFilter: null,
        },
      });
    } catch (bindErr) {
      console.error("[oauth-callback] Failed to auto-create binding:", bindErr);
    }
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}hubspot=connected`, req.url)
  );
}
