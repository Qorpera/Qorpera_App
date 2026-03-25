import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;

  const session = await prisma.orientationSession.findFirst({
    where: { operatorId, completedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!session) {
    return NextResponse.json({ error: "No active orientation session" }, { status: 404 });
  }

  await prisma.orientationSession.update({
    where: { id: session.id },
    data: {
      phase: "active",
      completedAt: new Date(),
    },
  });

  // Trigger initial detection so user sees situations immediately
  enqueueWorkerJob("detect_situations", operatorId, { operatorId }).catch((err) => {
    console.error("[orientation-complete] Failed to enqueue initial detection:", err);
  });

  return NextResponse.json({ success: true, sessionId: session.id });
}
