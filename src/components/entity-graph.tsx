"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import Link from "next/link";
import type { GraphNode, GraphEdge, GraphData, FocusedSubgraph } from "@/lib/entity-data";

/* ---------- Dagre layout ---------- */

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;

function applyDagreLayout<T extends Record<string, unknown> = Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
): { nodes: Node<T>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const laid = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: laid, edges };
}

/* ---------- Custom node component ---------- */

type EntityNodeData = {
  graphNode: GraphNode;
};

function EntityNode({ data }: NodeProps<Node<EntityNodeData>>) {
  const gn = data.graphNode;
  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-md"
      style={{
        background: "rgba(24,32,39,0.95)",
        borderColor: "rgba(255,255,255,0.1)",
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/20 !border-white/10 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{gn.icon || "\u25CF"}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white/90">{gn.displayName}</div>
          <div
            className="truncate text-[11px] font-medium"
            style={{ color: gn.color || "#a78bfa" }}
          >
            {gn.entityType}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !border-white/10 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  entity: EntityNode,
};

/* ---------- Detail panel ---------- */

interface DetailPanelProps {
  graphNode: GraphNode;
  relationships: { label: string; target: string; targetId: string }[];
  onClose: () => void;
  onSearchAround: (entityId: string) => void;
}

function DetailPanel({ graphNode, relationships, onClose, onSearchAround }: DetailPanelProps) {
  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-80 overflow-y-auto border-l p-4 z-20"
      style={{
        background: "rgba(14,20,27,0.98)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl">{graphNode.icon || "\u25CF"}</span>
          <div className="min-w-0">
            <h3 className="text-white font-medium truncate">{graphNode.displayName}</h3>
            <span className="text-xs font-medium" style={{ color: graphNode.color || "#a78bfa" }}>
              {graphNode.entityType}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white/70 text-lg leading-none ml-2 shrink-0"
        >
          &times;
        </button>
      </div>

      {/* Properties */}
      {Object.keys(graphNode.properties).length > 0 && (
        <div className="mb-4">
          <h4 className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Properties</h4>
          <div className="space-y-1.5">
            {Object.entries(graphNode.properties).map(([key, value]) => (
              <div key={key} className="text-sm">
                <span className="text-white/50">{key}:</span>{" "}
                <span className="text-white/80">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationships */}
      {relationships.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Relationships</h4>
          <div className="space-y-1.5">
            {relationships.map((rel, i) => (
              <div key={i} className="text-sm text-white/70">
                <span className="text-white/40">{rel.label}</span>{" "}
                <span className="text-white/80">{rel.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 mt-6">
        <button
          onClick={() => onSearchAround(graphNode.id)}
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
        >
          Search around
        </button>
        <Link
          href={`/entities/${graphNode.id}`}
          className="block w-full rounded-md border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm text-purple-300 text-center hover:bg-purple-500/20 transition-colors"
        >
          View entity
        </Link>
      </div>
    </div>
  );
}

/* ---------- Inner graph (needs ReactFlowProvider ancestor) ---------- */

function EntityGraphInner() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const [focusedLoading, setFocusedLoading] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EntityNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const graphNodeMap = useRef<Map<string, GraphNode>>(new Map());

  /* Fetch full graph on mount */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/graph");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: GraphData = await res.json();
        if (!cancelled) {
          setGraphData(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load graph");
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* Build node map whenever graph data changes */
  useEffect(() => {
    if (!graphData) return;
    const map = new Map<string, GraphNode>();
    for (const n of graphData.nodes) map.set(n.id, n);
    graphNodeMap.current = map;
  }, [graphData]);

  /* Determine the visible subset based on search + focused state */
  const visibleData = useMemo(() => {
    if (!graphData) return null;

    let visibleNodes = graphData.nodes;
    let visibleEdges = graphData.edges;

    // If we have a focused subgraph filter, apply it first
    // (focusedEntityId gates whether we're in focused mode; actual data comes from graphData which we replace)

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchIds = new Set(
        visibleNodes
          .filter((n) => n.displayName.toLowerCase().includes(q))
          .map((n) => n.id)
      );
      visibleNodes = visibleNodes.filter((n) => matchIds.has(n.id));
      visibleEdges = visibleEdges.filter(
        (e) => matchIds.has(e.source) && matchIds.has(e.target)
      );
    }

    return { nodes: visibleNodes, edges: visibleEdges };
  }, [graphData, searchQuery]);

  /* Convert to React Flow nodes/edges and run dagre layout */
  useEffect(() => {
    if (!visibleData) return;

    const rfNodes: Node<EntityNodeData>[] = visibleData.nodes.map((gn) => ({
      id: gn.id,
      type: "entity",
      position: { x: 0, y: 0 },
      data: { graphNode: gn },
    }));

    const rfEdges: Edge[] = visibleData.edges.map((ge) => ({
      id: ge.id,
      source: ge.source,
      target: ge.target,
      label: ge.label,
      type: "default",
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(255,255,255,0.25)" },
      style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5 },
      labelStyle: { fill: "rgba(255,255,255,0.5)", fontSize: 11 },
      labelBgStyle: { fill: "rgba(14,20,27,0.9)", fillOpacity: 0.9 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    }));

    if (rfNodes.length > 0) {
      const { nodes: laidNodes, edges: laidEdges } = applyDagreLayout(rfNodes, rfEdges, "TB");
      setNodes(laidNodes);
      setEdges(laidEdges);

      // Fit after layout settles
      requestAnimationFrame(() => {
        fitView({ padding: 0.15, duration: 300 });
      });
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [visibleData, setNodes, setEdges, fitView]);

  /* Node click handler */
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
    },
    []
  );

  /* Search around handler */
  const handleSearchAround = useCallback(
    async (entityId: string) => {
      setFocusedLoading(true);
      try {
        const res = await fetch(`/api/graph/focused?entityId=${entityId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const focused: FocusedSubgraph = await res.json();
        setGraphData({ nodes: focused.nodes, edges: focused.edges });
        setFocusedEntityId(entityId);
        setSelectedNodeId(entityId);
      } catch {
        // Silently fail -- graph stays as is
      } finally {
        setFocusedLoading(false);
      }
    },
    []
  );

  /* Reset to full graph */
  const handleResetView = useCallback(async () => {
    setFocusedEntityId(null);
    setSearchQuery("");
    setSelectedNodeId(null);
    setLoading(true);
    try {
      const res = await fetch("/api/graph");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GraphData = await res.json();
      setGraphData(data);
    } catch {
      // Keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  /* Selected node detail data */
  const selectedNode = selectedNodeId ? graphNodeMap.current.get(selectedNodeId) ?? null : null;

  const selectedRelationships = useMemo(() => {
    if (!selectedNodeId || !graphData) return [];
    return graphData.edges
      .filter((e) => e.source === selectedNodeId || e.target === selectedNodeId)
      .map((e) => {
        const isSource = e.source === selectedNodeId;
        const otherId = isSource ? e.target : e.source;
        const other = graphNodeMap.current.get(otherId);
        return {
          label: e.label,
          target: other?.displayName ?? otherId,
          targetId: otherId,
        };
      });
  }, [selectedNodeId, graphData]);

  /* ---------- Loading state ---------- */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
          <span className="text-sm text-white/50">Loading entity map...</span>
        </div>
      </div>
    );
  }

  /* ---------- Error state ---------- */
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-red-400/80">{error}</div>
      </div>
    );
  }

  /* ---------- Empty state ---------- */
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="max-w-xs text-center text-sm text-white/40">
          No entities yet. Import data or create entities to see them here.
        </p>
      </div>
    );
  }

  /* ---------- Main render ---------- */
  return (
    <div className="relative h-full w-full">
      {/* Search bar */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search entities..."
          className="h-8 w-60 rounded-md border border-white/10 bg-[rgba(14,20,27,0.9)] px-3 text-sm text-white/80 placeholder-white/30 outline-none focus:border-purple-500/40 transition-colors"
        />
        {(focusedEntityId || searchQuery) && (
          <button
            onClick={handleResetView}
            className="h-8 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors"
          >
            Reset view
          </button>
        )}
        {focusedEntityId && (
          <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[11px] text-purple-300">
            Focused view
          </span>
        )}
      </div>

      {/* Focused loading overlay */}
      {focusedLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
            <span className="text-sm text-white/60">Loading subgraph...</span>
          </div>
        </div>
      )}

      {/* React Flow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background color="rgba(255,255,255,0.03)" gap={24} />
        <Controls
          showInteractive={false}
          className="!bg-[rgba(14,20,27,0.9)] !border-white/10 !rounded-md [&>button]:!bg-transparent [&>button]:!border-white/10 [&>button]:!fill-white/50 [&>button:hover]:!fill-white/80"
        />
      </ReactFlow>

      {/* Detail panel */}
      {selectedNode && (
        <DetailPanel
          graphNode={selectedNode}
          relationships={selectedRelationships}
          onClose={() => setSelectedNodeId(null)}
          onSearchAround={handleSearchAround}
        />
      )}
    </div>
  );
}

/* ---------- Exported wrapper with provider ---------- */

export default function EntityGraph() {
  return (
    <ReactFlowProvider>
      <EntityGraphInner />
    </ReactFlowProvider>
  );
}
