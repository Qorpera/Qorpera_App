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
  { params }: { params: Promise<{ id: string; deliverableId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id, deliverableId } = await params;

  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      slug: deliverableId,
      pageType: "project_deliverable",
      scope: "operator",
    },
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      properties: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!page) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  const props = (page.properties ?? {}) as KgProperties;
  const parentSlug = propStr(props, "parent_project");

  // Enforce the route hierarchy: the deliverable's parent_project must match
  // the project slug in the URL. Mismatched hierarchies are 404 (the URL is
  // invalid, not merely forbidden).
  if (parentSlug !== id) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  const refSlugs = new Set<string>();
  if (parentSlug) refSlugs.add(parentSlug);
  for (const k of ["assigned_to", "accepted_by"]) {
    const v = propStr(props, k);
    if (v) refSlugs.add(v);
  }

  const titleBySlug = new Map<string, string>();
  if (refSlugs.size > 0) {
    const refs = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: [...refSlugs] }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const r of refs) titleBySlug.set(r.slug, r.title);
  }

  const assigned = propStr(props, "assigned_to");
  const accepted = propStr(props, "accepted_by");

  return NextResponse.json({
    id: page.id,
    slug: page.slug,
    title: page.title,
    content: page.content,
    stage: propStr(props, "stage") ?? "intelligence",
    status: propStr(props, "status") ?? "planned",
    parentProjectSlug: parentSlug,
    parentProjectName: parentSlug ? titleBySlug.get(parentSlug) ?? null : null,
    confidenceLevel: propStr(props, "confidence"),
    riskCount: propNum(props, "risk_count") ?? 0,
    assignedToSlug: assigned,
    assignedToName: assigned ? titleBySlug.get(assigned) ?? null : null,
    acceptedBySlug: accepted,
    acceptedByName: accepted ? titleBySlug.get(accepted) ?? null : null,
    acceptedAt: propStr(props, "accepted_date"),
    generationMode: propStr(props, "generation_mode"),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    // Legacy field referenced by UI; always null for wiki-only deliverables.
    completenessReport: null,
  });
}

// TODO: Deliverable edits (stage transitions, content rewrites, acceptance)
// will move to governed wiki mutation in a later session.
export async function PATCH(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string; deliverableId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. Deliverable updates move to governed wiki mutation in a later session." },
    { status: 501 },
  );
}

export async function DELETE(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string; deliverableId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. Deliverable deletion moves to governed wiki mutation in a later session." },
    { status: 501 },
  );
}
