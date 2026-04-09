import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { bulkApproveStagedPages } from "@/lib/source-library";

export async function POST(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { sourceId } = body;
  if (!sourceId || typeof sourceId !== "string") {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  }

  const count = await bulkApproveStagedPages(sourceId);
  return NextResponse.json({ approved: count });
}
