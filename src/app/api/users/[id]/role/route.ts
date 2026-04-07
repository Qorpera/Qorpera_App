import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { role } = await req.json().catch(() => ({ role: null }));

  if (!role || !["admin", "member"].includes(role)) {
    return NextResponse.json({ error: "Role must be 'admin' or 'member'" }, { status: 400 });
  }

  // Cannot change superadmin role
  const targetUser = await prisma.user.findFirst({
    where: { id: id, operatorId: su.operatorId },
    include: { entity: { select: { primaryDomainId: true } }, scopes: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (targetUser.role === "superadmin") {
    return NextResponse.json({ error: "Cannot change superadmin role" }, { status: 403 });
  }

  // Cannot change own role
  if (id === su.user.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  // If demoting admin to member: ensure at least one scope exists
  if (targetUser.role === "admin" && role === "member" && targetUser.scopes.length === 0) {
    if (targetUser.entity?.primaryDomainId) {
      await prisma.userScope.create({
        data: {
          userId: id,
          domainEntityId: targetUser.entity.primaryDomainId,
          grantedById: su.user.id,
        },
      });
    } else {
      return NextResponse.json({
        error: "Cannot demote: user has no department assignment. Assign a department scope first.",
      }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json(updated);
}
