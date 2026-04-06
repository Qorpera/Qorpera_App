import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/file-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const file = await prisma.fileUpload.findFirst({
    where: { id, operatorId },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      chunkCount: true,
      projectId: true,
      metadata: true,
      errorMessage: true,
      storageKey: true,
      createdAt: true,
    },
  });

  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const storage = getStorageProvider();
  const downloadUrl = await storage.getSignedUrl(file.storageKey);

  // Don't expose storageKey in response
  const { storageKey: _, ...rest } = file;

  return NextResponse.json({ ...rest, downloadUrl });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const file = await prisma.fileUpload.findFirst({
    where: { id, operatorId },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  // Delete from storage (non-transactional — can't be rolled back)
  const storage = getStorageProvider();
  await storage.delete(file.storageKey).catch((err) => {
    console.error(`[files-api] Storage delete failed for ${file.storageKey}:`, err);
  });

  // Atomic DB cleanup: chunks → quota decrement → record deletion
  await prisma.$transaction([
    prisma.contentChunk.deleteMany({
      where: { fileUploadId: file.id },
    }),
    prisma.operator.update({
      where: { id: operatorId },
      data: { storageUsedBytes: { decrement: file.sizeBytes } },
    }),
    prisma.fileUpload.delete({
      where: { id: file.id },
    }),
  ]);

  return new NextResponse(null, { status: 204 });
}
