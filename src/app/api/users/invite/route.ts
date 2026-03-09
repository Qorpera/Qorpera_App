import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import crypto from "crypto";

const InviteSchema = z.object({
  entityId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["member", "admin"]).default("member"),
});

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }

  const { entityId, email, password, role } = parsed.data;
  const operatorId = su.operatorId;

  // Validate entity
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, operatorId, category: "base" },
    include: { parentDepartment: { select: { displayName: true } } },
  });
  if (!entity) {
    return NextResponse.json({ error: "Entity not found or not a base entity in this operator" }, { status: 404 });
  }

  // Check if entity already has a user account
  const existingUser = await prisma.user.findFirst({ where: { entityId } });
  if (existingUser) {
    return NextResponse.json({ error: "This person already has an account" }, { status: 409 });
  }

  // Check email uniqueness
  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  // Check for pending invite for this entity
  const pendingInvite = await prisma.invite.findFirst({
    where: { operatorId, entityId, claimedAt: null, expiresAt: { gt: new Date() } },
  });
  if (pendingInvite) {
    return NextResponse.json({
      error: "Pending invite exists for this person",
      existingInviteId: pendingInvite.id,
    }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const invite = await prisma.invite.create({
    data: {
      operatorId,
      entityId,
      email,
      role,
      passwordHash,
      token,
      expiresAt,
      createdById: su.user.id,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const link = `${baseUrl}/invite/${token}`;

  return NextResponse.json({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      entityName: entity.displayName,
      departmentName: entity.parentDepartment?.displayName ?? null,
      link,
      expiresAt: invite.expiresAt,
    },
  }, { status: 201 });
}

export async function GET() {
  // Alias for /api/users/invites — list pending invites
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.invite.findMany({
    where: { operatorId: su.operatorId, claimedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  const entityIds = invites.map((i) => i.entityId);
  const entities = entityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, displayName: true, parentDepartmentId: true },
      })
    : [];
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  // Get department names
  const deptIds = [...new Set(entities.filter((e) => e.parentDepartmentId).map((e) => e.parentDepartmentId!))];
  const depts = deptIds.length > 0
    ? await prisma.entity.findMany({ where: { id: { in: deptIds } }, select: { id: true, displayName: true } })
    : [];
  const deptMap = new Map(depts.map((d) => [d.id, d.displayName]));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return NextResponse.json(
    invites.map((inv) => {
      const ent = entityMap.get(inv.entityId);
      return {
        id: inv.id,
        entityId: inv.entityId,
        email: inv.email,
        role: inv.role,
        entityName: ent?.displayName ?? "Unknown",
        departmentName: ent?.parentDepartmentId ? deptMap.get(ent.parentDepartmentId) ?? null : null,
        link: `${baseUrl}/invite/${inv.token}`,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      };
    })
  );
}
