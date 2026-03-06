import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const PHASE_ORDER = ["connecting", "learning", "orienting", "confirming", "active"] as const;

const advanceSchema = z.object({
  context: z.string().optional(),
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

  const nextPhase = PHASE_ORDER[currentIdx + 1];

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
