import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getStagedPage,
  approveStagedPage,
  rejectStagedPage,
  editStagedPage,
} from "@/lib/source-library";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const { pageId } = await params;
  const page = await getStagedPage(pageId);
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  return NextResponse.json(page);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const { pageId } = await params;
  const body = await request.json();
  const { action } = body;

  switch (action) {
    case "approve":
      await approveStagedPage(pageId, body.reviewNote);
      return NextResponse.json({ ok: true });

    case "reject":
      if (!body.reason) {
        return NextResponse.json({ error: "reason is required for rejection" }, { status: 400 });
      }
      await rejectStagedPage(pageId, body.reason, body.reviewNote);
      return NextResponse.json({ ok: true });

    case "edit":
      if (!body.content || typeof body.content !== "string") {
        return NextResponse.json({ error: "content is required for edit" }, { status: 400 });
      }
      await editStagedPage(pageId, body.content);
      return NextResponse.json({ ok: true });

    default:
      return NextResponse.json({ error: "Invalid action. Use: approve, reject, edit" }, { status: 400 });
  }
}
