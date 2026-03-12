import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id: departmentId, docId } = await params;
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(departmentId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const doc = await prisma.internalDocument.findFirst({
    where: { id: docId, departmentId, operatorId },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Delete document record first (has FK to entity)
  await prisma.internalDocument.delete({
    where: { id: docId },
  });

  // Then delete content chunks + entity
  await prisma.contentChunk.deleteMany({
    where: { sourceType: "uploaded_doc", sourceId: docId },
  });
  if (doc.entityId) {
    await prisma.entity.delete({
      where: { id: doc.entityId },
    });
  }

  return NextResponse.json({ deleted: true });
}
