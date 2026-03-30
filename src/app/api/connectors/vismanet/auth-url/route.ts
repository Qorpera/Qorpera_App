import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Only admins can install Visma.net" }, { status: 403 });
  }

  if (!process.env.VISMANET_CLIENT_ID || !process.env.VISMANET_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Visma.net OAuth is not configured. Set VISMANET_CLIENT_ID and VISMANET_CLIENT_SECRET." },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("vismanet_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  const from = req.nextUrl.searchParams.get("from");
  if (from) {
    cookieStore.set("vismanet_oauth_return", from, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
    });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.VISMANET_CLIENT_ID,
    redirect_uri: `${APP_BASE}/api/connectors/vismanet/callback`,
    scope: "ea:api ea:sales ea:purchase offline_access",
    state,
  });

  const url = `https://connect.visma.com/connect/authorize?${params.toString()}`;

  return NextResponse.json({ url });
}
