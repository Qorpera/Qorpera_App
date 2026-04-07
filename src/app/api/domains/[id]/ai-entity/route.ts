import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainIds } from "@/lib/domain-scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id: domainId } = await params;

  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);
  if (visibleDomains !== "all" && !visibleDomains.includes(domainId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const aiEntity = await prisma.entity.findFirst({
    where: {
      operatorId,
      ownerDomainId: domainId,
      status: "active",
    },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
    },
  });

  if (!aiEntity) {
    return NextResponse.json({ error: "Domain AI not found" }, { status: 404 });
  }

  return NextResponse.json(aiEntity);
}
