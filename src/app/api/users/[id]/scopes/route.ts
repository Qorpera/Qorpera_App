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
  const { domainEntityId } = await req.json().catch(() => ({ domainEntityId: null }));

  if (!domainEntityId) {
    return NextResponse.json({ error: "domainEntityId is required" }, { status: 400 });
  }

  // Validate user in same operator
  const user = await prisma.user.findFirst({ where: { id: userId, operatorId: su.operatorId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Validate department exists and is foundational
  const dept = await prisma.entity.findFirst({
    where: { id: domainEntityId, operatorId: su.operatorId, category: "foundational" },
    select: { id: true, displayName: true },
  });
  if (!dept) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Look up the corresponding wiki domain_hub page slug
  const hubPage = await prisma.knowledgePage.findFirst({
    where: { operatorId: su.operatorId, scope: "operator", pageType: "domain_hub", title: { equals: dept.displayName, mode: "insensitive" } },
    select: { slug: true, title: true },
  });

  // Check if scope already exists
  const existing = await prisma.userScope.findUnique({
    where: { userId_domainEntityId: { userId, domainEntityId } },
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
    domainEntityId: scope.domainEntityId,
    domainPageSlug: hubPage?.slug ?? null,
    domainName: hubPage?.title ?? dept.displayName,
  }, { status: 201 });
}
