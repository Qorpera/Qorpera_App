import { prisma } from "@/lib/db";
import type { GraphNode, GraphEdge } from "./oem-data";

// ── BFS Graph Traversal ──────────────────────────────────────────────────────

export interface TraversalResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hops: number;
}

/**
 * Multi-hop BFS from a starting entity. Returns all reachable entities
 * within `maxHops` hops and the edges between them.
 */
export async function searchAround(
  operatorId: string,
  startEntityId: string,
  maxHops = 2,
): Promise<TraversalResult> {
  const visited = new Set<string>();
  const frontier = [startEntityId];
  visited.add(startEntityId);

  const allEdgeIds = new Set<string>();
  let hops = 0;

  while (hops < maxHops && frontier.length > 0) {
    const nextFrontier: string[] = [];

    // Get all relationships from/to frontier entities
    const [outgoing, incoming] = await Promise.all([
      prisma.oemEntityRelationship.findMany({
        where: { fromEntityId: { in: frontier }, fromEntity: { operatorId, status: "active" } },
        select: { id: true, fromEntityId: true, toEntityId: true, relationshipTypeId: true },
      }),
      prisma.oemEntityRelationship.findMany({
        where: { toEntityId: { in: frontier }, toEntity: { operatorId, status: "active" } },
        select: { id: true, fromEntityId: true, toEntityId: true, relationshipTypeId: true },
      }),
    ]);

    for (const rel of [...outgoing, ...incoming]) {
      allEdgeIds.add(rel.id);
      const neighbor = rel.fromEntityId === frontier.find((f) => f === rel.fromEntityId || f === rel.toEntityId)
        ? (rel.fromEntityId === rel.toEntityId ? rel.toEntityId : (frontier.includes(rel.fromEntityId) ? rel.toEntityId : rel.fromEntityId))
        : rel.fromEntityId;

      // Simplify: for outgoing, neighbor is toEntity; for incoming, neighbor is fromEntity
      for (const candidateId of [rel.fromEntityId, rel.toEntityId]) {
        if (!visited.has(candidateId)) {
          visited.add(candidateId);
          nextFrontier.push(candidateId);
        }
      }
    }

    frontier.length = 0;
    frontier.push(...nextFrontier);
    hops++;
  }

  // Fetch full entity data for all visited nodes
  const entities = await prisma.oemEntity.findMany({
    where: { id: { in: [...visited] }, operatorId, status: "active" },
    include: {
      entityType: { select: { name: true, slug: true, icon: true, color: true } },
      propertyValues: { include: { property: { select: { slug: true } } } },
    },
  });

  const nodes: GraphNode[] = entities.map((e) => ({
    id: e.id,
    displayName: e.displayName,
    entityType: e.entityType.name,
    typeSlug: e.entityType.slug,
    icon: e.entityType.icon,
    color: e.entityType.color,
    properties: Object.fromEntries(e.propertyValues.map((pv) => [pv.property.slug, pv.value])),
  }));

  // Fetch edges between visited nodes
  const edges = await prisma.oemEntityRelationship.findMany({
    where: {
      fromEntityId: { in: [...visited] },
      toEntityId: { in: [...visited] },
    },
    include: { relationshipType: { select: { name: true, slug: true } } },
  });

  const graphEdges: GraphEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.fromEntityId,
    target: e.toEntityId,
    label: e.relationshipType.name,
    typeSlug: e.relationshipType.slug,
  }));

  return { nodes, edges: graphEdges, hops };
}

/**
 * Get a focused subgraph around a specific entity (1-hop neighbors).
 */
export async function getFocusedSubgraph(
  operatorId: string,
  entityId: string,
): Promise<TraversalResult> {
  return searchAround(operatorId, entityId, 1);
}

/**
 * Format traversal result for injection into AI prompts.
 */
export function formatTraversalForAgent(result: TraversalResult): string {
  if (result.nodes.length === 0) return "No entities found in traversal.";

  const lines: string[] = [`Graph traversal: ${result.nodes.length} entities, ${result.edges.length} relationships`];

  for (const node of result.nodes.slice(0, 20)) {
    const props = Object.entries(node.properties).slice(0, 3)
      .map(([k, v]) => `${k}=${v}`).join(", ");
    lines.push(`- ${node.displayName} [${node.entityType}] ${props ? `(${props})` : ""}`);
  }

  for (const edge of result.edges.slice(0, 20)) {
    const from = result.nodes.find((n) => n.id === edge.source)?.displayName ?? edge.source;
    const to = result.nodes.find((n) => n.id === edge.target)?.displayName ?? edge.target;
    lines.push(`  ${from} --[${edge.label}]--> ${to}`);
  }

  return lines.join("\n");
}
