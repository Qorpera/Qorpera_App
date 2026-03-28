import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createDelegation } from "@/lib/delegations";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const fromAiEntityId = url.searchParams.get("fromAiEntityId") ?? undefined;
  const toAiEntityId = url.searchParams.get("toAiEntityId") ?? undefined;
  const toUserId = url.searchParams.get("toUserId") ?? undefined;

  const where: Record<string, unknown> = { operatorId };
  if (status) where.status = status;
  if (fromAiEntityId) where.fromAiEntityId = fromAiEntityId;
  if (toAiEntityId) where.toAiEntityId = toAiEntityId;
  if (toUserId) where.toUserId = toUserId;

  // Members: only see delegations where toUserId is their own
  if (su.effectiveRole !== "admin" && su.effectiveRole !== "superadmin") {
    where.toUserId = su.effectiveUserId;
  }

  const delegations = await prisma.delegation.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Resolve entity/user names
  const aiEntityIds = [...new Set([
    ...delegations.map(d => d.fromAiEntityId),
    ...delegations.filter(d => d.toAiEntityId).map(d => d.toAiEntityId!),
  ])];
  const userIds = [...new Set(delegations.filter(d => d.toUserId).map(d => d.toUserId!))];

  const [aiEntities, users] = await Promise.all([
    aiEntityIds.length > 0
      ? prisma.entity.findMany({
          where: { id: { in: aiEntityIds }, operatorId },
          select: { id: true, displayName: true },
        })
      : [],
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds }, operatorId },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const aiMap = new Map(aiEntities.map(e => [e.id, e.displayName]));
  const userMap = new Map(users.map(u => [u.id, u.name]));

  const items = delegations.map(d => ({
    id: d.id,
    fromAiEntityId: d.fromAiEntityId,
    fromAiEntityName: aiMap.get(d.fromAiEntityId) ?? null,
    toAiEntityId: d.toAiEntityId,
    toAiEntityName: d.toAiEntityId ? aiMap.get(d.toAiEntityId) ?? null : null,
    toUserId: d.toUserId,
    toUserName: d.toUserId ? userMap.get(d.toUserId) ?? null : null,
    instruction: d.instruction,
    status: d.status,
    workStreamId: d.workStreamId,
    situationId: d.situationId,
    initiativeId: d.initiativeId,
    returnReason: d.returnReason,
    completedNotes: d.completedNotes,
    createdAt: d.createdAt.toISOString(),
    completedAt: d.completedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { fromAiEntityId, toAiEntityId, toUserId, instruction, context, workStreamId, situationId, initiativeId } = body;

  if (!fromAiEntityId || !instruction) {
    return NextResponse.json({ error: "fromAiEntityId and instruction are required" }, { status: 400 });
  }

  try {
    const delegation = await createDelegation({
      operatorId,
      fromAiEntityId,
      toAiEntityId,
      toUserId,
      instruction,
      context: context ?? {},
      workStreamId,
      situationId,
      initiativeId,
    });

    // Resolve names for response
    const fromEntity = await prisma.entity.findUnique({
      where: { id: delegation.fromAiEntityId },
      select: { displayName: true },
    });

    return NextResponse.json({
      ...delegation,
      fromAiEntityName: fromEntity?.displayName ?? null,
      context: delegation.context ? JSON.parse(delegation.context) : null,
      createdAt: delegation.createdAt.toISOString(),
      completedAt: delegation.completedAt?.toISOString() ?? null,
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create delegation";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
