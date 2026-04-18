import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type KgProperties = Record<string, unknown>;

function propStr(p: KgProperties, key: string): string | null {
  const v = p[key];
  return typeof v === "string" ? v : null;
}

/**
 * Extract a short description from wiki markdown: the first non-empty
 * paragraph under the first `## ` heading. Returns null if none found.
 */
function extractDescription(content: string): string | null {
  const lines = content.split("\n");
  let seenHeading = false;
  const buffer: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!seenHeading) {
      if (line.startsWith("## ")) seenHeading = true;
      continue;
    }
    // After the heading, collect first paragraph (contiguous non-empty,
    // non-heading, non-list lines). Break on blank line or next heading.
    if (line === "") {
      if (buffer.length > 0) break;
      continue;
    }
    if (line.startsWith("#")) break;
    buffer.push(line);
  }
  const text = buffer.join(" ").trim();
  return text.length > 0 ? text : null;
}

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const portfolioSlug = req.nextUrl.searchParams.get("portfolio");

  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      pageType: { in: ["project_portfolio", "project"] },
      scope: "operator",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      content: true,
      properties: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Filter to the requested view: top-level (no parent_project) or children of
  // a given portfolio slug.
  const visible = pages.filter((p) => {
    const props = (p.properties ?? {}) as KgProperties;
    const parent = propStr(props, "parent_project");
    if (portfolioSlug) return parent === portfolioSlug;
    return !parent;
  });

  // Child-project counts for any portfolios in the visible set — derived from
  // the full page list (which already includes every project).
  const childProjectsByPortfolio = new Map<string, typeof pages>();
  for (const p of pages) {
    if (p.pageType !== "project") continue;
    const props = (p.properties ?? {}) as KgProperties;
    const parent = propStr(props, "parent_project");
    if (!parent) continue;
    const bucket = childProjectsByPortfolio.get(parent);
    if (bucket) bucket.push(p);
    else childProjectsByPortfolio.set(parent, [p]);
  }

  // Deliverable counts for any projects in the visible set — one batched query.
  const projectSlugs = visible
    .filter((p) => p.pageType === "project")
    .map((p) => p.slug);
  const deliverableCounts = new Map<string, number>();
  if (projectSlugs.length > 0) {
    const deliverables = await prisma.knowledgePage.findMany({
      where: {
        operatorId,
        pageType: "project_deliverable",
        scope: "operator",
        OR: projectSlugs.map((slug) => ({
          properties: { path: ["parent_project"], equals: slug },
        })),
      },
      select: { properties: true },
    });
    for (const d of deliverables) {
      const props = (d.properties ?? {}) as KgProperties;
      const parent = propStr(props, "parent_project");
      if (!parent) continue;
      deliverableCounts.set(parent, (deliverableCounts.get(parent) ?? 0) + 1);
    }
  }

  // Resolve owner/domain/parent-project slugs to titles.
  const refSlugs = new Set<string>();
  for (const p of visible) {
    const props = (p.properties ?? {}) as KgProperties;
    for (const k of ["owner", "domain", "parent_project"]) {
      const v = propStr(props, k);
      if (v) refSlugs.add(v);
    }
  }
  const titleBySlug = new Map<string, string>();
  if (refSlugs.size > 0) {
    const refs = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: [...refSlugs] }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const r of refs) titleBySlug.set(r.slug, r.title);
  }

  const projects = visible.map((p) => {
    const props = (p.properties ?? {}) as KgProperties;
    const ownerSlug = propStr(props, "owner");
    const domainSlug = propStr(props, "domain");
    const parentSlug = propStr(props, "parent_project");
    const isPortfolio = p.pageType === "project_portfolio";

    const childPages = isPortfolio
      ? childProjectsByPortfolio.get(p.slug) ?? []
      : [];
    const childProjects = childPages.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.title,
      status: propStr((c.properties ?? {}) as KgProperties, "status") ?? "planned",
      description: extractDescription(c.content),
    }));

    return {
      id: p.id,
      slug: p.slug,
      name: p.title,
      description: extractDescription(p.content),
      pageType: p.pageType,
      isPortfolio,
      status: propStr(props, "status") ?? "planned",
      priority: propStr(props, "priority"),
      ownerSlug,
      ownerName: ownerSlug ? titleBySlug.get(ownerSlug) ?? null : null,
      domainSlug,
      domainName: domainSlug ? titleBySlug.get(domainSlug) ?? null : null,
      parentProjectSlug: parentSlug,
      parentProjectName: parentSlug ? titleBySlug.get(parentSlug) ?? null : null,
      startDate: propStr(props, "start_date"),
      targetDate: propStr(props, "target_date"),
      completedDate: propStr(props, "completed_date"),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      deliverableCount: isPortfolio ? 0 : deliverableCounts.get(p.slug) ?? 0,
      childProjectCount: isPortfolio ? childPages.length : 0,
      childProjects,
    };
  });

  return NextResponse.json({ projects, total: projects.length });
}

// TODO: Wiki-first project creation is chat-driven. A future session will wire
// the advisor to synthesize a project_portfolio / project wiki page from a
// conversational request.
export async function POST(_req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. Project creation moves to chat-driven wiki writes in a later session." },
    { status: 501 },
  );
}

// TODO: Wiki-first project deletion has not been designed yet. Removing the
// underlying KnowledgePage record (and its children) will follow the same
// governance path as other wiki mutations.
export async function DELETE(_req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. Project deletion will move to governed wiki mutation in a later session." },
    { status: 501 },
  );
}
