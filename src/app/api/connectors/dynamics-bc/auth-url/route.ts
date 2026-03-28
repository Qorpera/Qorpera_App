import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Only admins can install Dynamics BC" }, { status: 403 });
  }

  if (!process.env.DYNAMICS_BC_CLIENT_ID || !process.env.DYNAMICS_BC_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Dynamics BC OAuth is not configured. Set DYNAMICS_BC_CLIENT_ID and DYNAMICS_BC_CLIENT_SECRET." },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("dynamics_bc_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  const from = req.nextUrl.searchParams.get("from");
  if (from) {
    cookieStore.set("dynamics_bc_oauth_return", from, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
    });
  }

  const params = new URLSearchParams({
    client_id: process.env.DYNAMICS_BC_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${APP_BASE}/api/connectors/dynamics-bc/callback`,
    scope: "https://api.businesscentral.dynamics.com/.default offline_access",
    state,
  });

  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

  return NextResponse.json({ url });
}
