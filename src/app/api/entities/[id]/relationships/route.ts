import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getEntityRelationships } from "@/lib/entity-model-store";
import { getVisibleDepartmentIds, canAccessEntity } from "@/lib/user-scope";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.user.id);
  if (!(await canAccessEntity(id, visibleDepts, operatorId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const relationships = await getEntityRelationships(operatorId, id);
  return NextResponse.json({ relationships });
}
