import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const aiEntity = await prisma.entity.findFirst({
    where: { ownerUserId: su.user.id, operatorId: su.operatorId, status: "active" },
    select: {
      id: true,
      displayName: true,
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
      parentDepartment: { select: { id: true, displayName: true } },
      fromRelations: {
        where: { relationshipType: { slug: "department-member" } },
        select: { toEntity: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!aiEntity) return NextResponse.json(null);

  const departments = [];
  if (aiEntity.parentDepartment) departments.push(aiEntity.parentDepartment);
  for (const rel of aiEntity.fromRelations) departments.push(rel.toEntity);

  return NextResponse.json({ ...aiEntity, departments });
}
