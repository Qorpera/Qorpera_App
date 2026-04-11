import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";

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

  // Validate domain hub exists
  const hub = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator", pageType: "domain_hub" },
    select: { slug: true },
  });
  if (!hub) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Members = person_profile pages that cross-reference this domain hub
  const members = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      pageType: "person_profile",
      crossReferences: { has: slug },
    },
    select: {
      slug: true, title: true, pageType: true, content: true,
      confidence: true, crossReferences: true,
    },
    orderBy: { title: "asc" },
  });

  return NextResponse.json(members);
}
