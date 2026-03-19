import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { amendExecutionPlan } from "@/lib/execution-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { planId } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const plan = await prisma.executionPlan.findFirst({
    where: { id: planId, operatorId },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const body = await req.json();
  const { amendments } = body;

  if (!Array.isArray(amendments) || amendments.length === 0) {
    return NextResponse.json({ error: "amendments array is required" }, { status: 400 });
  }

  for (const a of amendments) {
    if (typeof a.stepSequenceOrder !== "number" || typeof a.newDescription !== "string" || !a.newDescription.trim()) {
      return NextResponse.json({ error: "Each amendment requires stepSequenceOrder (number) and newDescription (string)" }, { status: 400 });
    }
  }

  try {
    await amendExecutionPlan(planId, amendments);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Amendment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const updated = await prisma.executionPlan.findUnique({
    where: { id: planId },
    include: { steps: { orderBy: { sequenceOrder: "asc" } } },
  });

  return NextResponse.json(updated);
}
