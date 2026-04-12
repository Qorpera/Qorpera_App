import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({}));
  const { domainPageSlug, domainEntityId } = body as { domainPageSlug?: string; domainEntityId?: string };

  // Validate user in same operator
  const user = await prisma.user.findFirst({ where: { id: userId, operatorId: su.operatorId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (domainPageSlug) {
    // Wiki-first path: validate domain page exists
    const domainPage = await prisma.knowledgePage.findFirst({
      where: { operatorId: su.operatorId, slug: domainPageSlug, scope: "operator", pageType: "domain_hub" },
      select: { slug: true, title: true },
    });
    if (!domainPage) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const scope = await prisma.userScope.create({
      data: {
        userId,
        domainEntityId: domainEntityId ?? null,
        domainPageSlug,
        grantedById: su.user.id,
      },
    });

    return NextResponse.json({
      id: scope.id,
      domainPageSlug: scope.domainPageSlug,
      domainName: domainPage.title,
    }, { status: 201 });
  }

  // Legacy path: domainEntityId
  if (!domainEntityId) {
    return NextResponse.json({ error: "domainPageSlug or domainEntityId is required" }, { status: 400 });
  }

  const dept = await prisma.entity.findFirst({
    where: { id: domainEntityId, operatorId: su.operatorId, category: "foundational" },
    select: { id: true, displayName: true },
  });
  if (!dept) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const existing = await prisma.userScope.findFirst({
    where: { userId, domainEntityId },
  });
  if (existing) {
    return NextResponse.json({ error: "User already has access to this department" }, { status: 409 });
  }

  const scope = await prisma.userScope.create({
    data: {
      userId,
      domainEntityId,
      grantedById: su.user.id,
    },
  });

  return NextResponse.json({
    id: scope.id,
    domainPageSlug: null,
    domainName: dept.displayName,
  }, { status: 201 });
}
