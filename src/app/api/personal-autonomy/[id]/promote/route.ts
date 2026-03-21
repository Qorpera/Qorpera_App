import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendNotification } from "@/lib/notification-dispatch";

const LEVELS = ["supervised", "notify", "autonomous"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  if (!body.level || !LEVELS.includes(body.level)) {
    return NextResponse.json({ error: "level must be 'supervised', 'notify', or 'autonomous'" }, { status: 400 });
  }

  const pa = await prisma.personalAutonomy.findFirst({
    where: { id, operatorId: su.operatorId },
    include: { aiEntity: true, situationType: true },
  });
  if (!pa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify promotion direction (can't demote via promote endpoint)
  const currentIndex = LEVELS.indexOf(pa.autonomyLevel as typeof LEVELS[number]);
  const targetIndex = LEVELS.indexOf(body.level);
  if (targetIndex <= currentIndex) {
    return NextResponse.json(
      { error: `Cannot promote from ${pa.autonomyLevel} to ${body.level}` },
      { status: 400 },
    );
  }

  const updated = await prisma.personalAutonomy.update({
    where: { id },
    data: {
      autonomyLevel: body.level,
      promotedAt: new Date(),
      promotedById: su.user.id,
    },
  });

  // Notify the user whose AI was promoted (Entity.ownerUserId → User)
  if (pa.aiEntity.ownerUserId) {
    await sendNotification({
      operatorId: su.operatorId,
      userId: pa.aiEntity.ownerUserId,
      type: "system_alert",
      title: `Your AI autonomy upgraded to ${body.level}`,
      body: `An admin has promoted your AI's autonomy for "${pa.situationType.name}" situations from ${pa.autonomyLevel} to ${body.level}.`,
      linkUrl: "/learning",
    }).catch(() => {});
  }

  return NextResponse.json(updated);
}
