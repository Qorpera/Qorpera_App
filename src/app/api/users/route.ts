import { NextResponse } from "next/server";
import { getSessionUser, excludeSuperadmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { operatorId: su.operatorId, ...excludeSuperadmin() },
    include: {
      scopes: { select: { id: true, domainEntityId: true, domainPageSlug: true } },
      sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  // Resolve wiki page titles for users + scopes
  const allSlugs = new Set<string>();
  for (const u of users) {
    if (u.wikiPageSlug) allSlugs.add(u.wikiPageSlug);
    for (const s of u.scopes) {
      if (s.domainPageSlug) allSlugs.add(s.domainPageSlug);
    }
  }
  const pageMap = new Map<string, string>();
  if (allSlugs.size > 0) {
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId: su.operatorId, slug: { in: [...allSlugs] }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const p of pages) pageMap.set(p.slug, p.title);
  }

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      wikiPageSlug: u.wikiPageSlug ?? null,
      wikiPageTitle: u.wikiPageSlug ? pageMap.get(u.wikiPageSlug) ?? null : null,
      scopes: u.scopes.map((s) => ({
        id: s.id,
        domainPageSlug: s.domainPageSlug ?? null,
        domainName: s.domainPageSlug ? pageMap.get(s.domainPageSlug) ?? null : null,
      })),
      lastActive: u.sessions[0]?.createdAt ?? null,
      createdAt: u.createdAt,
    }))
  );
}
