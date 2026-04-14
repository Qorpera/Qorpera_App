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

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const [
      situationTypeCount,
      statusCounts,
      lastDetectionResult,
      activeConnectors,
      aiConfig,
      recentWorkerActivity,
      recentAnalysis,
    ] = await Promise.all([
      prisma.situationType.count({ where: { operatorId } }),
      prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(
        `SELECT properties->>'status' as status, COUNT(*) as count
         FROM "KnowledgePage"
         WHERE "operatorId" = $1
           AND "pageType" = 'situation_instance'
           AND properties->>'situation_id' IS NOT NULL
         GROUP BY properties->>'status'`,
        operatorId,
      ),
      prisma.$queryRawUnsafe<Array<{ detected_at: string }>>(
        `SELECT properties->>'detected_at' as detected_at
         FROM "KnowledgePage"
         WHERE "operatorId" = $1
           AND "pageType" = 'situation_instance'
           AND properties->>'situation_id' IS NOT NULL
         ORDER BY (properties->>'detected_at')::timestamp DESC NULLS LAST
         LIMIT 1`,
        operatorId,
      ),
      prisma.sourceConnector.count({ where: { operatorId, status: "active" } }),
      getAIConfig("reasoning"),
      prisma.workerJob.findFirst({
        where: {
          OR: [
            { claimedAt: { gte: thirtyMinAgo } },
            { completedAt: { gte: thirtyMinAgo } },
          ],
        },
        select: { id: true },
      }),
      prisma.onboardingAnalysis.findFirst({
        where: { workerClaimedAt: { gte: thirtyMinAgo } },
        select: { id: true },
      }),
    ]);

    const totalSituationsDetected = statusCounts.reduce(
      (sum, r) => sum + Number(r.count),
      0,
    );
    const lastDetectionRun = lastDetectionResult[0]?.detected_at ?? null;
    const aiProviderConfigured = !!aiConfig.provider;
    const aiReachable = aiConfig.provider === "ollama"
      ? !!aiConfig.baseUrl
      : !!aiConfig.apiKey;
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
      { status: 500 },
    );
  }
}
