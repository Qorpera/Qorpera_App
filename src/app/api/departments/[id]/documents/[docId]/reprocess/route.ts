import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { processDocument } from "@/lib/rag/pipeline";
import { checkRateLimit } from "@/lib/rate-limiter";
import { invalidateCache } from "@/lib/rag/chunk-cache";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const operatorId = await getOperatorId();
  const { id: departmentId, docId } = await params;
  const _userId = await getUserId();
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, _userId);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(departmentId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Rate limit: 5 reprocesses per operator per 5 minutes
  const rl = checkRateLimit(`doc-reprocess:${operatorId}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many reprocess requests. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const doc = await prisma.internalDocument.findFirst({
    where: { id: docId, departmentId, operatorId },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  invalidateCache(departmentId);
  const result = await processDocument(docId);

  return NextResponse.json({ chunks: result.chunks, error: result.error });
}
