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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  // [id] is a project or project_portfolio slug. Validate the parent page
  // exists — deliverables only make sense under a real project node.
  const parent = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      slug: id,
      pageType: { in: ["project_portfolio", "project"] },
      scope: "operator",
    },
    select: { slug: true },
  });
  if (!parent) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      pageType: "project_deliverable",
      scope: "operator",
      properties: { path: ["parent_project"], equals: id },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      properties: true,
      createdAt: true,
    },
  });

  const refSlugs = new Set<string>();
  for (const p of pages) {
    const props = (p.properties ?? {}) as KgProperties;
    for (const k of ["assigned_to", "accepted_by"]) {
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

  const deliverables = pages.map((p) => {
    const props = (p.properties ?? {}) as KgProperties;
    const assigned = propStr(props, "assigned_to");
    const accepted = propStr(props, "accepted_by");
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      stage: propStr(props, "stage") ?? "intelligence",
      status: propStr(props, "status") ?? "planned",
      confidenceLevel: propStr(props, "confidence"),
      riskCount: propNum(props, "risk_count") ?? 0,
      assignedToSlug: assigned,
      assignedToName: assigned ? titleBySlug.get(assigned) ?? null : null,
      acceptedBySlug: accepted,
      acceptedByName: accepted ? titleBySlug.get(accepted) ?? null : null,
      acceptedAt: propStr(props, "accepted_date"),
      createdAt: p.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ deliverables });
}

// TODO: Wiki-first deliverable creation will move to chat-driven wiki writes
// in a later session (advisor synthesizes a project_deliverable page).
export async function POST(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. Deliverable creation moves to chat-driven wiki writes in a later session." },
    { status: 501 },
  );
}
