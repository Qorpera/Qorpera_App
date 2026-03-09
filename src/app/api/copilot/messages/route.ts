import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "default";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "50"), 200);
  const beforeParam = req.nextUrl.searchParams.get("before");

  const where: Record<string, unknown> = { operatorId, sessionId, userId: user.id };
  if (beforeParam) {
    where.createdAt = { lt: new Date(beforeParam) };
  }

  const messages = await prisma.copilotMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();
  messages.reverse();

  return NextResponse.json({ messages, hasMore });
}
