import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reasonAboutSituation } from "@/lib/reasoning-engine";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = params;

  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
    include: { situationType: { select: { scopeEntityId: true } } },
  });

  if (!situation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Scope check
  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (visibleDepts !== "all") {
    const scopeDept = situation.situationType?.scopeEntityId;
    if (scopeDept && !visibleDepts.includes(scopeDept)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
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
