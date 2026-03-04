import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { saveColumnMapping } from "@/lib/ingestion/import-engine";
import type { ColumnMapping } from "@/lib/types";

/**
 * POST /api/import/[id]/map — Save column mapping for an import job.
 *
 * Body: { targetTypeSlug: string, columnMapping: ColumnMapping[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const operatorId = await getOperatorId();
  const body = await req.json();

  const { targetTypeSlug, columnMapping } = body as {
    targetTypeSlug?: string;
    columnMapping?: ColumnMapping[];
  };

  if (!targetTypeSlug || !columnMapping || !Array.isArray(columnMapping)) {
    return NextResponse.json(
      { error: "targetTypeSlug and columnMapping array are required" },
      { status: 400 },
    );
  }

  const job = await saveColumnMapping(operatorId, params.id, targetTypeSlug, columnMapping);
  if (!job) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
