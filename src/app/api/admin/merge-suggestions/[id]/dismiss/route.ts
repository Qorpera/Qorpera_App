import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
  const { id } = await params;

  const suggestion = await prisma.entityMergeLog.findFirst({
    where: { id, operatorId, mergeType: "ml_suggestion", reversedAt: null },
  });
  if (!suggestion) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });

  await prisma.entityMergeLog.update({
    where: { id },
    data: { reversedAt: new Date() }, // dismissed
  });

  return NextResponse.json({ success: true });
}
