import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isStructuralSlot } from "@/lib/document-slots";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { extractText, processDocument } from "@/lib/rag/pipeline";
import crypto from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ALLOWED_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const VALID_DOC_TYPES = new Set([
  "org-chart",
  "budget",
  "compensation",
  "team-roster",
  "context",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id: departmentId } = await params;

  // Verify department exists
  const department = await prisma.entity.findFirst({
    where: { id: departmentId, operatorId, category: "foundational" },
  });
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const documentType = formData.get("documentType") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Accepted: TXT, CSV, PDF, DOCX` },
      { status: 400 },
    );
  }
  if (!documentType || !VALID_DOC_TYPES.has(documentType)) {
    return NextResponse.json(
      { error: `Invalid documentType. Must be one of: ${[...VALID_DOC_TYPES].join(", ")}` },
      { status: 400 },
    );
  }

  // For structural slots: mark existing doc as replaced
  if (isStructuralSlot(documentType)) {
    await prisma.internalDocument.updateMany({
      where: {
        departmentId,
        operatorId,
        documentType,
        status: { not: "replaced" },
      },
      data: { status: "replaced" },
    });
  }

  // Write file to disk
  const uploadDir = path.join(process.cwd(), "uploads", "documents");
  await mkdir(uploadDir, { recursive: true });

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const safeFileName = `${id}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(uploadDir, safeFileName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // Ensure "document" entity type exists
  const def = HARDCODED_TYPE_DEFS["document"];
  let entityType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "document" },
  });
  if (!entityType) {
    entityType = await prisma.entityType.create({
      data: {
        operatorId,
        slug: def.slug,
        name: def.name,
        description: def.description,
        icon: def.icon,
        color: def.color,
        defaultCategory: def.defaultCategory,
      },
    });
    // Create properties
    for (const propDef of def.properties) {
      await prisma.entityProperty.create({
        data: {
          entityTypeId: entityType.id,
          slug: propDef.slug,
          name: propDef.name,
          dataType: propDef.dataType,
        },
      });
    }
  }

  // Create entity for this document
  const displayName = file.name.replace(/\.[^.]+$/, "");
  const entity = await prisma.entity.create({
    data: {
      operatorId,
      entityTypeId: entityType.id,
      displayName,
      category: "internal",
      parentDepartmentId: departmentId,
      sourceSystem: "document-upload",
    },
  });

  // Create InternalDocument
  const doc = await prisma.internalDocument.create({
    data: {
      operatorId,
      fileName: file.name,
      mimeType: file.type,
      filePath,
      documentType,
      departmentId,
      entityId: entity.id,
      status: isStructuralSlot(documentType) ? "processing" : "uploaded",
    },
  });

  // Extract text immediately
  const rawText = await extractText(filePath, file.type);
  if (rawText) {
    await prisma.internalDocument.update({
      where: { id: doc.id },
      data: { rawText },
    });
  }

  // Fire-and-forget: RAG pipeline (all docs get chunked & embedded)
  processDocument(doc.id).catch((err) => {
    console.error("[dept-doc-upload] RAG pipeline error:", err);
  });

  // Return the created document
  const result = await prisma.internalDocument.findUnique({
    where: { id: doc.id },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      documentType: true,
      embeddingStatus: true,
      status: true,
      entityId: true,
      departmentId: true,
      createdAt: true,
    },
  });

  return NextResponse.json(result, { status: 201 });
}
