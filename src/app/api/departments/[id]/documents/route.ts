import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { DOCUMENT_SLOT_TYPES, type SlotType } from "@/lib/document-slots";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id: departmentId } = await params;
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
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

  // Build slots object — all docs per slot type (excluding replaced)
  const slots: Record<string, typeof docs[0][]> = {};
  for (const slotType of Object.keys(DOCUMENT_SLOT_TYPES) as SlotType[]) {
    slots[slotType] = docs.filter((d) => d.documentType === slotType && d.status !== "replaced");
  }

  // Context docs — all non-slot documents
  const contextDocs = docs.filter((d) => d.documentType === "context");

  return NextResponse.json({ slots, contextDocs });
}
