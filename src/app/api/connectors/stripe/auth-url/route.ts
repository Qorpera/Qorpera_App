import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  await getOperatorId(); // ensure authenticated

  if (!process.env.STRIPE_CLIENT_ID || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe OAuth is not configured. Set STRIPE_CLIENT_ID and STRIPE_SECRET_KEY." },
      { status: 500 }
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("stripe_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 600, // 10 minutes
  });

  // Track return destination for OAuth callback
  const from = req.nextUrl.searchParams.get("from");
  if (from === "onboarding") {
    cookieStore.set("oauth_return", "onboarding", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 600,
    });
  }

  const callbackUrl =
    process.env.STRIPE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/stripe/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.STRIPE_CLIENT_ID,
    scope: "read_write",
    redirect_uri: callbackUrl,
    state,
  });

  const url = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

  return NextResponse.json({ url });
}
