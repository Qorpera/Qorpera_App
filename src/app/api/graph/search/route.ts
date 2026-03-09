import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchEntities } from "@/lib/entity-resolution";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.user.id);
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const type = url.searchParams.get("type") ?? undefined;
  if (!q) return NextResponse.json([]);

  let results = await searchEntities(operatorId, q, type);

  // Post-filter by department scope
  if (visibleDepts !== "all") {
    const visibleSet = new Set(visibleDepts);
    results = results.filter((e: { parentDepartmentId?: string | null; category?: string; id?: string }) => {
      if (e.category === "foundational") return visibleSet.has(e.id || "");
      if (e.category === "external") return true;
      if (e.parentDepartmentId) return visibleSet.has(e.parentDepartmentId);
      return false;
    });
  }

  return NextResponse.json(results);
}
