import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const PHASE_ORDER = ["mapping", "populating", "connecting", "syncing", "orienting", "active"] as const;

const advanceSchema = z.object({
  context: z.string().optional(),
  targetPhase: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const operatorId = await getOperatorId();

  const body = await req.json().catch(() => ({}));
  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await prisma.orientationSession.findFirst({
    where: { operatorId, completedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!session) {
    return NextResponse.json({ error: "No active orientation session" }, { status: 404 });
  }

  const currentIdx = PHASE_ORDER.indexOf(session.phase as (typeof PHASE_ORDER)[number]);
  if (currentIdx === -1 || currentIdx >= PHASE_ORDER.length - 1) {
    return NextResponse.json(
      { error: `Cannot advance from phase "${session.phase}"` },
      { status: 422 },
    );
  }

  // Support advancing to a specific target phase (skipping intermediate phases)
  let nextPhase = PHASE_ORDER[currentIdx + 1];
  if (parsed.data.targetPhase) {
    const targetIdx = PHASE_ORDER.indexOf(parsed.data.targetPhase as (typeof PHASE_ORDER)[number]);
    if (targetIdx === -1) {
      return NextResponse.json({ error: `Invalid target phase "${parsed.data.targetPhase}"` }, { status: 400 });
    }
    if (targetIdx <= currentIdx) {
      return NextResponse.json({ error: `Target phase "${parsed.data.targetPhase}" is not ahead of current phase "${session.phase}"` }, { status: 422 });
    }
    nextPhase = PHASE_ORDER[targetIdx];
  }

  // Merge context if provided
  let mergedContext = session.context;
  if (parsed.data.context) {
    try {
      const existing = session.context ? JSON.parse(session.context) : {};
      const incoming = JSON.parse(parsed.data.context);
      mergedContext = JSON.stringify({ ...existing, ...incoming });
    } catch {
      return NextResponse.json({ error: "Invalid context JSON" }, { status: 400 });
    }
  }

  const updated = await prisma.orientationSession.update({
    where: { id: session.id },
    data: {
      phase: nextPhase,
      context: mergedContext,
      ...(nextPhase === "active" ? { completedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ session: updated });
}
