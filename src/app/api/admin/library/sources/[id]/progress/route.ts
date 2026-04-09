import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const { id } = await params;

  const [source, sections] = await Promise.all([
    prisma.sourceDocument.findUnique({
      where: { id },
      select: { status: true, sectionCount: true, pagesProduced: true, errorMessage: true },
    }),
    prisma.sourceSection.groupBy({
      by: ["status"],
      where: { sourceId: id },
      _count: { id: true },
    }),
  ]);

  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  const statusCounts: Record<string, number> = {};
  for (const row of sections) {
    statusCounts[row.status] = row._count.id;
  }

  return NextResponse.json({
    status: source.status,
    errorMessage: source.errorMessage,
    totalSections: source.sectionCount ?? 0,
    pagesProduced: source.pagesProduced,
    sections: {
      pending: statusCounts["pending"] ?? 0,
      synthesizing: statusCounts["synthesizing"] ?? 0,
      complete: statusCounts["complete"] ?? 0,
      skipped: statusCounts["skipped"] ?? 0,
      failed: statusCounts["failed"] ?? 0,
    },
  });
}
