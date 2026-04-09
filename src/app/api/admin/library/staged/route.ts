import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listStagedPages } from "@/lib/source-library";

export async function GET(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  const pages = await listStagedPages({
    sourceId: url.searchParams.get("sourceId") || undefined,
    pageType: url.searchParams.get("pageType") || undefined,
    limit: limitParam ? parseInt(limitParam, 10) : undefined,
    offset: offsetParam ? parseInt(offsetParam, 10) : undefined,
  });

  return NextResponse.json(pages);
}
