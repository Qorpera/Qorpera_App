import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const aiEntities = await prisma.entity.findMany({
    where: {
      operatorId: su.operatorId,
      entityType: { slug: "ai-agent" },
      status: "active",
    },
    include: {
      ownerUser: { select: { id: true, name: true } },
      primaryDomain: { select: { displayName: true } },
    },
  });

  const aiIds = aiEntities.map(e => e.id);
  const paRows = aiIds.length > 0
    ? await prisma.personalAutonomy.findMany({
        where: { aiEntityId: { in: aiIds } },
        include: { situationType: { select: { name: true } } },
      })
    : [];

  const RANK: Record<string, number> = { supervised: 0, notify: 1, autonomous: 2 };

  const result = aiEntities.map(ai => {
    const rows = paRows.filter(pa => pa.aiEntityId === ai.id);
    const counts = { supervised: 0, notify: 0, autonomous: 0 };
    let topTask: { name: string; level: string } | null = null;
    let topRank = -1;

    for (const r of rows) {
      if (counts[r.autonomyLevel as keyof typeof counts] !== undefined) {
        counts[r.autonomyLevel as keyof typeof counts]++;
      }
      const rank = RANK[r.autonomyLevel] ?? 0;
      if (rank > topRank) {
        topRank = rank;
        topTask = { name: r.situationType.name, level: r.autonomyLevel };
      }
    }

    return {
      id: ai.id,
      name: ai.displayName,
      ownerName: ai.ownerUser?.name ?? "Unknown",
      department: ai.primaryDomain?.displayName ?? "Unassigned",
      counts,
      topTask,
    };
  });

  return NextResponse.json(result);
}
