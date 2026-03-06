import { prisma } from "@/lib/db";

const RESOLUTION_SIGNALS: Record<string, (slug: string) => boolean> = {
  "invoice.paid": (slug) =>
    slug.includes("overdue") || slug.includes("invoice"),
  "payment.received": (slug) =>
    slug.includes("overdue") || slug.includes("invoice"),
};

const OPEN_STATUSES = ["detected", "reasoning", "proposed", "approved", "executing"];

export async function checkForSituationResolution(
  operatorId: string,
  eventType: string,
  entityIds: string[],
  eventId: string
): Promise<void> {
  const matcher = RESOLUTION_SIGNALS[eventType];
  if (!matcher) return;

  for (const entityId of entityIds) {
    const situations = await prisma.situation.findMany({
      where: {
        operatorId,
        triggerEntityId: entityId,
        status: { in: OPEN_STATUSES },
      },
      include: {
        situationType: { select: { slug: true, name: true } },
      },
    });

    for (const situation of situations) {
      if (!matcher(situation.situationType.slug)) continue;

      await prisma.situation.update({
        where: { id: situation.id },
        data: {
          status: "resolved",
          outcome: "positive",
          resolvedAt: new Date(),
          outcomeDetails: JSON.stringify({
            resolvedBy: "auto",
            eventType,
            eventId,
          }),
        },
      });

      // Get entity display name for notification
      const entity = await prisma.entity.findUnique({
        where: { id: entityId },
        select: { displayName: true },
      });

      await prisma.notification.create({
        data: {
          operatorId,
          title: `Situation resolved: ${situation.situationType.name}`,
          body: `Overdue invoice situation for ${entity?.displayName || "entity"} has been automatically resolved — payment received.`,
          sourceType: "situation",
          sourceId: situation.id,
        },
      });
    }
  }
}
