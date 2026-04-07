import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const job = await prisma.systemJob.findFirst({
    where: { id, operatorId },
    select: { id: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 50);
  const offset = Math.max(parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const [runs, total] = await Promise.all([
    prisma.systemJobRun.findMany({
      where: { systemJobId: id, operatorId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        cycleNumber: true,
        status: true,
        summary: true,
        importanceScore: true,
        findings: true,
        proposedSituationCount: true,
        proposedInitiativeCount: true,
        durationMs: true,
        createdAt: true,
        analysisNarrative: true,
        selfAmendments: true,
      },
    }),
    prisma.systemJobRun.count({ where: { systemJobId: id, operatorId } }),
  ]);

  return NextResponse.json({
    runs: runs.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
  });
}
