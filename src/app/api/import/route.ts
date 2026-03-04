import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { createImportJob, listImportJobs } from "@/lib/ingestion/import-engine";
import { parseCSV, inferColumnTypes } from "@/lib/connectors/csv-connector";
import { parseJSON } from "@/lib/connectors/json-connector";
import { suggestColumnMapping } from "@/lib/ingestion/column-mapper";
import { prisma } from "@/lib/db";

/**
 * GET /api/import — List all import jobs for the operator.
 */
export async function GET() {
  const operatorId = await getOperatorId();
  const jobs = await listImportJobs(operatorId);
  return NextResponse.json(jobs);
}

/**
 * POST /api/import — Create a new import job.
 *
 * Body: { fileName: string, fileType: "csv" | "json", content: string, targetTypeSlug?: string }
 *
 * Returns the created job along with parsed headers, inferred types, and
 * suggested column mapping (when targetTypeSlug is provided).
 */
export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();

  const { fileName, fileType, content, targetTypeSlug } = body as {
    fileName?: string;
    fileType?: string;
    content?: string;
    targetTypeSlug?: string;
  };

  if (!fileName || !fileType || !content) {
    return NextResponse.json(
      { error: "fileName, fileType, and content are required" },
      { status: 400 },
    );
  }

  if (fileType !== "csv" && fileType !== "json") {
    return NextResponse.json(
      { error: 'fileType must be "csv" or "json"' },
      { status: 400 },
    );
  }

  // Create the import job
  const job = await createImportJob(operatorId, fileName, fileType, content);

  // Parse for preview data
  let headers: string[] = [];
  let previewRows: Record<string, string>[] = [];
  let inferredTypes: Record<string, string> = {};

  try {
    if (fileType === "csv") {
      const parsed = parseCSV(content);
      headers = parsed.headers;
      previewRows = parsed.rows.slice(0, 5);
      inferredTypes = inferColumnTypes(parsed.rows);
    } else {
      const parsed = parseJSON(content);
      headers = parsed.headers;
      previewRows = parsed.rows.slice(0, 5);
    }
  } catch {
    // Non-fatal — job is created, parsing happens again at process time
  }

  // Auto-suggest column mapping if target type provided
  let suggestedMapping: { sourceColumn: string; targetProperty: string | null }[] | null = null;
  if (targetTypeSlug) {
    const entityType = await prisma.oemEntityType.findFirst({
      where: { operatorId, slug: targetTypeSlug },
      include: { properties: { orderBy: { displayOrder: "asc" } } },
    });

    if (entityType) {
      const props = entityType.properties.map((p) => ({
        slug: p.slug,
        name: p.name,
      }));
      suggestedMapping = suggestColumnMapping(headers, props);
    }
  }

  return NextResponse.json(
    {
      job,
      headers,
      previewRows,
      inferredTypes,
      suggestedMapping,
    },
    { status: 201 },
  );
}
