import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reasonAboutSituation } from "@/lib/reasoning-engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const operatorId = await getOperatorId();
  const { id } = params;

  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
  });

  if (!situation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only allow re-reasoning on certain statuses
  const allowedStatuses = ["detected", "proposed", "reasoning"];
  if (!allowedStatuses.includes(situation.status)) {
    return NextResponse.json(
      { error: `Cannot re-reason on situation with status "${situation.status}"` },
      { status: 400 },
    );
  }

  // Reset to detected so reasoning engine can pick it up
  await prisma.situation.update({
    where: { id },
    data: {
      status: "detected",
      reasoning: null,
      proposedAction: null,
    },
  });

  // Fire-and-forget reasoning
  reasonAboutSituation(id).catch((err) =>
    console.error(`[reason-api] Reasoning failed for situation ${id}:`, err),
  );

  return NextResponse.json({ id, status: "reasoning_triggered" });
}
