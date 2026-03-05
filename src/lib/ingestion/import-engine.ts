import { prisma } from "@/lib/db";
import { parseCSV } from "@/lib/connectors/csv-connector";
import { parseJSON } from "@/lib/connectors/json-connector";
import { normalizeValue } from "@/lib/ingestion/normalizer";
import { upsertEntity } from "@/lib/entity-resolution";
import type { ColumnMapping, ImportJobView } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

// ── Job Management ───────────────────────────────────────────────────────────

/**
 * Create an import job, storing the raw file content for later processing.
 */
export async function createImportJob(
  operatorId: string,
  fileName: string,
  fileType: string,
  content: string,
): Promise<ImportJobView> {
  // Parse to get row count for the job record
  let rowCount = 0;
  try {
    if (fileType === "csv") {
      const parsed = parseCSV(content);
      rowCount = parsed.rowCount;
    } else if (fileType === "json") {
      const parsed = parseJSON(content);
      rowCount = parsed.rowCount;
    }
  } catch {
    // row count stays 0; actual errors surface during processing
  }

  const job = await prisma.importJob.create({
    data: {
      operatorId,
      fileName,
      fileType,
      rawData: content,
      rowsTotal: rowCount,
      status: "pending",
    },
  });

  return formatJobView(job);
}

/**
 * List import jobs for an operator.
 */
export async function listImportJobs(operatorId: string): Promise<ImportJobView[]> {
  const jobs = await prisma.importJob.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
  });
  return jobs.map(formatJobView);
}

/**
 * Get a single import job.
 */
export async function getImportJob(
  operatorId: string,
  jobId: string,
): Promise<ImportJobView | null> {
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, operatorId },
  });
  return job ? formatJobView(job) : null;
}

/**
 * Delete an import job.
 */
export async function deleteImportJob(
  operatorId: string,
  jobId: string,
): Promise<boolean> {
  const existing = await prisma.importJob.findFirst({
    where: { id: jobId, operatorId },
  });
  if (!existing) return false;
  await prisma.importJob.delete({ where: { id: jobId } });
  return true;
}

/**
 * Save column mapping and target type on a job.
 */
export async function saveColumnMapping(
  operatorId: string,
  jobId: string,
  targetTypeSlug: string,
  columnMapping: ColumnMapping[],
): Promise<ImportJobView | null> {
  const existing = await prisma.importJob.findFirst({
    where: { id: jobId, operatorId },
  });
  if (!existing) return null;

  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data: {
      targetTypeSlug,
      columnMapping: JSON.stringify(columnMapping),
      status: "mapping",
    },
  });
  return formatJobView(updated);
}

// ── Processing ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 100;

/**
 * Process an import job: parse raw data, map columns, normalise values,
 * and upsert entities in batches of 100.
 */
export async function processImportJob(
  operatorId: string,
  jobId: string,
  entityTypeId: string,
  columnMapping: ColumnMapping[],
): Promise<ImportResult> {
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, operatorId },
  });
  if (!job) throw new Error("Import job not found");
  if (!job.rawData) throw new Error("Import job has no raw data");

  // Mark as processing
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: "processing" },
  });

  // Get entity type info
  const entityType = await prisma.entityType.findUnique({
    where: { id: entityTypeId },
    include: { properties: true },
  });
  if (!entityType) throw new Error(`Entity type "${entityTypeId}" not found`);

  const propBySlug = new Map(
    entityType.properties.map((p) => [p.slug, p]),
  );

  // Parse raw data
  let rows: Record<string, string>[];
  try {
    if (job.fileType === "csv") {
      rows = parseCSV(job.rawData).rows;
    } else if (job.fileType === "json") {
      rows = parseJSON(job.rawData).rows;
    } else {
      throw new Error(`Unsupported file type: ${job.fileType}`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errors: JSON.stringify([`Parse error: ${errMsg}`]),
      },
    });
    return { created: 0, updated: 0, skipped: 0, errors: [`Parse error: ${errMsg}`] };
  }

  // Build active mappings (skip null targetProperty)
  const activeMappings = columnMapping.filter(
    (m): m is ColumnMapping & { targetProperty: string } => m.targetProperty !== null,
  );

  // Find the displayName source column — prefer "name" property, fall back to first mapped column
  const nameMapping = activeMappings.find((m) => m.targetProperty === "name")
    ?? activeMappings[0];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Process in batches
  const totalRows = rows.length;
  await prisma.importJob.update({
    where: { id: jobId },
    data: { rowsTotal: totalRows },
  });

  for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const rowIndex = batchStart + i + 1; // 1-based for error messages

      try {
        // Build properties from mapping
        const properties: Record<string, string> = {};
        for (const mapping of activeMappings) {
          const rawValue = row[mapping.sourceColumn] ?? "";
          if (!rawValue) continue;

          const propDef = propBySlug.get(mapping.targetProperty);
          const dataType = propDef?.dataType ?? "STRING";
          properties[mapping.targetProperty] = normalizeValue(rawValue, dataType);
        }

        // Determine display name
        const displayNameSource = nameMapping ? row[nameMapping.sourceColumn] : undefined;
        const displayName = displayNameSource?.trim() || `Import row ${rowIndex}`;

        // Check if this is a create or update by trying to resolve first
        const { resolveEntity } = await import("@/lib/entity-resolution");
        const existingId = await resolveEntity(operatorId, {
          displayName,
          identityValues: extractIdentityValues(properties, entityType.properties),
        });

        // Upsert the entity
        await upsertEntity(operatorId, entityType.slug, {
          displayName,
          sourceSystem: "import",
          properties,
        });

        if (existingId) {
          updated++;
        } else {
          created++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${rowIndex}: ${errMsg}`);
        skipped++;
      }
    }

    // Update progress after each batch
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        rowsProcessed: Math.min(batchStart + BATCH_SIZE, totalRows),
        rowsSkipped: skipped,
      },
    });
  }

  // Mark complete
  const finalStatus = errors.length > 0 && created === 0 && updated === 0 ? "failed" : "completed";
  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: finalStatus,
      rowsProcessed: totalRows,
      rowsSkipped: skipped,
      errors: errors.length > 0 ? JSON.stringify(errors.slice(0, 100)) : null,
    },
  });

  return { created, updated, skipped, errors };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract identity values (email, domain, phone) from mapped properties
 * to feed into the entity resolution cascade.
 */
function extractIdentityValues(
  properties: Record<string, string>,
  propDefs: { slug: string; identityRole: string | null }[],
): Record<string, string> {
  const identityValues: Record<string, string> = {};
  for (const def of propDefs) {
    if (def.identityRole && properties[def.slug]) {
      identityValues[def.identityRole] = properties[def.slug];
    }
  }
  return identityValues;
}

type ImportJobRow = {
  id: string;
  operatorId: string;
  fileName: string;
  fileType: string;
  targetTypeSlug: string | null;
  status: string;
  rowsTotal: number;
  rowsProcessed: number;
  rowsSkipped: number;
  errors: string | null;
  columnMapping: string | null;
  rawData: string | null;
  createdAt: Date;
};

function formatJobView(job: ImportJobRow): ImportJobView {
  return {
    id: job.id,
    fileName: job.fileName,
    fileType: job.fileType,
    targetTypeSlug: job.targetTypeSlug,
    status: job.status,
    rowsTotal: job.rowsTotal,
    rowsProcessed: job.rowsProcessed,
    rowsSkipped: job.rowsSkipped,
    errors: job.errors ? (JSON.parse(job.errors) as string[]) : null,
    columnMapping: job.columnMapping
      ? (JSON.parse(job.columnMapping) as ColumnMapping[])
      : null,
    createdAt: job.createdAt.toISOString(),
  };
}
