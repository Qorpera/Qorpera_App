import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/file-storage";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
]);

export async function POST(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type", allowed: [...ALLOWED_MIME_TYPES] }, { status: 415 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large", maxBytes: MAX_FILE_SIZE }, { status: 413 });
  }

  // Check storage quota
  const operator = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    select: { storageUsedBytes: true, storageLimitBytes: true },
  });
  const used = Number(operator.storageUsedBytes);
  const limit = Number(operator.storageLimitBytes);
  if (used + file.size > limit) {
    return NextResponse.json({
      error: "Storage limit exceeded",
      usedBytes: used,
      limitBytes: limit,
      requiredBytes: file.size,
    }, { status: 413 });
  }

  // Validate projectId belongs to this operator
  const projectId = formData.get("projectId") as string | null;
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, operatorId },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Pre-generate ID so storageKey includes it (needed by local provider's getSignedUrl)
  const fileId = createId();
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `${operatorId}/uploads/${fileId}-${sanitized}`;

  // Upload to storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageProvider();
  await storage.upload(storageKey, buffer, file.type);

  // Create record
  const upload = await prisma.fileUpload.create({
    data: {
      id: fileId,
      operatorId,
      uploadedBy: user.id,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storageProvider: process.env.FILE_STORAGE_PROVIDER || "local",
      storageKey,
      projectId: projectId || null,
    },
    select: { id: true, filename: true, status: true, mimeType: true, sizeBytes: true, createdAt: true },
  });

  // Update storage usage
  await prisma.operator.update({
    where: { id: operatorId },
    data: { storageUsedBytes: { increment: file.size } },
  });

  // Enqueue processing job
  await enqueueWorkerJob("process_file_upload", operatorId, {
    fileUploadId: upload.id,
  });

  return NextResponse.json(upload, { status: 201 });
}
