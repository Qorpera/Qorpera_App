import { prisma } from "@/lib/db";

// ── Create WorkStream ────────────────────────────────────────────────────────

interface CreateWorkStreamParams {
  operatorId: string;
  title: string;
  description: string;
  goalId?: string;
  ownerAiEntityId: string;
  parentWorkStreamId?: string;
}

export async function createWorkStream(params: CreateWorkStreamParams) {
  if (params.parentWorkStreamId) {
    const parent = await prisma.workStream.findFirst({
      where: { id: params.parentWorkStreamId, operatorId: params.operatorId },
      select: { id: true },
    });
    if (!parent) throw new Error("Parent WorkStream not found or wrong operator");
  }

  return prisma.workStream.create({
    data: {
      operatorId: params.operatorId,
      title: params.title,
      description: params.description,
      goalId: params.goalId ?? null,
      ownerAiEntityId: params.ownerAiEntityId,
      parentWorkStreamId: params.parentWorkStreamId ?? null,
    },
  });
}

// ── Add Item ─────────────────────────────────────────────────────────────────

export async function addItemToWorkStream(
  workStreamId: string,
  itemType: "situation" | "initiative",
  itemId: string,
  operatorId: string,
) {
  // Verify workstream belongs to operator
  const ws = await prisma.workStream.findFirst({
    where: { id: workStreamId, operatorId },
    select: { id: true },
  });
  if (!ws) throw new Error("WorkStream not found or wrong operator");

  // Verify item exists and belongs to operator
  if (itemType === "situation") {
    const item = await prisma.situation.findFirst({
      where: { id: itemId, operatorId },
      select: { id: true },
    });
    if (!item) throw new Error("Situation not found or wrong operator");
  } else {
    const item = await prisma.initiative.findFirst({
      where: { id: itemId, operatorId },
      select: { id: true },
    });
    if (!item) throw new Error("Initiative not found or wrong operator");
  }

  // Upsert to avoid duplicate errors
  return prisma.workStreamItem.upsert({
    where: {
      workStreamId_itemType_itemId: { workStreamId, itemType, itemId },
    },
    create: { workStreamId, itemType, itemId },
    update: {},
  });
}

// ── Remove Item ──────────────────────────────────────────────────────────────

export async function removeItemFromWorkStream(
  workStreamId: string,
  workStreamItemId: string,
) {
  await prisma.workStreamItem.delete({
    where: { id: workStreamItemId, workStreamId },
  });

  await recheckWorkStreamStatus(workStreamId);
}

// ── Recheck Status (auto-complete / reopen) ──────────────────────────────────

export async function recheckWorkStreamStatus(workStreamId: string): Promise<void> {
  const ws = await prisma.workStream.findUnique({
    where: { id: workStreamId },
    include: { items: true },
  });
  if (!ws) return;

  const children = await prisma.workStream.findMany({
    where: { parentWorkStreamId: workStreamId },
    select: { id: true, status: true },
  });

  // Check each item's terminal status
  let allTerminal = true;

  for (const item of ws.items) {
    if (item.itemType === "situation") {
      const situation = await prisma.situation.findUnique({
        where: { id: item.itemId },
        select: { status: true },
      });
      if (!situation || !["resolved", "dismissed"].includes(situation.status)) {
        allTerminal = false;
        break;
      }
    } else if (item.itemType === "initiative") {
      const initiative = await prisma.initiative.findUnique({
        where: { id: item.itemId },
        select: { status: true },
      });
      if (!initiative || !["completed", "rejected"].includes(initiative.status)) {
        allTerminal = false;
        break;
      }
    }
  }

  // Check child workstreams
  if (allTerminal) {
    for (const child of children) {
      if (child.status !== "completed") {
        allTerminal = false;
        break;
      }
    }
  }

  const hasItems = ws.items.length > 0 || children.length > 0;

  if (allTerminal && hasItems && ws.status === "active") {
    await prisma.workStream.update({
      where: { id: workStreamId },
      data: { status: "completed", completedAt: new Date() },
    });
  } else if (!allTerminal && ws.status === "completed") {
    await prisma.workStream.update({
      where: { id: workStreamId },
      data: { status: "active", completedAt: null },
    });
  }

  // Recursively check parent
  if (ws.parentWorkStreamId) {
    await recheckWorkStreamStatus(ws.parentWorkStreamId);
  }
}

// ── Get WorkStream Context (for reasoning) ───────────────────────────────────

export async function getWorkStreamContext(workStreamId: string) {
  const ws = await prisma.workStream.findUnique({
    where: { id: workStreamId },
    include: { items: true },
  });
  if (!ws) return null;

  // Load item details
  const itemDetails: Array<{ type: string; id: string; status: string; summary: string }> = [];

  for (const item of ws.items) {
    if (item.itemType === "situation") {
      const s = await prisma.situation.findUnique({
        where: { id: item.itemId },
        include: { situationType: { select: { name: true } } },
      });
      if (s) {
        itemDetails.push({
          type: "situation",
          id: s.id,
          status: s.status,
          summary: s.situationType.name,
        });
      }
    } else if (item.itemType === "initiative") {
      const i = await prisma.initiative.findUnique({
        where: { id: item.itemId },
        select: { id: true, status: true, rationale: true },
      });
      if (i) {
        itemDetails.push({
          type: "initiative",
          id: i.id,
          status: i.status,
          summary: i.rationale.slice(0, 200),
        });
      }
    }
  }

  // Load goal context
  let goal = null;
  if (ws.goalId) {
    goal = await prisma.goal.findUnique({
      where: { id: ws.goalId },
      select: { id: true, title: true, description: true },
    });
  }

  // Load parent context
  let parent = null;
  if (ws.parentWorkStreamId) {
    const p = await prisma.workStream.findUnique({
      where: { id: ws.parentWorkStreamId },
      include: { items: { select: { itemType: true, itemId: true } } },
    });
    if (p) {
      parent = { id: p.id, title: p.title, description: p.description, itemCount: p.items.length };
    }
  }

  return {
    id: ws.id,
    title: ws.title,
    description: ws.description,
    status: ws.status,
    goal,
    items: itemDetails,
    parent,
  };
}
