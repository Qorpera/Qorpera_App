import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id: departmentId } = await params;

  const aiEntity = await prisma.entity.findFirst({
    where: {
      operatorId,
      ownerDepartmentId: departmentId,
      status: "active",
    },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
    },
  });

  if (!aiEntity) {
    return NextResponse.json({ error: "Department AI not found" }, { status: 404 });
  }

  return NextResponse.json(aiEntity);
}
