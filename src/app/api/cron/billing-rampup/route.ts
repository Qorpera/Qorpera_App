import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find operators where billing started >30 days ago but multiplier is still 0.50
  const operatorsToUpgrade = await prisma.operator.findMany({
    where: {
      billingStatus: "active",
      orchestrationFeeMultiplier: 0.50,
      billingStartedAt: { lte: thirtyDaysAgo },
    },
  });

  let upgraded = 0;
  for (const op of operatorsToUpgrade) {
    await prisma.operator.update({
      where: { id: op.id },
      data: { orchestrationFeeMultiplier: 1.0 },
    });

    await sendNotificationToAdmins({
      operatorId: op.id,
      type: "system_alert",
      title: "Pricing update: learning period complete",
      body: "Your AI has completed its first month. Standard orchestration rates now apply. View your billing dashboard for details.",
      sourceType: "operator",
      sourceId: op.id,
    }).catch(console.error);

    upgraded++;
  }

  return Response.json({ upgraded, checked: operatorsToUpgrade.length });
}
