import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type KgProperties = Record<string, unknown>;

function propStr(p: KgProperties, key: string): string | null {
  const v = p[key];
  return typeof v === "string" ? v : null;
}

function propNum(p: KgProperties, key: string): number | null {
  const v = p[key];
  return typeof v === "number" ? v : null;
}

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

interface DeliverableSummary {
  id: string;
  slug: string;
  title: string;
  stage: string;
  status: string;
  confidenceLevel: string | null;
  riskCount: number;
  assignedToSlug: string | null;
  assignedToName: string | null;
  acceptedBySlug: string | null;
  acceptedByName: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      slug: id,
      pageType: { in: ["project_portfolio", "project"] },
      scope: "operator",
    },
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

  if (!page) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const props = (page.properties ?? {}) as KgProperties;
  const isPortfolio = page.pageType === "project_portfolio";

  // Fetch hierarchy: child projects for a portfolio, child deliverables for a project.
  const childPages = isPortfolio
    ? await prisma.knowledgePage.findMany({
        where: {
          operatorId,
          pageType: "project",
          scope: "operator",
          properties: { path: ["parent_project"], equals: page.slug },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          content: true,
          properties: true,
        },
      })
    : [];
  const deliverablePages = !isPortfolio
    ? await prisma.knowledgePage.findMany({
        where: {
          operatorId,
          pageType: "project_deliverable",
          scope: "operator",
          properties: { path: ["parent_project"], equals: page.slug },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          properties: true,
          createdAt: true,
        },
      })
    : [];

  // For portfolios, count deliverables per child project in one batched query.
  const childDeliverableCounts = new Map<string, number>();
  if (isPortfolio && childPages.length > 0) {
    const childSlugs = childPages.map((c) => c.slug);
    const childDeliverables = await prisma.knowledgePage.findMany({
      where: {
        operatorId,
        pageType: "project_deliverable",
        scope: "operator",
        OR: childSlugs.map((slug) => ({
          properties: { path: ["parent_project"], equals: slug },
        })),
      },
      select: { properties: true },
    });
    for (const d of childDeliverables) {
      const dp = (d.properties ?? {}) as KgProperties;
      const parent = propStr(dp, "parent_project");
      if (!parent) continue;
      childDeliverableCounts.set(parent, (childDeliverableCounts.get(parent) ?? 0) + 1);
    }
  }

  // Collect every slug we need to resolve to a human-readable title.
  const refSlugs = new Set<string>();
  for (const k of ["owner", "domain", "parent_project", "spawned_from"]) {
    const v = propStr(props, k);
    if (v) refSlugs.add(v);
  }
  for (const c of childPages) {
    const cp = (c.properties ?? {}) as KgProperties;
    const owner = propStr(cp, "owner");
    if (owner) refSlugs.add(owner);
  }
  for (const d of deliverablePages) {
    const dp = (d.properties ?? {}) as KgProperties;
    for (const k of ["assigned_to", "accepted_by"]) {
      const v = propStr(dp, k);
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

  const ownerSlug = propStr(props, "owner");
  const domainSlug = propStr(props, "domain");
  const parentSlug = propStr(props, "parent_project");
  const spawnedFromSlug = propStr(props, "spawned_from");

  const childProjects = childPages.map((c) => {
    const cp = (c.properties ?? {}) as KgProperties;
    const childOwnerSlug = propStr(cp, "owner");
    return {
      id: c.id,
      slug: c.slug,
      name: c.title,
      description: extractDescription(c.content),
      status: propStr(cp, "status") ?? "planned",
      priority: propStr(cp, "priority"),
      ownerSlug: childOwnerSlug,
      ownerName: childOwnerSlug ? titleBySlug.get(childOwnerSlug) ?? null : null,
      deliverableCount: childDeliverableCounts.get(c.slug) ?? 0,
    };
  });

  const summaries: DeliverableSummary[] = deliverablePages.map((d) => {
    const dp = (d.properties ?? {}) as KgProperties;
    const assigned = propStr(dp, "assigned_to");
    const accepted = propStr(dp, "accepted_by");
    return {
      id: d.id,
      slug: d.slug,
      title: d.title,
      stage: propStr(dp, "stage") ?? "intelligence",
      status: propStr(dp, "status") ?? "planned",
      confidenceLevel: propStr(dp, "confidence"),
      riskCount: propNum(dp, "risk_count") ?? 0,
      assignedToSlug: assigned,
      assignedToName: assigned ? titleBySlug.get(assigned) ?? null : null,
      acceptedBySlug: accepted,
      acceptedByName: accepted ? titleBySlug.get(accepted) ?? null : null,
      acceptedAt: propStr(dp, "accepted_date"),
      createdAt: d.createdAt.toISOString(),
    };
  });

  const buckets: { intelligence: DeliverableSummary[]; workboard: DeliverableSummary[]; deliverable: DeliverableSummary[] } = {
    intelligence: [],
    workboard: [],
    deliverable: [],
  };
  for (const d of summaries) {
    if (d.stage === "intelligence") buckets.intelligence.push(d);
    else if (d.stage === "workboard") buckets.workboard.push(d);
    else if (d.stage === "deliverable") buckets.deliverable.push(d);
  }

  return NextResponse.json({
    id: page.id,
    slug: page.slug,
    name: page.title,
    description: extractDescription(page.content),
    content: page.content,
    pageType: page.pageType,
    isPortfolio,
    status: propStr(props, "status") ?? "planned",
    priority: propStr(props, "priority"),
    ownerSlug,
    ownerName: ownerSlug ? titleBySlug.get(ownerSlug) ?? null : null,
    domainSlug,
    domainName: domainSlug ? titleBySlug.get(domainSlug) ?? null : null,
    parentProjectSlug: parentSlug,
    parentProjectName: parentSlug ? titleBySlug.get(parentSlug) ?? null : null,
    spawnedFromSlug,
    spawnedFromName: spawnedFromSlug ? titleBySlug.get(spawnedFromSlug) ?? null : null,
    startDate: propStr(props, "start_date"),
    targetDate: propStr(props, "target_date"),
    completedDate: propStr(props, "completed_date"),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    childProjects,
    deliverables: buckets,
    // Legacy DB-backed data — always empty for wiki-only pages. Keeping the
    // fields in the response shape avoids breaking UI that still reads them.
    members: [],
    connectors: [],
    messages: [],
    notifications: [],
    stageCounts: {
      intelligence: buckets.intelligence.length,
      workboard: buckets.workboard.length,
      deliverable: buckets.deliverable.length,
    },
  });
}

// TODO: Wiki-first project mutation moves to governed wiki writes (policy
// gateway + PATCH /api/wiki/[slug]) in a later session.
export async function PATCH(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. Project updates move to governed wiki mutation in a later session." },
    { status: 501 },
  );
}

export async function DELETE(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. Project deletion moves to governed wiki mutation in a later session." },
    { status: 501 },
  );
}
