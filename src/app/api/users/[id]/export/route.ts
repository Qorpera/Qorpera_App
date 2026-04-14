import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import archiver from "archiver";
import { PassThrough } from "stream";

const MAX_ROWS = 50_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id: targetUserId } = await params;

  // Auth: user can export own data, admin can export on behalf
  const isSelf = su.user.id === targetUserId;
  const isAdmin = su.user.role === "admin" || su.user.role === "superadmin";
  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findFirst({
    where: { id: targetUserId, operatorId },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Find user's AI entity
  const aiEntity = await prisma.entity.findFirst({
    where: { ownerUserId: targetUserId },
    select: { id: true },
  });
  const aiEntityId = aiEntity?.id;

  // Size check
  const counts = await Promise.all([
    prisma.situation.count({ where: { assignedUserId: targetUserId, operatorId } }),
    prisma.copilotMessage.count({ where: { userId: targetUserId, operatorId } }),
    prisma.notification.count({ where: { userId: targetUserId, operatorId } }),
    aiEntityId ? prisma.activitySignal.count({ where: { actorEntityId: aiEntityId, operatorId } }) : 0,
  ]);
  const totalRows = counts.reduce((a, b) => a + b, 1); // +1 for profile

  if (totalRows > MAX_ROWS) {
    return NextResponse.json(
      { error: "Export too large for immediate download. Contact support." },
      { status: 413 },
    );
  }

  // Gather data
  const [situations, copilotMessages, notifications, activitySignals] =
    await Promise.all([
      prisma.situation.findMany({
        where: { assignedUserId: targetUserId, operatorId },
        select: {
          severity: true,
          confidence: true,
          source: true,
          status: true,
          reasoning: true,
          proposedAction: true,
          actionTaken: true,
          outcome: true,
          feedback: true,
          feedbackRating: true,
          createdAt: true,
          resolvedAt: true,
          situationType: { select: { name: true, slug: true } },
        },
      }),
      prisma.copilotMessage.findMany({
        where: { userId: targetUserId, operatorId },
        select: {
          sessionId: true,
          role: true,
          content: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.notification.findMany({
        where: { userId: targetUserId, operatorId },
        select: {
          title: true,
          body: true,
          read: true,
          sourceType: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      aiEntityId
        ? prisma.activitySignal.findMany({
            where: { actorEntityId: aiEntityId, operatorId },
            select: {
              signalType: true,
              metadata: true,
              occurredAt: true,
            },
            orderBy: { occurredAt: "desc" },
          })
        : [],
    ]);

  // Build profile (exclude passwordHash)
  const profile = {
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };

  // Create ZIP
  const passThrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(passThrough);

  archive.append(JSON.stringify(profile, null, 2), { name: "profile.json" });
  archive.append(JSON.stringify(situations, null, 2), { name: "situations.json" });
  archive.append(JSON.stringify(copilotMessages, null, 2), { name: "copilot-history.json" });
  archive.append(JSON.stringify(activitySignals, null, 2), { name: "activity-signals.json" });
  archive.append(JSON.stringify(notifications, null, 2), { name: "notifications.json" });

  archive.finalize();

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `qorpera-export-${targetUserId}-${dateStr}.zip`;

  // Convert Node stream to Web ReadableStream
  const readable = new ReadableStream({
    start(controller) {
      passThrough.on("data", (chunk) => controller.enqueue(chunk));
      passThrough.on("end", () => controller.close());
      passThrough.on("error", (err) => controller.error(err));
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
