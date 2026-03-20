import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ZENDESK_CLIENT_ID || !process.env.ZENDESK_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Zendesk OAuth is not configured. Set ZENDESK_CLIENT_ID and ZENDESK_CLIENT_SECRET." },
      { status: 500 },
    );
  }

  const subdomain = req.nextUrl.searchParams.get("subdomain");
  if (!subdomain) {
    return NextResponse.json({ error: "subdomain is required" }, { status: 400 });
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("zendesk_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  // Store subdomain for callback
  cookieStore.set("zendesk_subdomain", subdomain, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  const from = req.nextUrl.searchParams.get("from");
  if (from) {
    cookieStore.set("oauth_return", from, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
    });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ZENDESK_CLIENT_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/zendesk/callback`,
    scope: "read write",
    state,
  });

  const url = `https://${subdomain}.zendesk.com/oauth/authorizations/new?${params.toString()}`;

  return NextResponse.json({ url });
}
