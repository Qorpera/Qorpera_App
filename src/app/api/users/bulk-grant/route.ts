import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sourceDepartmentId, targetDepartmentId } = await req.json().catch(() => ({}));
  if (!sourceDepartmentId || !targetDepartmentId) {
    return NextResponse.json({ error: "sourceDepartmentId and targetDepartmentId are required" }, { status: 400 });
  }

  // Verify both departments belong to this operator
  const [srcDept, tgtDept] = await Promise.all([
    prisma.entity.findFirst({ where: { id: sourceDepartmentId, operatorId: su.operatorId, category: "foundational" } }),
    prisma.entity.findFirst({ where: { id: targetDepartmentId, operatorId: su.operatorId, category: "foundational" } }),
  ]);
  if (!srcDept || !tgtDept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  // Find all member users whose entity is in the source department
  const users = await prisma.user.findMany({
    where: {
      operatorId: su.operatorId,
      role: "member",
      entity: { parentDepartmentId: sourceDepartmentId, category: "base" },
    },
    select: { id: true },
  });

  let granted = 0;
  let alreadyHad = 0;

  for (const u of users) {
    const existing = await prisma.userScope.findUnique({
      where: { userId_departmentEntityId: { userId: u.id, departmentEntityId: targetDepartmentId } },
    });
    if (existing) {
      alreadyHad++;
    } else {
      await prisma.userScope.create({
        data: { userId: u.id, departmentEntityId: targetDepartmentId, grantedById: su.user.id },
      });
      granted++;
    }
  }

  return NextResponse.json({ granted, alreadyHad });
}
