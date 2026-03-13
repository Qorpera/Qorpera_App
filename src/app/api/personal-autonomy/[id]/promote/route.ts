import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const validLevels = ["supervised", "notify", "autonomous"];
  if (!validLevels.includes(body.level)) {
    return NextResponse.json({ error: "Invalid level" }, { status: 400 });
  }

  const pa = await prisma.personalAutonomy.findFirst({
    where: { id, operatorId: su.operatorId },
  });
  if (!pa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.personalAutonomy.update({
    where: { id },
    data: { autonomyLevel: body.level },
  });
  return NextResponse.json(updated);
}
