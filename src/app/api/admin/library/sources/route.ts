import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listSources } from "@/lib/source-library";

export async function GET(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const filters = {
    sourceType: url.searchParams.get("sourceType") || undefined,
    sourceAuthority: url.searchParams.get("sourceAuthority") || undefined,
    domain: url.searchParams.get("domain") || undefined,
    status: url.searchParams.get("status") || undefined,
    integrityStatus: url.searchParams.get("integrityStatus") || undefined,
  };

  const sources = await listSources(filters);
  return NextResponse.json(sources);
}
