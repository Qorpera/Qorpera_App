import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Only admins can install Exact Online" }, { status: 403 });
  }

  if (!process.env.EXACT_CLIENT_ID || !process.env.EXACT_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Exact Online OAuth is not configured. Set EXACT_CLIENT_ID and EXACT_CLIENT_SECRET." },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("exact_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  const from = req.nextUrl.searchParams.get("from");
  if (from) {
    cookieStore.set("exact_oauth_return", from, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
    });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.EXACT_CLIENT_ID,
    redirect_uri: `${APP_BASE}/api/connectors/exact-online/callback`,
    state,
  });

  const url = `https://start.exactonline.nl/api/oauth2/auth?${params.toString()}`;

  return NextResponse.json({ url });
}
