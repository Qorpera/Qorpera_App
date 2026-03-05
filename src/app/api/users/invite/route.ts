import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId, getUserRole, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const currentUserId = await getUserId();
  const currentRole = await getUserRole();

  if (currentRole !== "admin") {
    return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 });
  }

  const body = await req.json();
  const { email, displayName, password, role } = body;

  if (!email || !displayName || !password) {
    return NextResponse.json({ error: "email, displayName, and password are required" }, { status: 400 });
  }

  const validRoles = ["admin", "supervisor", "finance", "sales", "support", "viewer"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  // Check if user already exists
  const existing = await prisma.user.findFirst({ where: { operatorId, email } });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      operatorId,
      email,
      displayName,
      passwordHash,
      role: role || "viewer",
      invitedBy: currentUserId,
    },
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  }, { status: 201 });
}

export async function GET() {
  const operatorId = await getOperatorId();
  const users = await prisma.user.findMany({
    where: { operatorId },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}
