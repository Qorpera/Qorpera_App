import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin only
  if (session.user.role !== "admin" && session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const operatorId = session.operatorId;

  // Check for existing running analysis
  const existing = await prisma.onboardingAnalysis.findUnique({
    where: { operatorId },
  });
  if (existing && existing.status === "analyzing") {
    return NextResponse.json({ error: "Analysis already in progress" }, { status: 409 });
  }

  // Check operator has synced data
  const connectorCount = await prisma.sourceConnector.count({
    where: { operatorId, status: "active" },
  });
  const contentCount = await prisma.contentChunk.count({ where: { operatorId } });
  if (connectorCount === 0 || contentCount === 0) {
    const reason = connectorCount === 0
      ? "No active connectors found. Please connect at least one tool."
      : "Connectors found but no data synced yet. Please wait for sync to complete and try again.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  // Delete existing analysis and agent runs (restart)
  await prisma.onboardingAgentRun.deleteMany({ where: { analysis: { operatorId } } });
  await prisma.onboardingAnalysis.deleteMany({ where: { operatorId } });

  // Create pending analysis — worker picks it up within 5 seconds
  const analysis = await prisma.onboardingAnalysis.create({
    data: {
      operatorId,
      status: "pending",
      currentPhase: "idle",
      startedAt: new Date(),
    },
  });

  // Update orientation session phase
  await prisma.orientationSession.updateMany({
    where: { operatorId },
    data: { phase: "analyzing" },
  });

  return NextResponse.json({ analysisId: analysis.id, status: "pending" });
}
