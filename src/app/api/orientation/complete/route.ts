import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { detectSituations } from "@/lib/situation-detector";

export async function POST() {
  const operatorId = await getOperatorId();

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
  detectSituations(operatorId).catch((err) => {
    console.error("[orientation-complete] Initial detection failed:", err);
  });

  return NextResponse.json({ success: true, sessionId: session.id });
}
