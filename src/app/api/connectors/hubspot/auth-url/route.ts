import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  await getOperatorId(); // ensure authenticated

  if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "HubSpot OAuth is not configured. Set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("hubspot_oauth_state", state, {
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

  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID,
    redirect_uri:
      process.env.HUBSPOT_REDIRECT_URI ||
      "http://localhost:3000/api/auth/hubspot/callback",
    scope: [
      "crm.objects.contacts.read",
      "crm.schemas.contacts.read",
      "crm.objects.companies.read",
      "crm.schemas.companies.read",
      "crm.objects.deals.read",
      "crm.schemas.deals.read",
      "crm.objects.contacts.write",
      "crm.objects.deals.write",
      "sales-email-read",
    ].join(" "),
    state,
  });

  const hubspotDomain = process.env.HUBSPOT_DOMAIN || "app.hubspot.com";
  const url = `https://${hubspotDomain}/oauth/authorize?${params.toString()}`;

  return NextResponse.json({ url });
}
