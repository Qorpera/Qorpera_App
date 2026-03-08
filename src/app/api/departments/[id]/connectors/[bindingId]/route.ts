import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bindingId: string }> },
) {
  await getOperatorId();
  const { id, bindingId } = await params;
  const body = await req.json();

  const binding = await prisma.connectorDepartmentBinding.findFirst({
    where: { id: bindingId, departmentId: id },
  });
  if (!binding) {
    return NextResponse.json({ error: "Binding not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.entityTypeFilter !== undefined) {
    data.entityTypeFilter = body.entityTypeFilter ? JSON.stringify(body.entityTypeFilter) : null;
  }
  if (typeof body.enabled === "boolean") {
    data.enabled = body.enabled;
  }

  const updated = await prisma.connectorDepartmentBinding.update({
    where: { id: bindingId },
    data,
    include: {
      connector: {
        select: { id: true, provider: true, name: true, status: true, lastSyncAt: true },
      },
    },
  });

  return NextResponse.json({
    id: updated.id,
    connectorId: updated.connectorId,
    departmentId: updated.departmentId,
    entityTypeFilter: updated.entityTypeFilter ? JSON.parse(updated.entityTypeFilter) : null,
    enabled: updated.enabled,
    createdAt: updated.createdAt,
    connector: updated.connector,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; bindingId: string }> },
) {
  await getOperatorId();
  const { id, bindingId } = await params;

  const binding = await prisma.connectorDepartmentBinding.findFirst({
    where: { id: bindingId, departmentId: id },
  });
  if (!binding) {
    return NextResponse.json({ error: "Binding not found" }, { status: 404 });
  }

  await prisma.connectorDepartmentBinding.delete({ where: { id: bindingId } });

  // TODO: auto-cleanup department-member relationships for entities from this connector.
  // Deferred for pilot — users can manually remove entities via edit mode "Remove from department".
  // Edge case: entity may be routed by multiple bindings to the same department, so cleanup
  // must check if other active bindings still cover the entity before removing the relationship.

  return NextResponse.json({ ok: true });
}
