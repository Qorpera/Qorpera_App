import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const types = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
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
