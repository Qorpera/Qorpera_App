import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";
import { updateDepartmentSchema, parseBody } from "@/lib/api-validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id: slug } = await params;

  const visibleDomains = await getVisibleDomainSlugs(operatorId, user.id);
  if (visibleDomains !== "all" && !visibleDomains.includes(slug)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator", pageType: "domain_hub" },
    select: {
      slug: true, title: true, content: true, crossReferences: true,
      confidence: true, mapX: true, mapY: true,
    },
  });

  if (!page) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Load member pages (person_profile pages that cross-reference this hub)
  const members = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      pageType: "person_profile",
      crossReferences: { has: slug },
    },
    select: { slug: true, title: true, pageType: true },
  });

  return NextResponse.json({ ...page, members });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id: slug } = await params;

  const visibleDomains = await getVisibleDomainSlugs(operatorId, user.id);
  if (visibleDomains !== "all" && !visibleDomains.includes(slug)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = parseBody(updateDepartmentSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator", pageType: "domain_hub" },
    select: { id: true },
  });
  if (!page) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) data.title = parsed.data.displayName;
  if (parsed.data.description !== undefined) data.content = parsed.data.description;
  if (parsed.data.mapX !== undefined) data.mapX = parsed.data.mapX;
  if (parsed.data.mapY !== undefined) data.mapY = parsed.data.mapY;

  const updated = await prisma.knowledgePage.update({
    where: { id: page.id },
    data,
    select: {
      slug: true, title: true, content: true,
      confidence: true, mapX: true, mapY: true, pageType: true,
    },
  });

  return NextResponse.json({
    slug: updated.slug,
    name: updated.title,
    description: updated.content.slice(0, 300),
    confidence: updated.confidence,
    mapX: updated.mapX,
    mapY: updated.mapY,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id: slug } = await params;

  const visibleDomains = await getVisibleDomainSlugs(operatorId, user.id);
  if (visibleDomains !== "all" && !visibleDomains.includes(slug)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator", pageType: "domain_hub" },
    select: { id: true, slug: true },
  });
  if (!page) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Remove cross-references to this domain from all person pages
  const personPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      crossReferences: { has: slug },
    },
    select: { id: true, crossReferences: true },
  });

  for (const pp of personPages) {
    await prisma.knowledgePage.update({
      where: { id: pp.id },
      data: { crossReferences: pp.crossReferences.filter(ref => ref !== slug) },
    });
  }

  await prisma.knowledgePage.delete({ where: { id: page.id } });

  return NextResponse.json({ ok: true });
}
