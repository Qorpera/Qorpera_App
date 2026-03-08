import { NextRequest, NextResponse } from "next/server";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const { displayName, password } = body;

  if (!displayName || !password) {
    return NextResponse.json({ error: "displayName and password are required" }, { status: 400 });
  }

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.claimedAt) {
    return NextResponse.json({ error: "This invite has already been claimed" }, { status: 400 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite has expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  // Determine scopeEntityId
  let scopeEntityId: string | null = invite.departmentId;
  if (invite.role === "admin" || !scopeEntityId) {
    // Admin gets CompanyHQ scope
    const hq = await prisma.entity.findFirst({
      where: {
        operatorId: invite.operatorId,
        entityType: { slug: "organization" },
        category: "foundational",
      },
    });
    scopeEntityId = hq?.id || null;
  }

  // Auto-link: search for team-member entity with matching email
  let linkedEntityId: string | null = null;
  if (invite.departmentId) {
    const emailProp = await prisma.entityProperty.findFirst({
      where: { slug: "email", entityType: { slug: "team-member" } },
    });
    if (emailProp) {
      const match = await prisma.propertyValue.findFirst({
        where: {
          propertyId: emailProp.id,
          value: invite.email,
          entity: {
            operatorId: invite.operatorId,
            parentDepartmentId: invite.departmentId,
            category: "base",
            status: "active",
          },
        },
      });
      if (match) linkedEntityId = match.entityId;
    }
  }

  const user = await prisma.user.create({
    data: {
      operatorId: invite.operatorId,
      email: invite.email,
      displayName,
      passwordHash,
      role: invite.role,
      invitedBy: invite.invitedBy,
      scopeEntityId,
      linkedEntityId,
    },
  });

  // Mark invite as claimed
  await prisma.invite.update({
    where: { id: invite.id },
    data: { claimedAt: new Date(), claimedBy: user.id },
  });

  // Create session
  const sessionToken = await createSession(invite.operatorId, user.id);
  const cookieStore = await cookies();
  const cookieOpts = setSessionCookie(sessionToken);
  cookieStore.set(cookieOpts.name, cookieOpts.value, {
    httpOnly: cookieOpts.httpOnly,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    secure: cookieOpts.secure,
    maxAge: cookieOpts.maxAge,
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    scopeEntityId: user.scopeEntityId,
    linkedEntityId: user.linkedEntityId,
  }, { status: 201 });
}
