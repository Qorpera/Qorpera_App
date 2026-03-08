import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { relateEntities } from "@/lib/entity-resolution";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;
  const body = await req.json();

  const { departmentId } = body;
  if (!departmentId) {
    return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  }

  const entity = await prisma.entity.findFirst({
    where: { id, operatorId, status: "active" },
  });
  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const dept = await prisma.entity.findFirst({
    where: { id: departmentId, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  await relateEntities(operatorId, id, departmentId, "department-member");

  return NextResponse.json({ ok: true });
}
