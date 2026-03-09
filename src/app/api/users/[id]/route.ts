import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Only admins can update users" }, { status: 403 });
  }

  const { id } = await params;

  if (id === su.user.id) {
    return NextResponse.json({ error: "Cannot modify your own account" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { id, operatorId: su.operatorId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.role !== undefined) {
    const validRoles = ["admin", "member"];
    if (!validRoles.includes(body.role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }
    if (user.role === "superadmin") {
      return NextResponse.json({ error: "Cannot change superadmin role" }, { status: 403 });
    }
    data.role = body.role;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return NextResponse.json(updated);
}
