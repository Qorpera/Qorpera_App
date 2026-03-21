import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: { aiPaused: true, aiPausedAt: true, aiPausedById: true, aiPausedReason: true },
  });

  if (!operator || !operator.aiPaused) {
    return NextResponse.json({ paused: false });
  }

  let pausedBy: { name: string; email: string } | null = null;
  if (operator.aiPausedById) {
    const pauseUser = await prisma.user.findUnique({
      where: { id: operator.aiPausedById },
      select: { name: true, email: true },
    });
    if (pauseUser) pausedBy = { name: pauseUser.name, email: pauseUser.email };
  }

  return NextResponse.json({
    paused: true,
    pausedAt: operator.aiPausedAt,
    pausedBy,
    reason: operator.aiPausedReason,
  });
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "paused (boolean) is required" }, { status: 400 });
  }

  const { paused, reason } = body as { paused: boolean; reason?: string };
  const { operatorId, user } = su;

  const updated = await prisma.operator.update({
    where: { id: operatorId },
    data: paused
      ? {
          aiPaused: true,
          aiPausedAt: new Date(),
          aiPausedById: user.id,
          aiPausedReason: typeof reason === "string" ? reason.trim() || null : null,
        }
      : {
          aiPaused: false,
          aiPausedAt: null,
          aiPausedById: null,
          aiPausedReason: null,
        },
    select: { aiPaused: true, aiPausedAt: true, aiPausedById: true, aiPausedReason: true },
  });

  // Notify all admins
  const actorName = user.name || user.email;
  const reasonText = reason?.trim() ? ` Reason: ${reason.trim()}` : "";

  if (paused) {
    sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: "AI activity paused",
      body: `All AI activity has been paused by ${actorName}.${reasonText}`,
      sourceType: "operator",
      sourceId: operatorId,
      linkUrl: "/settings",
      emailContext: {
        alertTitle: "Emergency AI Pause Activated",
        alertBody: `${actorName} has paused all AI activity for your organization.${reasonText} Detection, reasoning, and autonomous actions are suspended until an admin resumes.`,
        viewUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/settings`,
      },
    }).catch(console.error);
  } else {
    sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: "AI activity resumed",
      body: `AI activity has been resumed by ${actorName}.`,
      sourceType: "operator",
      sourceId: operatorId,
      linkUrl: "/settings",
      emailContext: {
        alertTitle: "AI Activity Resumed",
        alertBody: `${actorName} has resumed all AI activity for your organization. Detection, reasoning, and autonomous actions are now active.`,
        viewUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/settings`,
      },
    }).catch(console.error);
  }

  return NextResponse.json({
    paused: updated.aiPaused,
    pausedAt: updated.aiPausedAt,
    reason: updated.aiPausedReason,
  });
}
