import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { updateBindingSchema, parseBody } from "@/lib/api-validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bindingId: string }> },
) {
  const operatorId = await getOperatorId();
  const { id, bindingId } = await params;
  const _userId = await getUserId();
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, _userId);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = parseBody(updateBindingSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const binding = await prisma.connectorDepartmentBinding.findFirst({
    where: { id: bindingId, departmentId: id },
  });
  if (!binding) {
    return NextResponse.json({ error: "Binding not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.entityTypeFilter !== undefined) {
    data.entityTypeFilter = parsed.data.entityTypeFilter ? JSON.stringify(parsed.data.entityTypeFilter) : null;
  }
  if (parsed.data.eventTypeFilter !== undefined) {
    data.eventTypeFilter = parsed.data.eventTypeFilter ? JSON.stringify(parsed.data.eventTypeFilter) : null;
  }
  if (parsed.data.enabled !== undefined) {
    data.enabled = parsed.data.enabled;
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
  const operatorId2 = await getOperatorId();
  const { id, bindingId } = await params;
  const _userId2 = await getUserId();
  const _visibleDepts2 = await getVisibleDepartmentIds(operatorId2, _userId2);
  if (_visibleDepts2 !== "all" && !_visibleDepts2.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

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
