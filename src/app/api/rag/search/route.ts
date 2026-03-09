import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { retrieveRelevantContext } from "@/lib/rag/retriever";
import { getVisibleDepartmentIds, canAccessDepartment } from "@/lib/user-scope";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.user.id);
  const body = await req.json();

  const { query, departmentIds } = body as {
    query: string;
    departmentIds?: string[];
  };

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing 'query' string" }, { status: 400 });
  }

  // Filter requested departmentIds to only visible departments
  let scopedDeptIds = departmentIds ?? [];
  if (visibleDepts !== "all") {
    scopedDeptIds = scopedDeptIds.filter((id) => canAccessDepartment(visibleDepts, id));
    // If no department IDs requested, default to visible departments
    if (scopedDeptIds.length === 0 && (!departmentIds || departmentIds.length === 0)) {
      scopedDeptIds = visibleDepts;
    }
  }

  const results = await retrieveRelevantContext(
    query,
    operatorId,
    scopedDeptIds,
    5,
  );

  return NextResponse.json({ results });
}
