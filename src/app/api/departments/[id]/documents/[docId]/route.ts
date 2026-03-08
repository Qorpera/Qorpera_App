import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const operatorId = await getOperatorId();
  const { id: departmentId, docId } = await params;

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

  return NextResponse.json({ deleted: true });
}
