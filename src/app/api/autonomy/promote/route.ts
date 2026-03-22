import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

const PROMOTION_MAP: Record<string, string> = {
  supervised: "notify",
  notify: "autonomous",
};

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;
  const { situationTypeId } = await req.json();

  const st = await prisma.situationType.findFirst({
    where: { id: situationTypeId, operatorId },
  });

  if (!st) {
    return NextResponse.json({ error: "Situation type not found" }, { status: 404 });
  }

  const nextLevel = PROMOTION_MAP[st.autonomyLevel];
  if (!nextLevel) {
    return NextResponse.json({ error: "Already at maximum autonomy" }, { status: 400 });
  }

  const updated = await prisma.situationType.update({
    where: { id: situationTypeId },
    data: {
      autonomyLevel: nextLevel,
      lastModifiedById: su.user.id,
      lastModifiedAt: new Date(),
    },
  });

  await sendNotificationToAdmins({
    operatorId,
    type: "graduation_proposal",
    title: `Promoted: ${st.name} → ${nextLevel}`,
    body: `${st.name} has been promoted to ${nextLevel} mode.`,
    sourceType: "graduation",
    sourceId: situationTypeId,
  }).catch(() => {});

  return NextResponse.json(updated);
}
