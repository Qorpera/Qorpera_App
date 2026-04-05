import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.projectTemplate.findMany({
    where: {
      OR: [
        { operatorId: null },
        { operatorId: su.operatorId },
      ],
    },
    orderBy: [{ operatorId: "asc" }, { category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      operatorId: true,
      name: true,
      description: true,
      category: true,
      analysisFramework: true,
      dataExpectations: true,
    },
  });

  return NextResponse.json({ templates });
}
