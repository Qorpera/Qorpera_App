import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = session;

  // Fetch user's personal data (never expose passwordHash)
  const conversations = await prisma.copilotMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sessionId: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  const scopes = await prisma.userScope.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      departmentEntityId: true,
      grantedById: true,
      createdAt: true,
    },
  });

  const payload = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    conversations,
    preferences: [],
    scopes,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="qorpera-my-data.json"',
    },
  });
}
