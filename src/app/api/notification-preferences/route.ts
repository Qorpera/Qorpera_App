import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: su.user.id },
  });

  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { type, channel } = body;

  if (!type || !channel) {
    return NextResponse.json({ error: "type and channel are required" }, { status: 400 });
  }

  const validTypes = [
    "situation_proposed", "situation_resolved", "initiative_proposed", "step_ready",
    "delegation_received", "follow_up_triggered", "plan_auto_executed", "peer_signal",
    "insight_discovered", "system_alert",
  ];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
  }

  const validChannels = ["in_app", "email", "both", "none"];
  if (!validChannels.includes(channel)) {
    return NextResponse.json({ error: "channel must be one of: in_app, email, both, none" }, { status: 400 });
  }

  const pref = await prisma.notificationPreference.upsert({
    where: { userId_notificationType: { userId: su.user.id, notificationType: type } },
    create: { userId: su.user.id, notificationType: type, channel },
    update: { channel },
  });

  return NextResponse.json(pref);
}
