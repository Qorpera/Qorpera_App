import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getGraphData } from "@/lib/entity-model-store";
import { getVisibleDomainIds } from "@/lib/domain-scope";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);
  const data = await getGraphData(operatorId);

  // Post-filter graph nodes/edges by department scope
  if (visibleDomains !== "all") {
    const visibleSet = new Set(visibleDomains);
    const isNodeVisible = (n: { id: string; primaryDomainId?: string | null; category?: string }) => {
      if (n.category === "foundational") return visibleSet.has(n.id);
      if (n.category === "external") return true;
      if (n.primaryDomainId) return visibleSet.has(n.primaryDomainId);
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
