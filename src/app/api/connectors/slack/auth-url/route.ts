import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Slack is a company connector — only admins can install
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json(
      { error: "Only admins can install Slack" },
      { status: 403 }
    );
  }

  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  const state = crypto.randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("slack_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  const from = req.nextUrl.searchParams.get("from");
  if (from) {
    cookieStore.set("slack_oauth_return", from, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
    });
  }

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID,
    scope: [
      "channels:history",
      "channels:read",
      "users:read",
      "users:read.email",
      "chat:write",
      "reactions:write",
    ].join(","),
    redirect_uri: `${APP_BASE}/api/connectors/slack/callback`,
    state,
  });

  const url = `https://slack.com/oauth/v2/authorize?${params.toString()}`;

  return NextResponse.json({ url });
}
