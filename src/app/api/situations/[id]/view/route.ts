import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = params;

  // Verify situation belongs to this operator
  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
    select: { id: true },
  });
  if (!situation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Upsert the view record
  try {
    await prisma.situationView.upsert({
      where: { userId_situationId: { userId: user.id, situationId: id } },
      create: { userId: user.id, situationId: id },
      update: { viewedAt: new Date() },
    });
  } catch {
    return NextResponse.json({ error: "Failed to record view" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
