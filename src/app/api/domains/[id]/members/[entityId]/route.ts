import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id: domainSlug, entityId: memberSlug } = await params;

  const visibleDomains = await getVisibleDomainSlugs(operatorId, user.id);
  if (visibleDomains !== "all" && !visibleDomains.includes(domainSlug)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Find the member's wiki page and remove the cross-reference to this domain
  const memberPage = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: memberSlug, scope: "operator" },
    select: { id: true, crossReferences: true },
  });

  if (!memberPage || !memberPage.crossReferences.includes(domainSlug)) {
    return NextResponse.json({ error: "Member not found in this domain" }, { status: 404 });
  }

  await prisma.knowledgePage.update({
    where: { id: memberPage.id },
    data: { crossReferences: memberPage.crossReferences.filter(ref => ref !== domainSlug) },
  });

  return NextResponse.json({ ok: true });
}
