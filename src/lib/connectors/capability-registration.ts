import { prisma } from "@/lib/db";
import type { ConnectorProvider } from "./types";

/**
 * Register ActionCapability rows for a provider's static writeCapabilities.
 * Called when a connector is created or reconnected via OAuth.
 * Idempotent — skips capabilities that already exist for the connector.
 */
export async function registerConnectorCapabilities(
  connectorId: string,
  operatorId: string,
  provider: ConnectorProvider,
): Promise<void> {
  if (!provider.writeCapabilities || provider.writeCapabilities.length === 0) {
    return;
  }

  for (const cap of provider.writeCapabilities) {
    const existing = await prisma.actionCapability.findFirst({
      where: { operatorId, connectorId, slug: cap.slug },
    });
    if (!existing) {
      await prisma.actionCapability.create({
        data: {
          operatorId,
          connectorId,
          slug: cap.slug,
          name: cap.name,
          description: cap.description,
          inputSchema: JSON.stringify(cap.inputSchema),
          writeBackStatus: "pending",
        },
      });
    }
  }
}
