import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const params = req.nextUrl.searchParams;
  const projectId = params.get("projectId") ?? undefined;
  const status = params.get("status") ?? undefined;

  // Files are operator-wide resources (like wiki pages). Project association is a
  // tag for organization, not an access boundary — the reasoning engine needs all
  // files regardless of project. No department scope filtering applied.
  const where: Record<string, unknown> = { operatorId };
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;

  const files = await prisma.fileUpload.findMany({
    where,
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      chunkCount: true,
      projectId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: files });
}
