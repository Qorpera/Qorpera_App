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
      const [userCount, departmentCount, entityCount, orientation] = await Promise.all([
        prisma.user.count({ where: { operatorId: op.id, role: { not: "superadmin" } } }),
        prisma.entity.count({ where: { operatorId: op.id, category: "foundational" } }),
        prisma.entity.count({ where: { operatorId: op.id } }),
        prisma.orientationSession.findFirst({
          where: { operatorId: op.id },
          orderBy: { createdAt: "desc" },
          select: { phase: true },
        }),
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
      };
    })
  );

  return NextResponse.json(stats);
}
