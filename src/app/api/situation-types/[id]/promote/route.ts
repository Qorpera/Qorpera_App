import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const LEVELS = ["supervised", "notify", "autonomous"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  if (!body.level || !LEVELS.includes(body.level)) {
    return NextResponse.json({ error: "level must be 'supervised', 'notify', or 'autonomous'" }, { status: 400 });
  }

  const st = await prisma.situationType.findFirst({
    where: { id, operatorId: su.operatorId },
  });
  if (!st) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify promotion direction
  const currentIndex = LEVELS.indexOf(st.autonomyLevel as typeof LEVELS[number]);
  const targetIndex = LEVELS.indexOf(body.level);
  if (targetIndex <= currentIndex) {
    return NextResponse.json(
      { error: `Cannot promote from ${st.autonomyLevel} to ${body.level}` },
      { status: 400 },
    );
  }

  await prisma.situationType.update({
    where: { id },
    data: {
      autonomyLevel: body.level,
      lastModifiedById: su.user.id,
      lastModifiedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true });
}
