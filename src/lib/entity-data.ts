// Entity graph data types used across components and API routes

export interface GraphNode {
  id: string;
  displayName: string;
  entityType: string;
  typeSlug: string;
  icon: string;
  color: string;
  properties: Record<string, string>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  typeSlug: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FocusedSubgraph {
  center: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
}
