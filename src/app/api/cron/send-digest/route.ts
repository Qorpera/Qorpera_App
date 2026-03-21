import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { compileDigest } from "@/lib/digest-compiler";
import { renderDigestEmail } from "@/emails/template-registry";
import { sendEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  // 1. Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Find eligible users: digestEnabled = true AND (lastDigestSentAt is null OR lastDigestSentAt < 23 hours ago)
  const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: {
      digestEnabled: true,
      OR: [
        { lastDigestSentAt: null },
        { lastDigestSentAt: { lt: cutoff } },
      ],
    },
    select: { id: true, email: true, name: true, operatorId: true },
  });

  let sent = 0;
  let skipped = 0;

  // 3. For each user, compile and send digest
  for (const user of users) {
    try {
      const digest = await compileDigest(user.id, user.operatorId);
      if (!digest) {
        skipped++;
        continue;
      }

      const emailContent = await renderDigestEmail({
        userName: user.name || "there",
        notifications: digest.notifications,
        periodStart: digest.periodStart.toISOString().split("T")[0],
        periodEnd: digest.periodEnd.toISOString().split("T")[0],
      });

      await sendEmail({
        to: user.email,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { lastDigestSentAt: new Date() },
      });

      sent++;
    } catch (error) {
      console.error(`Digest failed for user ${user.id}:`, error);
    }
  }

  return NextResponse.json({ sent, skipped, total: users.length });
}
