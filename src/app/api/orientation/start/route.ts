import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  // Check for an existing active session (not completed, not in "active" phase)
  const existing = await prisma.orientationSession.findFirst({
    where: { operatorId, completedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return NextResponse.json(
      { error: "An active orientation session already exists", session: existing },
      { status: 409 },
    );
  }

  // Create a new session (allows re-onboarding if previous sessions are completed)
  const session = await prisma.orientationSession.create({
    data: { operatorId },
  });

  return NextResponse.json({ session }, { status: 201 });
}
