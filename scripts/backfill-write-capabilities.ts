/**
 * Backfill write capabilities for all existing connectors.
 *
 * For each active (non-deleted) SourceConnector:
 *   1. Load its provider via registry
 *   2. For each writeCapability not already in ActionCapability table:
 *      - Create with writeBackStatus: "pending"
 *   3. Existing ActionCapability rows are untouched (preserves enabled status)
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage: npx tsx scripts/backfill-write-capabilities.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Inline provider registry import to avoid Next.js module issues
async function getProviderWriteCapabilities(providerId: string) {
  const providers: Record<string, () => Promise<{ writeCapabilities?: Array<{ slug: string; name: string; description: string; inputSchema: unknown }> }>> = {
    google: () => import("../src/lib/connectors/google-provider").then((m) => m.googleProvider),
    microsoft: () => import("../src/lib/connectors/microsoft-provider").then((m) => m.microsoftProvider),
    slack: () => import("../src/lib/connectors/slack-provider").then((m) => m.slackProvider),
    hubspot: () => import("../src/lib/connectors/hubspot").then((m) => m.hubspotProvider),
    stripe: () => import("../src/lib/connectors/stripe").then((m) => m.stripeProvider),
    economic: () => import("../src/lib/connectors/economic-provider").then((m) => m.economicProvider),
    shopify: () => import("../src/lib/connectors/shopify-provider").then((m) => m.shopifyProvider),
    intercom: () => import("../src/lib/connectors/intercom-provider").then((m) => m.intercomProvider),
    zendesk: () => import("../src/lib/connectors/zendesk-provider").then((m) => m.zendeskProvider),
    pipedrive: () => import("../src/lib/connectors/pipedrive-provider").then((m) => m.pipedriveProvider),
    salesforce: () => import("../src/lib/connectors/salesforce-provider").then((m) => m.salesforceProvider),
    "google-ads": () => import("../src/lib/connectors/google-ads-provider").then((m) => m.googleAdsProvider),
    "meta-ads": () => import("../src/lib/connectors/meta-ads-provider").then((m) => m.metaAdsProvider),
    linkedin: () => import("../src/lib/connectors/linkedin-provider").then((m) => m.linkedinProvider),
  };

  const loader = providers[providerId];
  if (!loader) return [];

  try {
    const provider = await loader();
    return provider.writeCapabilities || [];
  } catch {
    return [];
  }
}

async function main() {
  console.log("[backfill] Starting write capability backfill...\n");

  // Find all active connectors (not soft-deleted)
  const connectors = await prisma.sourceConnector.findMany({
    where: { deletedAt: null },
    select: { id: true, operatorId: true, provider: true, name: true },
  });

  console.log(`[backfill] Found ${connectors.length} active connectors\n`);

  let totalRegistered = 0;
  let totalSkipped = 0;

  for (const connector of connectors) {
    const capabilities = await getProviderWriteCapabilities(connector.provider);

    if (capabilities.length === 0) continue;

    let registered = 0;

    for (const cap of capabilities) {
      // Check if this capability already exists for this connector
      const existing = await prisma.actionCapability.findFirst({
        where: {
          connectorId: connector.id,
          slug: cap.slug,
        },
      });

      if (existing) {
        totalSkipped++;
        continue;
      }

      // Create new capability with pending status
      await prisma.actionCapability.create({
        data: {
          operatorId: connector.operatorId,
          connectorId: connector.id,
          slug: cap.slug,
          name: cap.name,
          description: cap.description,
          inputSchema: JSON.stringify(cap.inputSchema),
          writeBackStatus: "pending",
        },
      });

      registered++;
      totalRegistered++;
    }

    if (registered > 0) {
      console.log(
        `[backfill] Registered ${registered} new capabilities for ${connector.provider} connector ${connector.id} (${connector.name})`
      );
    }
  }

  console.log(
    `\n[backfill] Done. Registered ${totalRegistered} new capabilities, skipped ${totalSkipped} existing.`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exit(1);
});
