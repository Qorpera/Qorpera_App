import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId, getUserRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const currentUserId = await getUserId();
  const currentRole = await getUserRole();

  if (currentRole !== "admin") {
    return NextResponse.json({ error: "Only admins can update users" }, { status: 403 });
  }

  const { id } = await params;

  // Cannot change own role
  if (id === currentUserId) {
    return NextResponse.json({ error: "Cannot modify your own account" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { id, operatorId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.role !== undefined) {
    const validRoles = ["admin", "supervisor", "finance", "sales", "support", "viewer"];
    if (!validRoles.includes(body.role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }
    data.role = body.role;
  }

  if (body.scopeEntityId !== undefined) {
    // Validate the entity exists and belongs to operator
    if (body.scopeEntityId) {
      const entity = await prisma.entity.findFirst({
        where: { id: body.scopeEntityId, operatorId },
      });
      if (!entity) {
        return NextResponse.json({ error: "Scope entity not found" }, { status: 404 });
      }
    }
    data.scopeEntityId = body.scopeEntityId || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, displayName: true, role: true,
      scopeEntityId: true, linkedEntityId: true, createdAt: true,
    },
  });

  return NextResponse.json(updated);
}
