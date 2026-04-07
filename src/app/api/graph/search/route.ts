import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchEntities } from "@/lib/entity-resolution";
import { getVisibleDomainIds } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const type = url.searchParams.get("type") ?? undefined;
  if (!q) return NextResponse.json([]);

  let results = await searchEntities(operatorId, q, type);

  // Post-filter by department scope
  if (visibleDomains !== "all") {
    const visibleSet = new Set(visibleDomains);
    results = results.filter((e: { primaryDomainId?: string | null; category?: string; id?: string }) => {
      if (e.category === "foundational") return visibleSet.has(e.id || "");
      if (e.category === "external") return true;
      if (e.primaryDomainId) return visibleSet.has(e.primaryDomainId);
      return false;
    });
  }

  return NextResponse.json(results);
}
