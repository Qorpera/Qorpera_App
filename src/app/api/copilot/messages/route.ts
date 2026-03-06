import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "default";

  const messages = await prisma.copilotMessage.findMany({
    where: { operatorId, sessionId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({ messages });
}
