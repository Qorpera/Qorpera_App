import { prisma } from "@/lib/db";

/**
 * BFS from scopeEntityId to check if targetEntityId is reachable
 * within scopeDepth hops (both directions).
 */
export async function isEntityInScope(
  operatorId: string,
  scopeEntityId: string,
  scopeDepth: number | null,
  targetEntityId: string,
): Promise<boolean> {
  if (scopeEntityId === targetEntityId) return true;

  const maxHops = scopeDepth ?? 10; // safety cap
  const visited = new Set<string>([scopeEntityId]);
  let frontier = [scopeEntityId];

  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const [outgoing, incoming] = await Promise.all([
      prisma.relationship.findMany({
        where: { fromEntityId: { in: frontier }, fromEntity: { operatorId, status: "active" } },
        select: { toEntityId: true },
      }),
      prisma.relationship.findMany({
        where: { toEntityId: { in: frontier }, toEntity: { operatorId, status: "active" } },
        select: { fromEntityId: true },
      }),
    ]);

    const nextFrontier: string[] = [];

    for (const rel of outgoing) {
      if (rel.toEntityId === targetEntityId) return true;
      if (!visited.has(rel.toEntityId)) {
        visited.add(rel.toEntityId);
        nextFrontier.push(rel.toEntityId);
      }
    }

    for (const rel of incoming) {
      if (rel.fromEntityId === targetEntityId) return true;
      if (!visited.has(rel.fromEntityId)) {
        visited.add(rel.fromEntityId);
        nextFrontier.push(rel.fromEntityId);
      }
    }

    frontier = nextFrontier;
  }

  return false;
}
