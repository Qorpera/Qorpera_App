import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
  const cursor = url.searchParams.get("cursor") || undefined;

  const transactions = await prisma.creditTransaction.findMany({
    where: { operatorId: su.operatorId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = transactions.length > limit;
  const items = hasMore ? transactions.slice(0, limit) : transactions;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({
    transactions: items.map((t) => ({
      id: t.id,
      type: t.type,
      amountCents: t.amountCents,
      balanceAfter: t.balanceAfter,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    })),
    nextCursor,
  });
}
