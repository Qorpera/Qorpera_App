import { extractInsights, getLastExtractionTime } from "@/lib/operational-knowledge";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results: Array<{ aiEntityId: string; result: unknown }> = [];

  // Get all AI entities (personal + department + HQ)
  const aiEntities = await prisma.entity.findMany({
    where: {
      entityType: { slug: { in: ["ai-agent", "department-ai", "hq-ai"] } },
      status: "active",
    },
    select: { id: true, operatorId: true },
  });

  for (const entity of aiEntities) {
    const operator = await prisma.operator.findUnique({
      where: { id: entity.operatorId },
      select: { createdAt: true },
    });
    if (!operator) continue;

    const operatorAgeDays = (Date.now() - operator.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const lastExtraction = await getLastExtractionTime(entity.id);

    if (operatorAgeDays <= 7) {
      // Daily: skip if extracted in last 20 hours
      if (lastExtraction && (Date.now() - lastExtraction.getTime()) < 20 * 60 * 60 * 1000) continue;
    } else {
      // Weekly: skip if extracted in last 6 days
      if (lastExtraction && (Date.now() - lastExtraction.getTime()) < 6 * 24 * 60 * 60 * 1000) continue;
    }

    try {
      const result = await extractInsights(entity.operatorId, entity.id);
      results.push({ aiEntityId: entity.id, result });
    } catch (err) {
      results.push({ aiEntityId: entity.id, result: { error: (err as Error).message } });
    }
  }

  return Response.json({ processed: results.length, results });
}
