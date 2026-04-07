import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { retrieveRelevantContext } from "@/lib/rag/retriever";
import { getVisibleDomainIds, canAccessDomain } from "@/lib/domain-scope";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);
  const body = await req.json();

  const { query, domainIds } = body as {
    query: string;
    domainIds?: string[];
  };

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing 'query' string" }, { status: 400 });
  }

  // Filter requested domainIds to only visible departments
  let scopedDeptIds = domainIds ?? [];
  if (visibleDomains !== "all") {
    scopedDeptIds = scopedDeptIds.filter((id) => canAccessDomain(visibleDomains, id));
    // If no department IDs requested, default to visible departments
    if (scopedDeptIds.length === 0 && (!domainIds || domainIds.length === 0)) {
      scopedDeptIds = visibleDomains;
    }
  }

  const results = await retrieveRelevantContext(
    query,
    operatorId,
    scopedDeptIds,
    5,
    { userId: su.user.id, skipUserFilter: false },
  );

  return NextResponse.json({ results });
}
