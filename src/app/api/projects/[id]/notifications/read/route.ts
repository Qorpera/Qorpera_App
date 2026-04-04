import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;

  const access = await assertProjectAccess(params.id, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json();
  const { notificationIds } = body;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    return NextResponse.json({ error: "notificationIds array required" }, { status: 400 });
  }

  // Add userId to readBy for each notification
  const notifications = await prisma.projectNotification.findMany({
    where: { id: { in: notificationIds }, projectId: params.id },
  });

  for (const n of notifications) {
    if (!n.readBy.includes(effectiveUserId)) {
      await prisma.projectNotification.update({
        where: { id: n.id },
        data: { readBy: { push: effectiveUserId } },
      });
    }
  }

  return NextResponse.json({ marked: notifications.length });
}
