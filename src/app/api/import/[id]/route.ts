import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { getImportJob, deleteImportJob } from "@/lib/ingestion/import-engine";

/**
 * GET /api/import/[id] — Get import job status.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const operatorId = await getOperatorId();
  const job = await getImportJob(operatorId, params.id);

  if (!job) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

/**
 * DELETE /api/import/[id] — Delete an import job.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const operatorId = await getOperatorId();
  const deleted = await deleteImportJob(operatorId, params.id);

  if (!deleted) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
