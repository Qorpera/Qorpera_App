import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { DOCUMENT_SLOT_TYPES, type SlotType } from "@/lib/document-slots";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id: departmentId } = await params;
  const _userId = await getUserId();
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, _userId);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(departmentId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Verify department exists and belongs to operator
  const department = await prisma.entity.findFirst({
    where: { id: departmentId, operatorId, category: "foundational" },
  });
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const docs = await prisma.internalDocument.findMany({
    where: { departmentId, operatorId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      documentType: true,
      embeddingStatus: true,
      status: true,
      entityId: true,
      createdAt: true,
    },
  });

  // Build slots object — most recent doc per slot type
  const slots: Record<string, typeof docs[0] | null> = {};
  for (const slotType of Object.keys(DOCUMENT_SLOT_TYPES) as SlotType[]) {
    const doc = docs.find((d) => d.documentType === slotType && d.status !== "replaced");
    slots[slotType] = doc ?? null;
  }

  // Context docs — all non-slot documents
  const contextDocs = docs.filter((d) => d.documentType === "context");

  return NextResponse.json({ slots, contextDocs });
}
