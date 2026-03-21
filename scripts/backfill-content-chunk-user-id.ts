/**
 * Backfill userId on ContentChunk rows where it is currently null.
 *
 * Resolution strategy:
 * 1. Connector-sourced content (email, slack_message, drive_doc, calendar_note, teams_message):
 *    - Look up SourceConnector by matching sourceType → provider mapping + operatorId
 *    - Set userId = sourceConnector.userId
 *    - If multiple connectors of same type per operator: log ambiguity, skip
 * 2. Document-sourced content (uploaded_doc):
 *    - Look up InternalDocument by sourceId
 *    - InternalDocument has no uploadedById, so we fall back to the admin user for the operator
 * 3. Unresolvable: log warning with chunk ID, sourceType, sourceId
 *
 * Idempotent: skips chunks where userId is already set.
 * Runs in batches of 100. Logs progress every 500 chunks.
 *
 * Usage: npx tsx scripts/backfill-content-chunk-user-id.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Map sourceType to connector provider names
const SOURCE_TYPE_TO_PROVIDER: Record<string, string[]> = {
  email: ["google", "microsoft"],
  slack_message: ["slack"],
  drive_doc: ["google"],
  calendar_note: ["google", "microsoft"],
  teams_message: ["microsoft"],
};

const BATCH_SIZE = 100;
const LOG_INTERVAL = 500;

async function main() {
  console.log("[backfill] Starting ContentChunk userId backfill...");

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let ambiguous = 0;
  let unresolvable = 0;

  // Cache: operatorId → admin userId
  const adminCache = new Map<string, string | null>();

  // Cache: operatorId+provider → connector userId (or "ambiguous")
  const connectorCache = new Map<string, string | null | "ambiguous">();

  let cursor: string | undefined;

  while (true) {
    const chunks = await prisma.contentChunk.findMany({
      where: { userId: null },
      select: {
        id: true,
        operatorId: true,
        connectorId: true,
        sourceType: true,
        sourceId: true,
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (chunks.length === 0) break;

    for (const chunk of chunks) {
      processed++;
      let resolvedUserId: string | null = null;

      // Strategy 1: Connector-sourced content
      const providers = SOURCE_TYPE_TO_PROVIDER[chunk.sourceType];
      if (providers) {
        // If chunk has a connectorId, use it directly
        if (chunk.connectorId) {
          const connector = await prisma.sourceConnector.findUnique({
            where: { id: chunk.connectorId },
            select: { userId: true },
          });
          resolvedUserId = connector?.userId ?? null;
        } else {
          // Look up by provider + operatorId
          for (const provider of providers) {
            const cacheKey = `${chunk.operatorId}:${provider}`;
            if (!connectorCache.has(cacheKey)) {
              const connectors = await prisma.sourceConnector.findMany({
                where: {
                  operatorId: chunk.operatorId,
                  provider,
                  deletedAt: null,
                },
                select: { userId: true },
              });
              if (connectors.length === 1) {
                connectorCache.set(cacheKey, connectors[0].userId);
              } else if (connectors.length > 1) {
                // Check if all point to same user
                const uniqueUsers = [...new Set(connectors.map((c) => c.userId).filter(Boolean))];
                if (uniqueUsers.length === 1) {
                  connectorCache.set(cacheKey, uniqueUsers[0]!);
                } else {
                  connectorCache.set(cacheKey, "ambiguous");
                }
              } else {
                connectorCache.set(cacheKey, null);
              }
            }

            const cached = connectorCache.get(cacheKey);
            if (cached === "ambiguous") {
              ambiguous++;
              console.warn(
                `[backfill] Ambiguous: multiple connectors for provider=${provider}, operatorId=${chunk.operatorId}, chunkId=${chunk.id}`
              );
              break;
            } else if (cached) {
              resolvedUserId = cached;
              break;
            }
          }
        }
      }

      // Strategy 2: Document-sourced content — no uploadedById on InternalDocument,
      // fall back to admin user for the operator
      if (!resolvedUserId && chunk.sourceType === "uploaded_doc") {
        if (!adminCache.has(chunk.operatorId)) {
          const admin = await prisma.user.findFirst({
            where: { operatorId: chunk.operatorId, role: "admin" },
            select: { id: true },
          });
          adminCache.set(chunk.operatorId, admin?.id ?? null);
        }
        resolvedUserId = adminCache.get(chunk.operatorId) ?? null;
      }

      if (resolvedUserId) {
        await prisma.contentChunk.update({
          where: { id: chunk.id },
          data: { userId: resolvedUserId },
          select: { id: true },
        });
        updated++;
      } else {
        unresolvable++;
        console.warn(
          `[backfill] Unresolvable: chunkId=${chunk.id}, sourceType=${chunk.sourceType}, sourceId=${chunk.sourceId}`
        );
      }

      if (processed % LOG_INTERVAL === 0) {
        console.log(
          `[backfill] Progress: processed=${processed}, updated=${updated}, skipped=${skipped}, ambiguous=${ambiguous}, unresolvable=${unresolvable}`
        );
      }
    }

    cursor = chunks[chunks.length - 1].id;
  }

  console.log(
    `[backfill] Complete: processed=${processed}, updated=${updated}, skipped=${skipped}, ambiguous=${ambiguous}, unresolvable=${unresolvable}`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exit(1);
});
