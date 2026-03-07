import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DEMOTION_MAP: Record<string, string> = {
  autonomous: "notify",
  notify: "supervised",
};

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { situationTypeId } = await req.json();

  const st = await prisma.situationType.findFirst({
    where: { id: situationTypeId, operatorId },
  });

  if (!st) {
    return NextResponse.json({ error: "Situation type not found" }, { status: 404 });
  }

  const nextLevel = DEMOTION_MAP[st.autonomyLevel];
  if (!nextLevel) {
    return NextResponse.json({ error: "Already at minimum autonomy" }, { status: 400 });
  }

  const updated = await prisma.situationType.update({
    where: { id: situationTypeId },
    data: { autonomyLevel: nextLevel, consecutiveApprovals: 0 },
  });

  return NextResponse.json(updated);
}
