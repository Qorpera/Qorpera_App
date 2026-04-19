import { prisma } from "@/lib/db";

const SOURCE_TYPE_PATHS: Record<string, string> = {
  situation: "situations",
  idea: "ideas",
  insight: "insights",
};

function sourceTypeToPath(sourceType: string): string {
  return SOURCE_TYPE_PATHS[sourceType] || sourceType;
}

interface DigestNotification {
  type: string;
  title: string;
  summary: string;
  viewUrl: string;
  createdAt: string;
}

export async function compileDigest(userId: string, operatorId: string): Promise<{
  notifications: DigestNotification[];
  periodStart: Date;
  periodEnd: Date;
} | null> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);

  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      operatorId,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { createdAt: "desc" },
    select: {
      title: true,
      body: true,
      sourceType: true,
      sourceId: true,
      createdAt: true,
    },
  });

  if (notifications.length === 0) return null;

  const mapped: DigestNotification[] = notifications.map((n) => ({
    type: n.sourceType || "system_alert",
    title: n.title,
    summary: n.body,
    viewUrl: n.sourceType && n.sourceId
      ? `/${sourceTypeToPath(n.sourceType)}/${n.sourceId}`
      : "/",
    createdAt: n.createdAt.toISOString(),
  }));

  return { notifications: mapped, periodStart, periodEnd };
}
