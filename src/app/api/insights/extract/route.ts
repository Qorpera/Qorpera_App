import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractInsights } from "@/lib/operational-knowledge";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { aiEntityId } = body as { aiEntityId?: string };

  const results: Array<{ aiEntityId: string; result: unknown }> = [];

  if (aiEntityId) {
    // Validate entity belongs to operator
    const entity = await prisma.entity.findFirst({
      where: {
        id: aiEntityId,
        operatorId,
        entityType: { slug: { in: ["ai-agent", "department-ai", "hq-ai"] } },
      },
      select: { id: true },
    });
    if (!entity) {
      return NextResponse.json({ error: "AI entity not found" }, { status: 404 });
    }

    const result = await extractInsights(operatorId, aiEntityId);
    results.push({ aiEntityId, result });
  } else {
    // Extract for all AI entities in operator
    const entities = await prisma.entity.findMany({
      where: {
        operatorId,
        entityType: { slug: { in: ["ai-agent", "department-ai", "hq-ai"] } },
        status: "active",
      },
      select: { id: true },
    });

    for (const entity of entities) {
      try {
        const result = await extractInsights(operatorId, entity.id);
        results.push({ aiEntityId: entity.id, result });
      } catch (err) {
        results.push({ aiEntityId: entity.id, result: { error: (err as Error).message } });
      }
    }
  }

  return NextResponse.json({ results });
}
