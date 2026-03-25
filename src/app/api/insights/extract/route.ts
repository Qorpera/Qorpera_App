import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { aiEntityId } = body as { aiEntityId?: string };

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

    const jobId = await enqueueWorkerJob("extract_insights", operatorId, {
      operatorId,
      aiEntityId,
    });
    return NextResponse.json({ status: "queued", jobId });
  }

  // Batch extraction — enqueue one per entity
  const entities = await prisma.entity.findMany({
    where: {
      operatorId,
      entityType: { slug: { in: ["ai-agent", "department-ai", "hq-ai"] } },
      status: "active",
    },
    select: { id: true },
  });

  for (const entity of entities) {
    await enqueueWorkerJob("extract_insights", operatorId, {
      operatorId,
      aiEntityId: entity.id,
    });
  }

  return NextResponse.json({ status: "queued", count: entities.length });
}
