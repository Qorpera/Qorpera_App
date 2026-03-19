import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { removeItemFromWorkStream } from "@/lib/workstreams";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id: workStreamId, itemId: workStreamItemId } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Verify workstream belongs to operator
  const ws = await prisma.workStream.findFirst({
    where: { id: workStreamId, operatorId },
    select: { id: true },
  });
  if (!ws) {
    return NextResponse.json({ error: "WorkStream not found" }, { status: 404 });
  }

  try {
    await removeItemFromWorkStream(workStreamId, workStreamItemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to remove item";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
