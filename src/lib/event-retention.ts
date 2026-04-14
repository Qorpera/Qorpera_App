import { prisma } from "@/lib/db";

export async function cleanupOldEvents(
  operatorId: string,
  retentionDays: number = 90
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // First delete SituationEvent joins for old events
  const oldEvents = await prisma.event.findMany({
    where: {
      operatorId,
      processedAt: { not: null },
      createdAt: { lt: cutoff },
    },
    select: { id: true },
  });

  if (oldEvents.length === 0) return { deleted: 0 };

  const eventIds = oldEvents.map((e) => e.id);

  const result = await prisma.event.deleteMany({
    where: {
      id: { in: eventIds },
    },
  });

  return { deleted: result.count };
}
