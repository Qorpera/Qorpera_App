import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchSourceText } from "@/lib/source-library";

export async function GET(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q parameter required" }, { status: 400 });

  const limitParam = url.searchParams.get("limit");
  const results = await searchSourceText(q, {
    domain: url.searchParams.get("domain") || undefined,
    sourceType: url.searchParams.get("sourceType") || undefined,
    limit: limitParam ? parseInt(limitParam, 10) : undefined,
  });

  return NextResponse.json(results);
}
