import { NextRequest, NextResponse } from "next/server";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { seedNotificationPreferences } from "@/lib/ai-entity-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const operator = await prisma.operator.findFirst({
    where: { inviteToken: token },
    select: { companyName: true, displayName: true },
  });

  if (!operator) {
    return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 404 });
  }

  return NextResponse.json({
    companyName: operator.companyName || operator.displayName || "Unknown",
    operatorName: operator.displayName || operator.companyName || "Unknown",
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const body = await req.json();
  const { name, email, password } = body as { name?: string; email?: string; password?: string };

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Validate token
  const operator = await prisma.operator.findFirst({
    where: { inviteToken: token },
    select: { id: true },
  });

  if (!operator) {
    return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 404 });
  }

  // Check if email already taken
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // Create user + AI entity atomically
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        operatorId: operator.id,
        email,
        name,
        passwordHash,
        role: "member",
      },
    });

    // Create personal AI assistant entity
    let aiAgentType = await tx.entityType.findFirst({
      where: { operatorId: operator.id, slug: "ai-agent" },
    });
    if (!aiAgentType) {
      const def = HARDCODED_TYPE_DEFS["ai-agent"];
      aiAgentType = await tx.entityType.create({
        data: {
          operatorId: operator.id,
          slug: def.slug,
          name: def.name,
          description: def.description,
          icon: def.icon,
          color: def.color,
          defaultCategory: def.defaultCategory,
        },
      });
    }

    await tx.entity.create({
      data: {
        operatorId: operator.id,
        entityTypeId: aiAgentType.id,
        displayName: `${name}'s Assistant`,
        category: "base",
        ownerUserId: newUser.id,
      },
    });

    return newUser;
  });

  // Non-transactional: seed preferences + create session (OK to fail independently)
  await seedNotificationPreferences(user.id, user.role);

  const { token: sessionToken, expiresAt } = await createSession(user.id);
  await setSessionCookie(sessionToken, expiresAt);

  return NextResponse.json({ ok: true }, { status: 201 });
}
