import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { applyExtractionDiff, type ExtractionDiff } from "@/lib/structural-extraction";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const operatorId = await getOperatorId();
  const { id: departmentId, docId } = await params;
  const _userId = await getUserId();
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, _userId);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(departmentId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const doc = await prisma.internalDocument.findFirst({
    where: { id: docId, departmentId, operatorId },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (doc.status !== "extracted") {
    return NextResponse.json(
      { error: "Document must be in 'extracted' status before confirming. Run extraction first." },
      { status: 400 },
    );
  }

  const body = await req.json();
  const diff = body.diff as ExtractionDiff;
  if (!diff) {
    return NextResponse.json({ error: "Missing 'diff' in request body" }, { status: 400 });
  }

  const result = await applyExtractionDiff(diff, departmentId, operatorId, docId);

  await prisma.internalDocument.update({
    where: { id: docId },
    data: { status: "confirmed" },
  });

  return NextResponse.json(result);
}
