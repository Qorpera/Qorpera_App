import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainIds } from "@/lib/domain-scope";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  // TODO(session-3): Migrate to resolveAccessContext — scopeEntityId filter needs rewrite
  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);
  const where: Record<string, unknown> = { operatorId, enabled: true };
  if (visibleDomains !== "all") {
    where.OR = [
      { scopeEntityId: null },
      { scopeEntityId: { in: visibleDomains } },
    ];
  }

  const types = await prisma.situationType.findMany({
    where,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    types.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      autonomyLevel: t.autonomyLevel,
      consecutiveApprovals: t.consecutiveApprovals,
      totalApproved: t.totalApproved,
      totalProposed: t.totalProposed,
      approvalRate: t.approvalRate,
    })),
  );
}
