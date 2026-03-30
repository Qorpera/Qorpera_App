import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Only admins can install Sage" }, { status: 403 });
  }

  if (!process.env.SAGE_CLIENT_ID || !process.env.SAGE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Sage OAuth is not configured. Set SAGE_CLIENT_ID and SAGE_CLIENT_SECRET." },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("sage_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  const from = req.nextUrl.searchParams.get("from");
  if (from) {
    cookieStore.set("sage_oauth_return", from, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
    });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SAGE_CLIENT_ID,
    redirect_uri: `${APP_BASE}/api/connectors/sage/callback`,
    scope: "full_access",
    state,
  });

  const url = `https://www.sageone.com/oauth2/auth/central?filter=apiv3.1&${params.toString()}`;

  return NextResponse.json({ url });
}
