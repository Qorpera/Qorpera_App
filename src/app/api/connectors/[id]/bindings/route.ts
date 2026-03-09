import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const connector = await prisma.sourceConnector.findFirst({
    where: { id, operatorId },
  });
  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const bindings = await prisma.connectorDepartmentBinding.findMany({
    where: { connectorId: id },
    include: {
      department: { select: { id: true, displayName: true } },
    },
  });

  return NextResponse.json(bindings.map(b => ({
    id: b.id,
    departmentId: b.departmentId,
    departmentName: b.department.displayName,
    entityTypeFilter: b.entityTypeFilter ? JSON.parse(b.entityTypeFilter) : null,
    enabled: b.enabled,
  })));
}
