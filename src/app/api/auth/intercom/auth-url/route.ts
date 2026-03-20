import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.INTERCOM_CLIENT_ID || !process.env.INTERCOM_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Intercom OAuth is not configured. Set INTERCOM_CLIENT_ID and INTERCOM_CLIENT_SECRET." },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("intercom_oauth_state", state, {
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
    client_id: process.env.INTERCOM_CLIENT_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/intercom/callback`,
    state,
  });

  const url = `https://app.intercom.com/oauth?${params.toString()}`;

  return NextResponse.json({ url });
}
