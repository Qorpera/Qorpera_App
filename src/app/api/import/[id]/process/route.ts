import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { getImportJob, processImportJob } from "@/lib/ingestion/import-engine";
import { prisma } from "@/lib/db";
import type { ColumnMapping } from "@/lib/types";

/**
 * POST /api/import/[id]/process — Start processing an import job.
 *
 * The job must already have a column mapping saved (via /api/import/[id]/map).
 * Alternatively, body can include { targetTypeSlug, columnMapping } to override.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const operatorId = await getOperatorId();
  const job = await getImportJob(operatorId, params.id);

  if (!job) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  if (job.status === "processing") {
    return NextResponse.json(
      { error: "Import job is already processing" },
      { status: 409 },
    );
  }

  if (job.status === "completed") {
    return NextResponse.json(
      { error: "Import job has already completed" },
      { status: 409 },
    );
  }

  // Allow overriding mapping via body, otherwise use the saved mapping
  let targetTypeSlug = job.targetTypeSlug;
  let columnMapping = job.columnMapping;

  try {
    const body = await req.json();
    if (body.targetTypeSlug) targetTypeSlug = body.targetTypeSlug;
    if (body.columnMapping) columnMapping = body.columnMapping as ColumnMapping[];
  } catch {
    // Empty body is fine — use saved mapping
  }

  if (!targetTypeSlug) {
    return NextResponse.json(
      { error: "targetTypeSlug is required (save mapping first or include in body)" },
      { status: 400 },
    );
  }

  if (!columnMapping || columnMapping.length === 0) {
    return NextResponse.json(
      { error: "columnMapping is required (save mapping first or include in body)" },
      { status: 400 },
    );
  }

  // Resolve entity type ID from slug
  const entityType = await prisma.oemEntityType.findFirst({
    where: { operatorId, slug: targetTypeSlug },
    select: { id: true },
  });

  if (!entityType) {
    return NextResponse.json(
      { error: `Entity type "${targetTypeSlug}" not found` },
      { status: 404 },
    );
  }

  // Run processing (this can take time for large files — runs inline for now)
  const result = await processImportJob(
    operatorId,
    params.id,
    entityType.id,
    columnMapping,
  );

  return NextResponse.json(result);
}
