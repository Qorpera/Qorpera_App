import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAIConfig } from "@/lib/ai-provider";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const su = await getSessionUser();
    if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user, operatorId } = su;
    if (user.role !== "admin" && user.role !== "superadmin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // 1. Situation type count
    const situationTypeCount = await prisma.situationType.count({
      where: { operatorId },
    });

    // 2. Last detection run
    const lastSituation = await prisma.situation.findFirst({
      where: { operatorId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const lastDetectionRun = lastSituation?.createdAt?.toISOString() ?? null;

    // 3. Total situations detected
    const totalSituationsDetected = await prisma.situation.count({
      where: { operatorId },
    });

    // 4. Active connectors
    const activeConnectors = await prisma.sourceConnector.count({
      where: { operatorId, status: "active" },
    });

    // 5+6. AI provider configured & reachable — use getAIConfig() so DB + env fallback is respected
    const aiConfig = await getAIConfig("reasoning");
    const aiProviderConfigured = !!aiConfig.provider;
    let aiReachable = false;
    if (aiConfig.provider === "ollama") {
      aiReachable = !!aiConfig.baseUrl;
    } else {
      aiReachable = !!aiConfig.apiKey;
    }

    // 7. Cron running
    // Check if worker has claimed any job in the last 30 minutes (proxy for "worker is alive")
    const recentWorkerActivity = await prisma.workerJob.findFirst({
      where: {
        OR: [
          { claimedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
          { completedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
        ],
      },
      select: { id: true },
    });
    const recentAnalysis = await prisma.onboardingAnalysis.findFirst({
      where: { workerClaimedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
      select: { id: true },
    });
    const cronRunning = !!(recentWorkerActivity || recentAnalysis);

    return NextResponse.json({
      situationTypeCount,
      lastDetectionRun,
      totalSituationsDetected,
      activeConnectors,
      aiProviderConfigured,
      aiReachable,
      cronRunning,
    });
  } catch (err) {
    console.error("[situations/status] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get status" },
      { status: 500 }
    );
  }
}
