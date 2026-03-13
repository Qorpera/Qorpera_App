import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const aiEntity = await prisma.entity.findFirst({
    where: { ownerUserId: su.user.id, operatorId: su.operatorId, status: "active" },
    select: { id: true },
  });
  if (!aiEntity) return NextResponse.json([]);

  const rows = await prisma.personalAutonomy.findMany({
    where: { aiEntityId: aiEntity.id },
    include: { situationType: { select: { name: true, slug: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(rows);
}
