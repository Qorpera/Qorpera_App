import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ALLOWED_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Accepted: TXT, CSV, PDF, DOCX, PNG, JPEG, WebP` },
      { status: 400 },
    );
  }

  const uploadDir = path.join(process.cwd(), "uploads", "documents");
  await mkdir(uploadDir, { recursive: true });

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const safeFileName = `${id}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(uploadDir, safeFileName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const doc = await prisma.internalDocument.create({
    data: {
      operatorId,
      fileName: file.name,
      mimeType: file.type,
      filePath: filePath,
      status: "uploaded",
    },
  });

  return NextResponse.json(doc);
}
