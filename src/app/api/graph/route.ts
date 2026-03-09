import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getGraphData } from "@/lib/entity-model-store";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.user.id);
  const data = await getGraphData(operatorId);

  // Post-filter graph nodes/edges by department scope
  if (visibleDepts !== "all") {
    const visibleSet = new Set(visibleDepts);
    const isNodeVisible = (n: { id: string; parentDepartmentId?: string | null; category?: string }) => {
      if (n.category === "foundational") return visibleSet.has(n.id);
      if (n.category === "external") return true;
      if (n.parentDepartmentId) return visibleSet.has(n.parentDepartmentId);
      return false;
    };
    if (data.nodes) {
      data.nodes = data.nodes.filter(isNodeVisible);
      const nodeIds = new Set(data.nodes.map((n: { id: string }) => n.id));
      if (data.edges) {
        data.edges = data.edges.filter((e: { fromEntityId?: string; toEntityId?: string; source?: string; target?: string }) =>
          nodeIds.has(e.fromEntityId || e.source || "") && nodeIds.has(e.toEntityId || e.target || "")
        );
      }
    }
  }

  return NextResponse.json(data);
}
