import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const contextSchema = z.object({
  context: z.record(z.unknown()),
});

export async function PATCH(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;

  const body = await req.json().catch(() => ({}));
  const parsed = contextSchema.safeParse(body);
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

  const existing = session.context ? JSON.parse(session.context) : {};
  const merged = deepMerge(existing, parsed.data.context);

  const updated = await prisma.orientationSession.update({
    where: { id: session.id },
    data: { context: JSON.stringify(merged) },
  });

  return NextResponse.json({ session: updated });
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const tVal = target[key];
    const sVal = source[key];
    if (isPlainObject(tVal) && isPlainObject(sVal)) {
      result[key] = deepMerge(tVal as Record<string, unknown>, sVal as Record<string, unknown>);
    } else {
      result[key] = sVal;
    }
  }
  return result;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
