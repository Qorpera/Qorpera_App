import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/file-storage";
import { createSourceFromFile } from "@/lib/source-library";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB (books can be large)
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

export async function POST(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type", allowed: [...ALLOWED_MIME_TYPES] }, { status: 415 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large", maxBytes: MAX_FILE_SIZE }, { status: 413 });
  }

  const title = formData.get("title") as string | null;
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const sourceType = (formData.get("sourceType") as string) || "book";

  // Upload to storage under system namespace
  const fileId = createId();
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `system/library/${fileId}-${sanitized}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageProvider();
  await storage.upload(storageKey, buffer, file.type);

  // Create FileUpload record (uses su.operatorId for the record, but the source is system-scoped)
  const upload = await prisma.fileUpload.create({
    data: {
      id: fileId,
      operatorId: su.operatorId,
      uploadedBy: su.user.id,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storageProvider: "local",
      storageKey,
      status: "uploaded",
    },
    select: { id: true },
  });

  // Parse optional fields
  const domainsRaw = formData.get("domains") as string | null;
  const domains = domainsRaw ? domainsRaw.split(",").map(d => d.trim()).filter(Boolean) : [];
  const pubYear = formData.get("publicationYear") as string | null;

  const sourceId = await createSourceFromFile({
    title,
    authors: (formData.get("authors") as string) || undefined,
    domain: (formData.get("domain") as string) || undefined,
    domains,
    sourceType,
    sourceAuthority: (formData.get("sourceAuthority") as string) || "foundational",
    fileUploadId: upload.id,
    publicationYear: pubYear ? parseInt(pubYear, 10) : undefined,
    isbn: (formData.get("isbn") as string) || undefined,
    version: (formData.get("version") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
  });

  await enqueueWorkerJob("process_source_document", su.operatorId, { sourceId });

  return NextResponse.json({ sourceId, status: "queued" }, { status: 202 });
}
