import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { sourceDomainSlug, targetDomainSlug, sourceDepartmentId, targetDepartmentId } = body;

  // Wiki-first path
  if (sourceDomainSlug && targetDomainSlug) {
    // Verify target domain page exists
    const targetPage = await prisma.knowledgePage.findFirst({
      where: { operatorId: su.operatorId, slug: targetDomainSlug, scope: "operator", pageType: "domain_hub" },
      select: { slug: true },
    });
    if (!targetPage) {
      return NextResponse.json({ error: "Target domain not found" }, { status: 404 });
    }

    // Find users who have a scope for the source domain
    const sourceScopes = await prisma.userScope.findMany({
      where: { user: { operatorId: su.operatorId, role: "member" }, domainPageSlug: sourceDomainSlug },
      select: { userId: true },
    });

    let granted = 0;
    let alreadyHad = 0;

    for (const s of sourceScopes) {
      const existing = await prisma.userScope.findFirst({
        where: { userId: s.userId, domainPageSlug: targetDomainSlug },
      });
      if (existing) {
        alreadyHad++;
      } else {
        await prisma.userScope.create({
          data: { userId: s.userId, domainPageSlug: targetDomainSlug, grantedById: su.user.id },
        });
        granted++;
      }
    }

    return NextResponse.json({ granted, alreadyHad });
  }

  // Legacy entity path
  if (!sourceDepartmentId || !targetDepartmentId) {
    return NextResponse.json({ error: "sourceDomainSlug+targetDomainSlug or sourceDepartmentId+targetDepartmentId required" }, { status: 400 });
  }

  const [srcDept, tgtDept] = await Promise.all([
    prisma.entity.findFirst({ where: { id: sourceDepartmentId, operatorId: su.operatorId, category: "foundational" } }),
    prisma.entity.findFirst({ where: { id: targetDepartmentId, operatorId: su.operatorId, category: "foundational" } }),
  ]);
  if (!srcDept || !tgtDept) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    where: {
      operatorId: su.operatorId,
      role: "member",
      entity: { primaryDomainId: sourceDepartmentId, category: "base" },
    },
    select: { id: true },
  });

  let granted = 0;
  let alreadyHad = 0;

  for (const u of users) {
    const existing = await prisma.userScope.findFirst({
      where: { userId: u.id, domainEntityId: targetDepartmentId },
    });
    if (existing) {
      alreadyHad++;
    } else {
      await prisma.userScope.create({
        data: { userId: u.id, domainEntityId: targetDepartmentId, grantedById: su.user.id },
      });
      granted++;
    }
  }

  return NextResponse.json({ granted, alreadyHad });
}
