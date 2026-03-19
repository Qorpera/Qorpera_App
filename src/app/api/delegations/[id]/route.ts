import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveDelegation, completeDelegation, returnDelegation } from "@/lib/delegations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  const delegation = await prisma.delegation.findFirst({
    where: { id, operatorId },
  });

  if (!delegation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Members can only see their own delegations
  if (user.role !== "admin" && user.role !== "superadmin") {
    if (delegation.toUserId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // Resolve related data
  const [fromEntity, toEntity, toUser, linkedSituation] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: delegation.fromAiEntityId },
      select: { id: true, displayName: true, parentDepartmentId: true },
    }),
    delegation.toAiEntityId
      ? prisma.entity.findUnique({
          where: { id: delegation.toAiEntityId },
          select: { id: true, displayName: true, parentDepartmentId: true },
        })
      : null,
    delegation.toUserId
      ? prisma.user.findUnique({
          where: { id: delegation.toUserId },
          select: { id: true, name: true, email: true },
        })
      : null,
    // Find situation created from this delegation
    prisma.situation.findFirst({
      where: { delegationId: delegation.id, operatorId },
      select: { id: true, status: true },
    }),
  ]);

  return NextResponse.json({
    id: delegation.id,
    fromAiEntityId: delegation.fromAiEntityId,
    fromAiEntityName: fromEntity?.displayName ?? null,
    toAiEntityId: delegation.toAiEntityId,
    toAiEntityName: toEntity?.displayName ?? null,
    toUserId: delegation.toUserId,
    toUserName: toUser?.name ?? null,
    instruction: delegation.instruction,
    context: delegation.context ? JSON.parse(delegation.context) : null,
    status: delegation.status,
    workStreamId: delegation.workStreamId,
    situationId: delegation.situationId,
    initiativeId: delegation.initiativeId,
    returnReason: delegation.returnReason,
    completedNotes: delegation.completedNotes,
    linkedSituation,
    createdAt: delegation.createdAt.toISOString(),
    completedAt: delegation.completedAt?.toISOString() ?? null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  const delegation = await prisma.delegation.findFirst({
    where: { id, operatorId },
  });

  if (!delegation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { action, notes, returnReason } = body;

  if (!action || !["approve", "complete", "return"].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve', 'complete', or 'return'" }, { status: 400 });
  }

  try {
    if (action === "approve") {
      // Admin only
      if (user.role !== "admin" && user.role !== "superadmin") {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      await approveDelegation(id, user.id, operatorId);
      return NextResponse.json({ id, status: "accepted" });
    }

    if (action === "complete") {
      // Admin or the toUserId
      if (user.role !== "admin" && user.role !== "superadmin" && delegation.toUserId !== user.id) {
        return NextResponse.json({ error: "Not authorized to complete this delegation" }, { status: 403 });
      }
      if (!notes) {
        return NextResponse.json({ error: "notes is required for completion" }, { status: 400 });
      }
      await completeDelegation(id, user.id, notes, operatorId);
      return NextResponse.json({ id, status: "completed" });
    }

    if (action === "return") {
      // Admin, or toUserId for human delegations
      const isAdmin = user.role === "admin" || user.role === "superadmin";
      const isTarget = delegation.toUserId === user.id;
      if (!isAdmin && !isTarget) {
        return NextResponse.json({ error: "Not authorized to return this delegation" }, { status: 403 });
      }
      if (!returnReason) {
        return NextResponse.json({ error: "returnReason is required" }, { status: 400 });
      }
      await returnDelegation(id, user.id, returnReason, operatorId);
      return NextResponse.json({ id, status: "returned" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
