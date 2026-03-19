import { NextRequest, NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { seedNotificationPreferences } from "@/lib/ai-entity-helpers";

class TxError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // All validation inside transaction to prevent TOCTOU race conditions
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { token } });
      if (!invite) throw new TxError("Invite not found", 404);
      if (invite.claimedAt) throw new TxError("This invite has already been used", 410);
      if (invite.expiresAt < new Date()) throw new TxError("This invite has expired", 400);

      const entity = await tx.entity.findUnique({
        where: { id: invite.entityId },
        select: { id: true, displayName: true, parentDepartmentId: true },
      });
      if (!entity) throw new TxError("Entity no longer exists", 400);

      const emailTaken = await tx.user.findUnique({ where: { email: invite.email } });
      if (emailTaken) throw new TxError("Email already in use", 409);

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

      // Create personal AI assistant entity
      let aiAgentType = await tx.entityType.findFirst({
        where: { operatorId: invite.operatorId, slug: "ai-agent" },
      });
      if (!aiAgentType) {
        const def = HARDCODED_TYPE_DEFS["ai-agent"];
        aiAgentType = await tx.entityType.create({
          data: {
            operatorId: invite.operatorId,
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
          operatorId: invite.operatorId,
          entityTypeId: aiAgentType.id,
          displayName: `${entity.displayName}'s Assistant`,
          category: "base",
          parentDepartmentId: entity.parentDepartmentId,
          ownerUserId: newUser.id,
        },
      });

      // Mark invite claimed
      await tx.invite.update({
        where: { id: invite.id },
        data: { claimedAt: new Date(), claimedByUserId: newUser.id },
      });

      return newUser;
    });
  } catch (error) {
    if (error instanceof TxError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // Seed notification preferences (idempotent, non-blocking)
  await seedNotificationPreferences(user.id, user.role);

  // Create session
  const { token: sessionToken, expiresAt } = await createSession(user.id);
  await setSessionCookie(sessionToken, expiresAt);

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    redirect: "/map",
  }, { status: 201 });
}
