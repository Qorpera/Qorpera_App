import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encryptConfig } from "@/lib/config-encryption";
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
  const oauthReturn = cookieStore.get("oauth_return")?.value;
  cookieStore.delete("oauth_return");
  let returnBase = "/settings?tab=connections";
  if (oauthReturn === "onboarding") {
    returnBase = "/onboarding";
  }
  const sep = returnBase.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}stripe=error&reason=${error}`, APP_BASE)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}stripe=error&reason=missing_params`, APP_BASE)
    );
  }

  // Verify CSRF state
  const storedState = cookieStore.get("stripe_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL(`${returnBase}${sep}stripe=error&reason=invalid_state`, APP_BASE)
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
      new URL(`${returnBase}${sep}stripe=error&reason=token_exchange`, APP_BASE)
    );
  }

  const tokens = await tokenResp.json();

  // Domain validation: fetch connected Stripe account email
  try {
    if (tokens.stripe_user_id) {
      const acctResp = await fetch(`https://api.stripe.com/v1/accounts/${tokens.stripe_user_id}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      });
      if (acctResp.ok) {
        const acct = await acctResp.json();
        const userEmail = (acct.email || acct.business_profile?.support_email) as string | undefined;
        if (userEmail) {
          const operator = await prisma.operator.findUnique({
            where: { id: operatorId },
            select: { companyDomain: true },
          });
          if (operator?.companyDomain) {
            const emailDomain = userEmail.split("@")[1]?.toLowerCase();
            if (emailDomain && emailDomain !== operator.companyDomain) {
              return NextResponse.redirect(
                new URL(`${returnBase}${sep}stripe=error&reason=domain_mismatch&domain=${encodeURIComponent(operator.companyDomain)}`, APP_BASE),
              );
            }
          } else {
            console.warn("[stripe-oauth] operator.companyDomain not set — skipping domain validation");
          }
        }
      }
    }
  } catch (err) {
    console.warn("[stripe-oauth] Domain validation fetch failed, continuing:", err);
  }

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
      config: encryptConfig(config),
    },
  });

  // Register write-back capabilities
  const capProvider = getProvider("stripe");
  if (capProvider) {
    registerConnectorCapabilities(connector.id, operatorId, capProvider).catch((err) =>
      console.error("[stripe-oauth] Failed to register write capabilities:", err),
    );
  }

  return NextResponse.redirect(
    new URL(`${returnBase}${sep}stripe=connected`, APP_BASE)
  );
}
