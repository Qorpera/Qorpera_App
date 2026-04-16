import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updatePageWithLock } from "@/lib/wiki-engine";

const ALLOWED_TYPES = new Set(["wiki_update", "wiki_create", "document", "settings_change"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();

  const deliverable = body.deliverable as Record<string, unknown> | undefined;
  if (!deliverable || typeof deliverable !== "object") {
    return NextResponse.json({ error: "deliverable object required" }, { status: 400 });
  }
  const type = deliverable.type as string | undefined;
  if (!type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "invalid deliverable type" }, { status: 400 });
  }

  const title = (deliverable.title as string | undefined)?.trim();
  const description = (deliverable.description as string | undefined)?.trim();
  const rationale = (deliverable.rationale as string | undefined)?.trim();

  if (!title || title.length < 3 || title.length > 200) {
    return NextResponse.json({ error: "title must be 3-200 characters" }, { status: 400 });
  }
  if (!description || description.length < 10 || description.length > 5000) {
    return NextResponse.json({ error: "description must be 10-5000 characters" }, { status: 400 });
  }
  if (!rationale || rationale.length < 10 || rationale.length > 2000) {
    return NextResponse.json({ error: "rationale must be 10-2000 characters" }, { status: 400 });
  }

  const targetPageSlug = (deliverable.targetPageSlug as string | undefined)?.trim();
  const targetPageType = (deliverable.targetPageType as string | undefined)?.trim();

  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "initiative",
      scope: "operator",
      slug: id,
    },
    select: { slug: true, properties: true },
  });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const currentStatus = (props.status as string | undefined) ?? "proposed";
  if (currentStatus !== "proposed") {
    return NextResponse.json(
      { error: `Can only edit deliverable of proposed initiatives (current: ${currentStatus})` },
      { status: 409 }
    );
  }

  // An edit cannot change the deliverable type — that would be regeneration, not editing.
  const existingDeliverable = props.primary_deliverable as { type?: string } | null;
  if (existingDeliverable?.type && existingDeliverable.type !== type) {
    return NextResponse.json(
      { error: `Cannot change deliverable type (was ${existingDeliverable.type}, got ${type})` },
      { status: 400 }
    );
  }

  const newDeliverable = {
    type,
    title,
    description,
    rationale,
    ...(targetPageSlug ? { targetPageSlug } : {}),
    ...(targetPageType ? { targetPageType } : {}),
  };

  // Re-check status + type-equality inside the lock to close the TOCTOU window
  // between the pre-lock read and the write. The pre-lock checks above are
  // fast-path validation for obvious violations; this handles concurrent
  // accept/reject/reasoning writes.
  let raced = false;
  await updatePageWithLock(operatorId, page.slug, (p) => {
    const pp = (p.properties ?? {}) as Record<string, unknown>;
    if (pp.status !== "proposed") {
      raced = true;
      return {};
    }
    const existing = pp.primary_deliverable as { type?: string } | null;
    if (existing?.type && existing.type !== type) {
      raced = true;
      return {};
    }
    return {
      properties: {
        ...pp,
        primary_deliverable: newDeliverable,
        deliverable_edited_at: new Date().toISOString(),
        deliverable_edited_by: user.id,
      },
    };
  });

  if (raced) {
    return NextResponse.json(
      { error: "Initiative state changed during edit. Refresh and try again." },
      { status: 409 }
    );
  }

  return NextResponse.json({ id: page.slug, primaryDeliverable: newDeliverable });
}
