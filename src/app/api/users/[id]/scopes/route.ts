import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;
  const { departmentEntityId } = await req.json().catch(() => ({ departmentEntityId: null }));

  if (!departmentEntityId) {
    return NextResponse.json({ error: "departmentEntityId is required" }, { status: 400 });
  }

  // Validate user in same operator
  const user = await prisma.user.findFirst({ where: { id: userId, operatorId: su.operatorId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Validate department exists and is foundational
  const dept = await prisma.entity.findFirst({
    where: { id: departmentEntityId, operatorId: su.operatorId, category: "foundational" },
    select: { id: true, displayName: true },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  // Check if scope already exists
  const existing = await prisma.userScope.findUnique({
    where: { userId_departmentEntityId: { userId, departmentEntityId } },
  });
  if (existing) {
    return NextResponse.json({ error: "User already has access to this department" }, { status: 409 });
  }

  const scope = await prisma.userScope.create({
    data: {
      userId,
      departmentEntityId,
      grantedById: su.user.id,
    },
  });

  return NextResponse.json({
    id: scope.id,
    departmentEntityId: scope.departmentEntityId,
    departmentName: dept.displayName,
  }, { status: 201 });
}
