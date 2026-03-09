import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
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
      new URL(`${returnBase}${sep}stripe=error&reason=${error}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}stripe=error&reason=missing_params`, req.url)
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("stripe_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}stripe=error&reason=invalid_state`, req.url)
    );
  }

  // Clear the state cookie
  cookieStore.delete("stripe_oauth_state");

  // Exchange code for tokens
  const tokenResp = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_secret: process.env.STRIPE_SECRET_KEY!,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("Stripe token exchange failed:", errBody);
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}stripe=error&reason=token_exchange`, req.url)
    );
  }

  const tokens = await tokenResp.json();

  const config = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    stripe_user_id: tokens.stripe_user_id,
  };

  const connector = await prisma.sourceConnector.create({
    data: {
      operatorId,
      provider: "stripe",
      name: "Stripe",
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
    new URL(`${returnBase}${sep}stripe=connected`, req.url)
  );
}
