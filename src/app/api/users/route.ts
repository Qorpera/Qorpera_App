import { NextResponse } from "next/server";
import { getSessionUser, excludeSuperadmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { operatorId: su.operatorId, ...excludeSuperadmin() },
    include: {
      entity: { select: { displayName: true, parentDepartmentId: true } },
      scopes: { select: { id: true, departmentEntityId: true } },
      sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  // Get department names for scopes and entity parents
  const deptIds = new Set<string>();
  for (const u of users) {
    for (const s of u.scopes) deptIds.add(s.departmentEntityId);
    if (u.entity?.parentDepartmentId) deptIds.add(u.entity.parentDepartmentId);
  }
  const depts = deptIds.size > 0
    ? await prisma.entity.findMany({
        where: { id: { in: [...deptIds] } },
        select: { id: true, displayName: true },
      })
    : [];
  const deptMap = new Map(depts.map((d) => [d.id, d.displayName]));

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      entityId: u.entityId,
      entityName: u.entity?.displayName ?? null,
      departmentName: u.entity?.parentDepartmentId ? deptMap.get(u.entity.parentDepartmentId) ?? null : null,
      scopes: u.scopes.map((s) => ({
        id: s.id,
        departmentEntityId: s.departmentEntityId,
        departmentName: deptMap.get(s.departmentEntityId) ?? "Unknown",
      })),
      lastActive: u.sessions[0]?.createdAt ?? null,
      createdAt: u.createdAt,
    }))
  );
}
