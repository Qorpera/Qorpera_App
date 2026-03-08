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

  // Delete chunks via entity (cascade handles this, but be explicit)
  if (doc.entityId) {
    await prisma.documentChunk.deleteMany({
      where: { entityId: doc.entityId },
    });
    // Delete the linked entity
    await prisma.entity.delete({
      where: { id: doc.entityId },
    });
  }

  // Delete the document record
  await prisma.internalDocument.delete({
    where: { id: docId },
  });

  return NextResponse.json({ deleted: true });
}
