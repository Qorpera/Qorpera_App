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
      sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  // Resolve wiki page titles for users
  const allSlugs = new Set<string>();
  for (const u of users) {
    if (u.wikiPageSlug) allSlugs.add(u.wikiPageSlug);
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
      lastActive: u.sessions[0]?.createdAt ?? null,
      createdAt: u.createdAt,
    }))
  );
}
