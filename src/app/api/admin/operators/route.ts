import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get the superadmin's own operator to exclude it
  const superadminOperatorId = su.user.operatorId;

  const operators = await prisma.operator.findMany({
    where: { id: { not: superadminOperatorId } },
    orderBy: { createdAt: "desc" },
  });

  const stats = await Promise.all(
    operators.map(async (op) => {
      const [userCount, departmentCount, entityCount, orientation, mergeStats, aiStats] = await Promise.all([
        prisma.user.count({ where: { operatorId: op.id, role: { not: "superadmin" } } }),
        prisma.entity.count({ where: { operatorId: op.id, category: "foundational" } }),
        prisma.entity.count({ where: { operatorId: op.id } }),
        prisma.orientationSession.findFirst({
          where: { operatorId: op.id },
          orderBy: { createdAt: "desc" },
          select: { phase: true },
        }),
        prisma.entityMergeLog.groupBy({
          by: ["mergeType"],
          where: { operatorId: op.id },
          _count: true,
        }).then(async (groups) => {
          const byType: Record<string, number> = {};
          let total = 0;
          for (const g of groups) {
            byType[g.mergeType] = g._count;
            if (g.mergeType !== "ml_suggestion") total += g._count;
          }
          const pending = await prisma.entityMergeLog.count({
            where: { operatorId: op.id, mergeType: "ml_suggestion", reversedAt: null },
          });
          return { total, byType, pending };
        }),
        (async () => {
          const aiCount = await prisma.entity.count({
            where: { operatorId: op.id, entityType: { slug: "ai-agent" }, status: "active" },
          });
          if (aiCount === 0) return null;
          const paGroups = await prisma.personalAutonomy.groupBy({
            by: ["autonomyLevel"],
            where: { aiEntity: { operatorId: op.id } },
            _count: true,
          });
          const counts: Record<string, number> = { supervised: 0, notify: 0, autonomous: 0 };
          for (const g of paGroups) {
            if (counts[g.autonomyLevel] !== undefined) counts[g.autonomyLevel] = g._count;
          }
          return { totalAiEntities: aiCount, counts };
        })(),
      ]);

      return {
        id: op.id,
        companyName: op.companyName || op.displayName,
        createdAt: op.createdAt,
        isTestOperator: op.isTestOperator,
        userCount,
        departmentCount,
        entityCount,
        onboardingPhase: orientation?.phase ?? "unknown",
        mergeStats,
        aiStats,
      };
    })
  );

  return NextResponse.json(stats);
}
