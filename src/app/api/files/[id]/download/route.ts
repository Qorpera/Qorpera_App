import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/file-storage";

/**
 * GET /api/files/[id]/download
 *
 * Streams the file from local storage. Only needed for the local provider —
 * S3/R2 uses signed URLs directly.
 */
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
    select: { storageKey: true, filename: true, mimeType: true },
  });

  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  try {
    const storage = getStorageProvider();
    const buffer = await storage.getBuffer(file.storageKey);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not available" }, { status: 404 });
  }
}
