import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      displayName: true,
      email: true,
      role: true,
      scopeEntityId: true,
      linkedEntityId: true,
      createdAt: true,
      operatorId: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const operator = await prisma.operator.findUnique({
    where: { id: user.operatorId },
    select: { displayName: true },
  });

  return NextResponse.json({
    ...user,
    operatorName: operator?.displayName ?? null,
  });
}
