import { NextRequest, NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.claimedAt) {
    return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite has expired" }, { status: 400 });
  }

  // Look up entity
  const entity = await prisma.entity.findUnique({
    where: { id: invite.entityId },
    select: { id: true, displayName: true, parentDepartmentId: true },
  });
  if (!entity) {
    return NextResponse.json({ error: "Entity no longer exists" }, { status: 400 });
  }

  // Race condition guard
  const emailTaken = await prisma.user.findUnique({ where: { email: invite.email } });
  if (emailTaken) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  // Transaction: create user, scope, mark invite
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        operatorId: invite.operatorId,
        email: invite.email,
        name: entity.displayName,
        passwordHash: invite.passwordHash,
        role: invite.role,
        entityId: entity.id,
      },
    });

    // Create UserScope for the entity's department
    if (entity.parentDepartmentId) {
      await tx.userScope.create({
        data: {
          userId: newUser.id,
          departmentEntityId: entity.parentDepartmentId,
          grantedById: invite.createdById,
        },
      });
    }

    // Mark invite claimed
    await tx.invite.update({
      where: { id: invite.id },
      data: { claimedAt: new Date(), claimedByUserId: newUser.id },
    });

    return newUser;
  });

  // Create session
  const { token: sessionToken, expiresAt } = await createSession(user.id);
  await setSessionCookie(sessionToken, expiresAt);

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    redirect: "/map",
  }, { status: 201 });
}
