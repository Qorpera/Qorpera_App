import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);

  const where: Record<string, unknown> = { operatorId };
  if (status) where.status = status;

  // Members: only system jobs scoped to their visible departments + company-wide
  if (visibleDepts !== "all") {
    where.OR = [
      { scopeEntityId: { in: visibleDepts } },
      { scope: "company_wide" },
      { scopeEntityId: null },
    ];
  }

  const systemJobs = await prisma.systemJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      runs: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
        select: {
          id: true,
          cycleNumber: true,
          status: true,
          importanceScore: true,
          summary: true,
          proposedSituationCount: true,
          proposedInitiativeCount: true,
          createdAt: true,
        },
      },
    },
  });

  const result = systemJobs.map(sj => ({
    ...sj,
    lastRun: sj.runs[0] ?? null,
    runs: undefined,
  }));

  return NextResponse.json({ systemJobs: result });
}
