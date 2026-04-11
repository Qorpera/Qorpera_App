import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";
import { createDomainSchema, parseBody } from "@/lib/api-validation";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  const visibleDomains = await getVisibleDomainSlugs(operatorId, user.id);

  const hubs = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      pageType: "domain_hub",
      ...(visibleDomains !== "all" ? { slug: { in: visibleDomains } } : {}),
    },
    select: {
      slug: true, title: true, content: true, confidence: true,
      crossReferences: true, mapX: true, mapY: true,
    },
    orderBy: { title: "asc" },
  });

  // Count members (person_profile pages that cross-reference each hub)
  const results = await Promise.all(hubs.map(async (hub) => {
    const memberCount = await prisma.knowledgePage.count({
      where: {
        operatorId,
        scope: "operator",
        pageType: "person_profile",
        crossReferences: { has: hub.slug },
      },
    });

    return {
      slug: hub.slug,
      name: hub.title,
      description: hub.content.slice(0, 300),
      memberCount,
      confidence: hub.confidence,
    };
  }));

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = parseBody(createDomainSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, description, mapX, mapY } = parsed.data;

  // Generate a slug from the name
  const slug = "domain-" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  // Check uniqueness
  const existing = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator" },
  });
  if (existing) {
    return NextResponse.json({ error: "A domain with this name already exists" }, { status: 409 });
  }

  const page = await prisma.knowledgePage.create({
    data: {
      operatorId,
      scope: "operator",
      pageType: "domain_hub",
      title: name.trim(),
      slug,
      content: description || "",
      mapX: typeof mapX === "number" ? mapX : 0,
      mapY: typeof mapY === "number" ? mapY : 0,
      confidence: 0.5,
      status: "draft",
      trustLevel: "provisional",
      crossReferences: [],
      synthesisPath: "onboarding",
      synthesizedByModel: "manual",
      lastSynthesizedAt: new Date(),
      sourceAuthority: "foundational",
    },
    select: {
      slug: true, title: true, content: true, confidence: true,
      mapX: true, mapY: true, pageType: true,
    },
  });

  return NextResponse.json({
    slug: page.slug,
    name: page.title,
    description: page.content.slice(0, 300),
    memberCount: 0,
    confidence: page.confidence,
  }, { status: 201 });
}
