import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertProjectAccess } from "@/lib/project-access";
import { extractText } from "@/lib/rag/pipeline";
import { enqueueDocument } from "@/lib/rag/embedding-queue";
import { checkRateLimit } from "@/lib/rate-limiter";
import crypto from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/csv",
  "text/comma-separated-values",
  "text/markdown",
  "text/x-markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const EXT_FALLBACK: Record<string, string> = {
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveUserId, effectiveRole } = su;
  const { id: projectId } = await params;

  const access = await assertProjectAccess(projectId, operatorId, effectiveUserId, effectiveRole);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Rate limit: 20 uploads per project per 5 minutes
  const rl = checkRateLimit(`doc-upload:project:${projectId}`, 20, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body — expected multipart form data" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.` },
      { status: 413 },
    );
  }

  // Resolve MIME — fall back to extension when browser sends octet-stream or empty
  let resolvedMime = file.type;
  if (!ALLOWED_MIMES.has(resolvedMime)) {
    const ext = path.extname(file.name).toLowerCase();
    const fallback = EXT_FALLBACK[ext];
    if (fallback) {
      resolvedMime = fallback;
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Accepted: TXT, CSV, PDF, DOCX, MD, XLSX, XLS` },
        { status: 400 },
      );
    }
  }

  // Write file to disk (per-operator/project isolation)
  const storageBase = process.env.DOCUMENT_STORAGE_PATH || "./uploads/documents";
  const uploadDir = path.join(storageBase, operatorId, "projects", projectId);

  try {
    await mkdir(uploadDir, { recursive: true });
  } catch (mkdirErr) {
    console.error("[project-upload] Failed to create upload directory:", uploadDir, mkdirErr);
    return NextResponse.json({ error: "Storage error: cannot create directory" }, { status: 500 });
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const safeFileName = `${id}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const absolutePath = path.join(uploadDir, safeFileName);
  const filePath = `${operatorId}/projects/${projectId}/${safeFileName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await writeFile(absolutePath, buffer);
  } catch (writeErr) {
    console.error("[project-upload] Failed to write file:", absolutePath, writeErr);
    return NextResponse.json({ error: "Storage error: cannot write file" }, { status: 500 });
  }

  // Create InternalDocument (no entity, no department — project-scoped)
  const doc = await prisma.internalDocument.create({
    data: {
      operatorId,
      fileName: file.name,
      mimeType: resolvedMime,
      filePath,
      documentType: "project_doc",
      projectId,
      status: "uploaded",
    },
  });

  // Extract text immediately (non-fatal if it fails)
  try {
    const rawText = await extractText(absolutePath, resolvedMime);
    if (rawText) {
      await prisma.internalDocument.update({
        where: { id: doc.id },
        data: { rawText },
      });
    }
  } catch (extractErr) {
    console.error("[project-upload] Text extraction failed (non-fatal):", extractErr);
  }

  // Enqueue for batch processing (RAG pipeline — will create ContentChunks with projectId)
  enqueueDocument(doc.id);

  const result = await prisma.internalDocument.findUnique({
    where: { id: doc.id },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      documentType: true,
      embeddingStatus: true,
      status: true,
      projectId: true,
      createdAt: true,
    },
  });

  return NextResponse.json(result, { status: 201 });
}
