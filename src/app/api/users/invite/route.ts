import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId, getUserRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const currentUserId = await getUserId();
  const currentRole = await getUserRole();

  if (currentRole !== "admin") {
    return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 });
  }

  const body = await req.json();
  const { email, role, departmentId } = body;

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const validRoles = ["admin", "supervisor", "finance", "sales", "support", "viewer"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  // Non-admin roles require a department
  const effectiveRole = role || "viewer";
  if (effectiveRole !== "admin" && !departmentId) {
    return NextResponse.json({ error: "departmentId is required for non-admin roles" }, { status: 400 });
  }

  // Validate department if provided
  if (departmentId) {
    const dept = await prisma.entity.findFirst({
      where: { id: departmentId, operatorId, category: "foundational" },
    });
    if (!dept) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }
  }

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({ where: { operatorId, email } });
  if (existingUser) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  // Check for existing pending invite
  const existingInvite = await prisma.invite.findFirst({
    where: { operatorId, email, claimedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) {
    // Return existing invite instead of creating duplicate
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    return NextResponse.json({
      id: existingInvite.id,
      token: existingInvite.token,
      inviteUrl: `${baseUrl}/invite/${existingInvite.token}`,
      email: existingInvite.email,
      role: existingInvite.role,
      expiresAt: existingInvite.expiresAt,
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.invite.create({
    data: {
      operatorId,
      email,
      role: effectiveRole,
      departmentId: departmentId || null,
      token,
      invitedBy: currentUserId,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  // Get department name if applicable
  let departmentName = null;
  if (departmentId) {
    const dept = await prisma.entity.findUnique({ where: { id: departmentId }, select: { displayName: true } });
    departmentName = dept?.displayName;
  }

  return NextResponse.json({
    id: invite.id,
    token: invite.token,
    inviteUrl: `${baseUrl}/invite/${token}`,
    email: invite.email,
    role: invite.role,
    departmentName,
    expiresAt: invite.expiresAt,
  }, { status: 201 });
}

export async function GET() {
  const operatorId = await getOperatorId();

  const [invites, users] = await Promise.all([
    prisma.invite.findMany({
      where: { operatorId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { operatorId },
      select: {
        id: true, email: true, displayName: true, role: true,
        scopeEntityId: true, linkedEntityId: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Resolve department names for invites and users
  const deptIds = [
    ...invites.filter(i => i.departmentId).map(i => i.departmentId!),
    ...users.filter(u => u.scopeEntityId).map(u => u.scopeEntityId!),
  ];
  const depts = deptIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const deptMap = new Map(depts.map(d => [d.id, d.displayName]));

  // Resolve inviter names
  const inviterIds = [...new Set(invites.map(i => i.invitedBy))];
  const inviters = inviterIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: inviterIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const inviterMap = new Map(inviters.map(u => [u.id, u.displayName]));

  return NextResponse.json({
    invites: invites.map(i => ({
      ...i,
      departmentName: i.departmentId ? deptMap.get(i.departmentId) : null,
      inviterName: inviterMap.get(i.invitedBy) ?? "Unknown",
      status: i.claimedAt ? "claimed" : i.expiresAt < new Date() ? "expired" : "pending",
    })),
    users: users.map(u => ({
      ...u,
      departmentName: u.scopeEntityId ? deptMap.get(u.scopeEntityId) : "All (Admin)",
    })),
  });
}
