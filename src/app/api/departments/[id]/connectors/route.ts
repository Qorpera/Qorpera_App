import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { relateEntities } from "@/lib/entity-resolution";

async function backfillBindingEntities(
  operatorId: string,
  connectorId: string,
  departmentId: string,
  entityTypeFilter: string[] | null,
): Promise<{ routed: number }> {
  const events = await prisma.event.findMany({
    where: {
      connectorId,
      operatorId,
      processedAt: { not: null },
      entityRefs: { not: null },
    },
    select: { entityRefs: true },
  });

  const entityIds = new Set<string>();
  for (const event of events) {
    try {
      const refs: string[] = JSON.parse(event.entityRefs!);
      for (const id of refs) entityIds.add(id);
    } catch { /* skip malformed */ }
  }

  if (entityIds.size === 0) return { routed: 0 };

  const entities = await prisma.entity.findMany({
    where: {
      id: { in: Array.from(entityIds) },
      operatorId,
      status: "active",
    },
    include: {
      entityType: { select: { slug: true } },
    },
  });

  let routed = 0;

  for (const entity of entities) {
    if (entityTypeFilter && !entityTypeFilter.includes(entity.entityType.slug)) continue;
    if (entity.category === "external") continue;

    try {
      await relateEntities(operatorId, entity.id, departmentId, "department-member");
      routed++;
    } catch (err) {
      console.error(`[backfill] Failed to route entity ${entity.id}:`, err);
    }
  }

  return { routed };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const bindings = await prisma.connectorDepartmentBinding.findMany({
    where: { departmentId: id },
    include: {
      connector: {
        select: { id: true, provider: true, name: true, status: true, lastSyncAt: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = bindings.map((b) => ({
    id: b.id,
    connectorId: b.connectorId,
    departmentId: b.departmentId,
    entityTypeFilter: b.entityTypeFilter ? JSON.parse(b.entityTypeFilter) : null,
    enabled: b.enabled,
    createdAt: b.createdAt,
    connector: b.connector,
  }));

  return NextResponse.json({ bindings: result });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;
  const body = await req.json();

  const { connectorId, entityTypeFilter } = body;
  if (!connectorId) {
    return NextResponse.json({ error: "connectorId is required" }, { status: 400 });
  }

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId, operatorId },
  });
  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const existing = await prisma.connectorDepartmentBinding.findFirst({
    where: { connectorId, departmentId: id },
  });
  if (existing) {
    return NextResponse.json({ error: "Binding already exists for this connector and department" }, { status: 409 });
  }

  const binding = await prisma.connectorDepartmentBinding.create({
    data: {
      operatorId,
      connectorId,
      departmentId: id,
      entityTypeFilter: entityTypeFilter ? JSON.stringify(entityTypeFilter) : null,
    },
    include: {
      connector: {
        select: { id: true, provider: true, name: true, status: true, lastSyncAt: true },
      },
    },
  });

  // Fire-and-forget backfill for already-synced entities
  const filter = entityTypeFilter ?? null;
  backfillBindingEntities(operatorId, connectorId, id, filter).then(result => {
    console.log(`[binding-backfill] Routed ${result.routed} existing entities to department ${id}`);
  }).catch(err => {
    console.error("[binding-backfill] Error:", err);
  });

  return NextResponse.json({
    id: binding.id,
    connectorId: binding.connectorId,
    departmentId: binding.departmentId,
    entityTypeFilter: binding.entityTypeFilter ? JSON.parse(binding.entityTypeFilter) : null,
    enabled: binding.enabled,
    createdAt: binding.createdAt,
    connector: binding.connector,
  }, { status: 201 });
}
