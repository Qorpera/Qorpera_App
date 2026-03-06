import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

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
  const returnBase = oauthReturn === "onboarding" ? "/onboarding" : "/settings?tab=connections";
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

  await prisma.sourceConnector.create({
    data: {
      operatorId,
      provider: "stripe",
      name: "Stripe",
      status: "active",
      config: JSON.stringify(config),
    },
  });

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}stripe=connected`, req.url)
  );
}
