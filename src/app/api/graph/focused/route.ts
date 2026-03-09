import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getFocusedSubgraph } from "@/lib/graph-traversal";
import { getVisibleDepartmentIds, canAccessEntity } from "@/lib/user-scope";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const entityId = new URL(req.url).searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "entityId required" }, { status: 400 });

  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.user.id);
  if (!(await canAccessEntity(entityId, visibleDepts, operatorId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await getFocusedSubgraph(operatorId, entityId);

  // Post-filter traversal results by department scope
  if (visibleDepts !== "all" && result.nodes.length > 0) {
    const visibleSet = new Set(visibleDepts);
    const nodeIds = result.nodes.map((n) => n.id);
    const entities = await prisma.entity.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true, parentDepartmentId: true, category: true },
    });
    const entityMap = new Map(entities.map((e) => [e.id, e]));
    const allowedIds = new Set(
      result.nodes
        .filter((n) => {
          const e = entityMap.get(n.id);
          if (!e) return false;
          if (e.category === "foundational") return visibleSet.has(e.id);
          if (e.category === "external") return true;
          if (e.parentDepartmentId) return visibleSet.has(e.parentDepartmentId);
          return false;
        })
        .map((n) => n.id),
    );
    result.nodes = result.nodes.filter((n) => allowedIds.has(n.id));
    result.edges = result.edges.filter((e) => allowedIds.has(e.source) && allowedIds.has(e.target));
  }

  return NextResponse.json(result);
}
