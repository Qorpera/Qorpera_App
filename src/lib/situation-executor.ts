import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { decrypt, encrypt } from "@/lib/encryption";

export async function executeSituationAction(situationId: string) {
  const situation = await prisma.situation.findUnique({
    where: { id: situationId },
    include: { situationType: true },
  });

  if (!situation) return;
  if (situation.status !== "approved" && situation.status !== "auto_executing") return;
  if (!situation.proposedAction) return;

  let proposed: { action: string; connector: string; params: Record<string, unknown> };
  try {
    proposed = JSON.parse(situation.proposedAction);
  } catch {
    return;
  }

  // Optimistic lock to "executing"
  const locked = await prisma.situation.updateMany({
    where: { id: situationId, status: situation.status },
    data: { status: "executing" },
  });
  if (locked.count === 0) return;

  try {
    // Find the ActionCapability by name
    const capability = await prisma.actionCapability.findFirst({
      where: { operatorId: situation.operatorId, name: proposed.action, enabled: true },
    });

    if (!capability?.connectorId) {
      throw new Error(`No capable connector found for action: ${proposed.action}`);
    }

    // For personal-connector providers (e.g. Google), use the approving user's connector
    let connector = await prisma.sourceConnector.findUnique({
      where: { id: capability.connectorId },
    });

    if (!connector) {
      throw new Error(`Connector not found: ${capability.connectorId}`);
    }

    if (connector.provider === "google" && situation.assignedUserId) {
      const userConnector = await prisma.sourceConnector.findFirst({
        where: {
          operatorId: situation.operatorId,
          provider: "google",
          userId: situation.assignedUserId,
          status: "active",
        },
      });
      if (!userConnector) {
        throw new Error("Approving user has not connected their Google account");
      }
      connector = userConnector;
    }

    const provider = getProvider(connector.provider);
    if (!provider?.executeAction) {
      throw new Error(`Provider "${connector.provider}" does not support action execution`);
    }

    const config = JSON.parse(decrypt(connector.config || "{}"));
    const result = await provider.executeAction(config, proposed.action, proposed.params);

    // Persist config in case tokens were refreshed
    await prisma.sourceConnector.update({
      where: { id: connector.id },
      data: { config: encrypt(JSON.stringify(config)) },
    }).catch(() => {});

    if (result.success) {
      await prisma.situation.update({
        where: { id: situationId },
        data: {
          status: "resolved",
          actionTaken: JSON.stringify({ ...proposed, result: result.result }),
          resolvedAt: new Date(),
        },
      });

      await prisma.notification.create({
        data: {
          operatorId: situation.operatorId,
          title: `Action completed: ${situation.situationType.name}`,
          body: `Successfully executed: ${proposed.action}`,
          sourceType: "situation",
          sourceId: situationId,
        },
      });
    } else {
      throw new Error(result.error || "Action execution failed");
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    await prisma.situation.update({
      where: { id: situationId },
      data: {
        status: "proposed",
        actionTaken: JSON.stringify({ error: errorMsg, attemptedAction: proposed }),
      },
    });

    await prisma.notification.create({
      data: {
        operatorId: situation.operatorId,
        title: `Action failed: ${situation.situationType.name}`,
        body: `Failed to execute ${proposed.action}: ${errorMsg}`,
        sourceType: "situation",
        sourceId: situationId,
      },
    });
  }
}
