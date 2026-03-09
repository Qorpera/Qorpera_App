import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { relateEntities } from "@/lib/entity-resolution";
import { assignDepartmentSchema, parseBody } from "@/lib/api-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;
  const body = await req.json();
  const parsed = parseBody(assignDepartmentSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { departmentId } = parsed.data;

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
