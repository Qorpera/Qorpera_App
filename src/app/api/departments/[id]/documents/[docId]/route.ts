import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { invalidateCache } from "@/lib/rag/chunk-cache";

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

  // Then delete chunks + entity
  if (doc.entityId) {
    await prisma.documentChunk.deleteMany({
      where: { entityId: doc.entityId },
    });
    await prisma.entity.delete({
      where: { id: doc.entityId },
    });
  }

  invalidateCache(departmentId);

  return NextResponse.json({ deleted: true });
}
