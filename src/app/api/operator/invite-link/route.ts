import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import crypto from "crypto";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: { inviteToken: true, inviteTokenCreatedAt: true },
  });

  if (!operator || !operator.inviteToken) {
    return NextResponse.json({ inviteUrl: null, createdAt: null });
  }

  const base = process.env.APP_BASE || "http://localhost:3000";
  return NextResponse.json({
    inviteUrl: `${base}/join/${operator.inviteToken}`,
    createdAt: operator.inviteTokenCreatedAt?.toISOString() ?? null,
  });
}

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();

  await prisma.operator.update({
    where: { id: su.operatorId },
    data: { inviteToken: token, inviteTokenCreatedAt: now },
  });

  const base = process.env.APP_BASE || "http://localhost:3000";
  return NextResponse.json({
    inviteUrl: `${base}/join/${token}`,
    createdAt: now.toISOString(),
  });
}

export async function DELETE() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await prisma.operator.update({
    where: { id: su.operatorId },
    data: { inviteToken: null, inviteTokenCreatedAt: null },
  });

  return NextResponse.json({ ok: true });
}
