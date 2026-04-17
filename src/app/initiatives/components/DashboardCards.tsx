"use client";

import { Fragment, useId, useState, type CSSProperties } from "react";
import type { DashboardCard } from "@/lib/initiative-dashboard-types";
import type { ParsedDashboard } from "@/lib/initiative-page-parser";

// ─── Style tokens ─────────────────────────────────────────────────────────────

const FLAG_DOT: Record<"neutral" | "good" | "warn" | "bad", string> = {
  neutral: "var(--fg4)",
  good: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--danger)",
};

const TIER_FILL: Record<"neutral" | "good" | "warn" | "bad", string> = {
  good: "color-mix(in srgb, var(--ok) 55%, transparent)",
  neutral: "color-mix(in srgb, var(--info) 55%, transparent)",
  warn: "color-mix(in srgb, var(--warn) 55%, transparent)",
  bad: "color-mix(in srgb, var(--danger) 55%, transparent)",
};

const DONUT_FILL: Record<"primary" | "secondary" | "tertiary", string> = {
  primary: "var(--accent)",
  secondary: "color-mix(in srgb, var(--fg3) 70%, transparent)",
  tertiary: "color-mix(in srgb, var(--fg4) 55%, transparent)",
};

const CONFIDENCE_BG: Record<"high" | "medium" | "low", string> = {
  high: "color-mix(in srgb, var(--ok) 14%, transparent)",
  medium: "color-mix(in srgb, var(--warn) 14%, transparent)",
  low: "color-mix(in srgb, var(--fg3) 18%, transparent)",
};
const CONFIDENCE_FG: Record<"high" | "medium" | "low", string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--fg3)",
};
const CONFIDENCE_TEXT: Record<"high" | "medium" | "low", string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const LOOP_GLYPH: Record<
  "trigger" | "fetch" | "compose" | "notify" | "execute" | "verify",
  string
> = {
  trigger: "⏲",
  fetch: "⬇",
  compose: "✎",
  notify: "✉",
  execute: "▶",
  verify: "✓",
};

const MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

// ─── Narrowed data types (one per primitive) ──────────────────────────────────

type ImpactBarData = Extract<DashboardCard, { primitive: "impact_bar" }>["data"];
type EntitySetData = Extract<DashboardCard, { primitive: "entity_set" }>["data"];
type ProcessFlowData = Extract<DashboardCard, { primitive: "process_flow" }>["data"];
type AutomationLoopData = Extract<DashboardCard, { primitive: "automation_loop" }>["data"];
type ConceptualDiagramData = Extract<DashboardCard, { primitive: "conceptual_diagram" }>["data"];
type TrendOrDistributionData = Extract<DashboardCard, { primitive: "trend_or_distribution" }>["data"];

type FailedCard = ParsedDashboard["failedCards"][number];

// ─── Top-level grid ───────────────────────────────────────────────────────────

export function DashboardCards({ cards }: { cards: DashboardCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: 12,
      }}
    >
      {cards.map((card, i) => (
        <DashboardCardFrame key={i} card={card}>
          {renderPrimitive(card)}
        </DashboardCardFrame>
      ))}
    </div>
  );
}

function renderPrimitive(card: DashboardCard) {
  switch (card.primitive) {
    case "impact_bar":
      return <ImpactBar data={card.data} />;
    case "entity_set":
      return <EntitySet data={card.data} />;
    case "process_flow":
      return <ProcessFlow data={card.data} />;
    case "automation_loop":
      return <AutomationLoop data={card.data} />;
    case "conceptual_diagram":
      return <ConceptualDiagram data={card.data} />;
    case "trend_or_distribution":
      return <TrendOrDistribution data={card.data} />;
    default:
      return assertNever(card);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled dashboard primitive: ${JSON.stringify(x)}`);
}

// ─── Frame chrome (claim, primitive slot, explanation, footer) ────────────────

function DashboardCardFrame({
  card,
  children,
}: {
  card: DashboardCard;
  children: React.ReactNode;
}) {
  const isLow = card.confidence === "low";
  return (
    <div
      style={{
        gridColumn: `span ${card.span}`,
        background: "var(--card-bg)",
        border: `1px solid ${isLow ? "rgba(255,255,255,0.06)" : "var(--border)"}`,
        borderRadius: 6,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: isLow ? 0.92 : 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--fg)",
          lineHeight: 1.35,
        }}
      >
        {card.claim}
      </div>

      <div style={{ minWidth: 0 }}>{children}</div>

      <div
        style={{
          fontSize: 12,
          color: "var(--fg2)",
          lineHeight: 1.55,
        }}
      >
        {card.explanation}
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 10,
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <ConfidenceChip confidence={card.confidence} />
        <EvidenceSummary evidence={card.evidence} />
      </div>
    </div>
  );
}

function ConfidenceChip({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: CONFIDENCE_BG[confidence],
        color: CONFIDENCE_FG[confidence],
      }}
    >
      {CONFIDENCE_TEXT[confidence]}
    </span>
  );
}

function EvidenceSummary({
  evidence,
}: {
  evidence: DashboardCard["evidence"];
}) {
  const count = evidence.length;
  if (count === 0) {
    return <span style={{ fontSize: 11, color: "var(--fg4)" }}>no sources</span>;
  }
  const inferredCount = evidence.filter((e) => e.inferred).length;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        justifyContent: "flex-end",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 11, color: "var(--fg3)" }}>
        {count} {count === 1 ? "source" : "sources"}
        {inferredCount > 0 ? ` · ${inferredCount} inferred` : ""}
      </span>
      {evidence.map((e, i) => {
        if (e.ref) return <EvidenceChip key={i} slug={e.ref} summary={e.summary} />;
        if (e.inferred) return <InferredMarker key={i} summary={e.summary} />;
        return null;
      })}
    </div>
  );
}

function EvidenceChip({ slug, summary }: { slug: string; summary: string }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={`/wiki/${slug}`}
      title={summary}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontSize: 11,
        color: "var(--fg3)",
        textDecoration: hover ? "underline" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {slug}
    </a>
  );
}

function InferredMarker({ summary }: { summary: string }) {
  return (
    <span
      title={summary}
      style={{
        fontSize: 11,
        color: "var(--fg4)",
        fontStyle: "italic",
      }}
    >
      [inferred]
    </span>
  );
}

// ─── Primitive: impact_bar ────────────────────────────────────────────────────

function ImpactBar({ data }: { data: ImpactBarData }) {
  const baseline = data.baseline.typicalValue;
  const projected = data.projected.typicalValue;
  const denom = Math.max(Math.abs(baseline), Math.abs(projected));
  const baselinePct = denom > 0 ? (Math.abs(baseline) / denom) * 100 : 0;
  const projectedPct = denom > 0 ? (Math.abs(projected) / denom) * 100 : 0;
  const hasRange = data.projected.range !== undefined;

  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "80px 1fr 140px",
    gap: 10,
    alignItems: "center",
  };
  const labelStyle: CSSProperties = {
    fontSize: 11,
    color: "var(--fg3)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 600,
  };
  const valueStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: 13,
    color: "var(--fg)",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  };
  const track: CSSProperties = {
    height: 8,
    background: "rgba(255,255,255,0.04)",
    borderRadius: 2,
    overflow: "hidden",
  };
  const stripedFill =
    "repeating-linear-gradient(90deg, color-mix(in srgb, var(--ok) 35%, transparent) 0 4px, color-mix(in srgb, var(--ok) 18%, transparent) 4px 8px)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={rowStyle}>
        <div style={labelStyle}>Now</div>
        <div style={track}>
          <div
            style={{
              width: `${baselinePct}%`,
              height: "100%",
              background: "color-mix(in srgb, var(--fg3) 60%, transparent)",
              borderRadius: 2,
            }}
          />
        </div>
        <div style={valueStyle}>
          {data.baseline.typicalValue} {data.baseline.unit}
        </div>
      </div>
      <div style={rowStyle}>
        <div style={labelStyle}>Proposed</div>
        <div style={track}>
          <div
            style={{
              width: `${projectedPct}%`,
              height: "100%",
              background: hasRange ? stripedFill : "var(--ok)",
              borderRadius: 2,
            }}
          />
        </div>
        <div style={valueStyle}>
          {hasRange
            ? `${data.projected.range!.low}–${data.projected.range!.high} ${data.projected.unit}`
            : `${data.projected.typicalValue} ${data.projected.unit}`}
        </div>
      </div>
      {data.savings && (
        <div
          style={{
            marginTop: 4,
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 18,
              fontWeight: 600,
              color: data.savings.typicalValue > 0 ? "var(--ok)" : "var(--fg)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {data.savings.typicalValue} {data.savings.unit}
          </div>
          <div style={{ fontSize: 11, color: "var(--fg3)", lineHeight: 1.4 }}>
            {data.savings.label}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Primitive: entity_set ────────────────────────────────────────────────────

function EntitySet({ data }: { data: EntitySetData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {data.subtitle && (
        <div
          style={{
            fontSize: 11,
            color: "var(--fg3)",
            fontStyle: "italic",
            marginBottom: 6,
          }}
        >
          {data.subtitle}
        </div>
      )}
      {data.entities.map((entity, i) => (
        <EntityRow key={i} entity={entity} />
      ))}
    </div>
  );
}

function EntityRow({ entity }: { entity: EntitySetData["entities"][number] }) {
  const [hover, setHover] = useState(false);
  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 4,
    background: hover && entity.slug ? "var(--hover-bg)" : "transparent",
    transition: "background 120ms ease",
    textDecoration: "none",
    color: "var(--fg)",
  };
  const inner = (
    <>
      <span
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: 999,
          background: FLAG_DOT[entity.flag],
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--fg)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {entity.name}
        </div>
        {entity.subtitle && (
          <div style={{ fontSize: 10.5, color: "var(--fg3)", marginTop: 1 }}>
            {entity.subtitle}
          </div>
        )}
      </div>
      {entity.metric && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11.5,
            color: entity.metricFlag
              ? FLAG_DOT[entity.metricFlag]
              : "var(--fg2)",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {entity.metric}
        </div>
      )}
    </>
  );
  if (entity.slug) {
    return (
      <a
        href={`/wiki/${entity.slug}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={rowStyle}
      >
        {inner}
      </a>
    );
  }
  return <div style={rowStyle}>{inner}</div>;
}

// ─── Primitive: process_flow ──────────────────────────────────────────────────

function ProcessFlow({ data }: { data: ProcessFlowData }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        flexWrap: "wrap",
        rowGap: 10,
      }}
    >
      {data.steps.map((step, i) => (
        <Fragment key={i}>
          {i > 0 && <FlowConnector />}
          <ProcessStep step={step} index={i + 1} />
        </Fragment>
      ))}
    </div>
  );
}

function FlowConnector() {
  return (
    <div
      style={{
        flex: "0 0 14px",
        height: 1,
        background: "var(--border-strong)",
        alignSelf: "center",
        marginTop: -14,
      }}
    />
  );
}

function ProcessStep({
  step,
  index,
}: {
  step: ProcessFlowData["steps"][number];
  index: number;
}) {
  const isCheckpoint = step.checkpoint === true;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        flex: "0 0 auto",
        minWidth: 60,
        maxWidth: 100,
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          border: `1px solid ${isCheckpoint ? "var(--warn)" : "var(--border-strong)"}`,
          background: isCheckpoint
            ? "color-mix(in srgb, var(--warn) 20%, var(--card-bg))"
            : "var(--card-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MONO,
          fontSize: 11,
          color: isCheckpoint ? "var(--warn)" : "var(--fg2)",
          lineHeight: 1,
        }}
      >
        {index}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fg2)",
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        {step.label}
      </div>
      {step.note && (
        <div
          style={{
            fontSize: 9.5,
            color: "var(--warn)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {step.note}
        </div>
      )}
    </div>
  );
}

// ─── Primitive: automation_loop ───────────────────────────────────────────────

function AutomationLoop({ data }: { data: AutomationLoopData }) {
  const rawId = useId();
  const markerId = `loop-arrow-${rawId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  return (
    <div>
      <svg
        width="0"
        height="0"
        aria-hidden
        style={{ position: "absolute", pointerEvents: "none" }}
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
          </marker>
        </defs>
      </svg>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          gap: 0,
          flexWrap: "wrap",
          rowGap: 8,
        }}
      >
        {data.nodes.map((node, i) => (
          <Fragment key={i}>
            {i > 0 && <LoopArrow markerId={markerId} />}
            <LoopNode node={node} />
          </Fragment>
        ))}
      </div>
      {data.annotation && (
        <div
          style={{
            marginTop: 2,
            padding: "7px 10px",
            background: "color-mix(in srgb, var(--warn) 8%, transparent)",
            borderLeft: "2px solid var(--warn)",
            borderRadius: "0 4px 4px 0",
            fontSize: 11,
            color: "var(--fg2)",
            lineHeight: 1.4,
          }}
        >
          {data.annotation}
        </div>
      )}
    </div>
  );
}

function LoopArrow({ markerId }: { markerId: string }) {
  return (
    <svg
      width={20}
      height={60}
      viewBox="0 0 20 60"
      style={{ flex: "0 0 20px", alignSelf: "center" }}
      aria-hidden
    >
      <line
        x1={0}
        y1={30}
        x2={16}
        y2={30}
        stroke="var(--border-strong)"
        strokeWidth={1}
        markerEnd={`url(#${markerId})`}
      />
    </svg>
  );
}

function LoopNode({ node }: { node: AutomationLoopData["nodes"][number] }) {
  const subLines = node.sub.split("\n");
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.035)",
        border: "1px solid var(--border-strong)",
        borderRadius: 7,
        padding: 10,
        minWidth: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 16, color: "var(--fg)", lineHeight: 1 }}>
        {LOOP_GLYPH[node.icon] ?? "•"}
      </div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--fg)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          textAlign: "center",
        }}
      >
        {node.title}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fg3)",
          lineHeight: 1.35,
          textAlign: "center",
        }}
      >
        {subLines.map((line, j) => (
          <div key={j}>{line}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Primitive: conceptual_diagram ────────────────────────────────────────────

function ConceptualDiagram({ data }: { data: ConceptualDiagramData }) {
  if (data.variant === "tier_pyramid") {
    return <TierPyramid data={data} />;
  }
  // Unreachable in v1 — guards against future variants the schema may allow
  // before this renderer catches up. Render a quiet placeholder inside the
  // frame chrome rather than returning null (to avoid orphaning the frame).
  const variantName = (data as { variant?: string }).variant ?? "unknown";
  console.warn(
    `[DashboardCards] Unsupported conceptual_diagram variant: ${variantName}`,
  );
  return <PrimitiveUnavailable />;
}

function getTierWidths(n: number): number[] {
  if (n === 2) return [50, 100];
  if (n === 3) return [35, 70, 100];
  if (n === 4) return [20, 45, 70, 100];
  if (n === 5) return [20, 45, 70, 90, 100];
  return Array.from({ length: n }, (_, i) =>
    Math.round(((i + 1) / n) * 100),
  );
}

function TierPyramid({
  data,
}: {
  data: Extract<ConceptualDiagramData, { variant: "tier_pyramid" }>;
}) {
  const widths = getTierWidths(data.tiers.length);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {data.tiers.map((tier, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 240px 1fr",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div
            style={{
              textAlign: "right",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--fg)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {tier.label}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: `${widths[i]}%`,
                height: 18,
                background: TIER_FILL[tier.flag],
                borderRadius: 3,
              }}
            />
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: "var(--fg3)",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tier.count} · {tier.threshold}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrimitiveUnavailable() {
  return (
    <div
      style={{
        padding: "24px 12px",
        fontSize: 11,
        color: "var(--fg4)",
        fontStyle: "italic",
        textAlign: "center",
      }}
    >
      Visualization unavailable
    </div>
  );
}

// ─── Primitive: trend_or_distribution ─────────────────────────────────────────

function TrendOrDistribution({ data }: { data: TrendOrDistributionData }) {
  if (data.kind === "sparkline") return <Sparkline data={data} />;
  if (data.kind === "donut") return <Donut data={data} />;
  return <PrimitiveUnavailable />;
}

function Sparkline({
  data,
}: {
  data: Extract<TrendOrDistributionData, { kind: "sparkline" }>;
}) {
  const points = data.points;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const n = points.length;
  const coords = points.map((p, i) => {
    const x = n === 1 ? 50 : (i / (n - 1)) * 100;
    const y = 44 - ((p - min) / range) * 40 - 2;
    return { x, y };
  });
  const poly = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const color = data.flag === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingBottom: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 26,
            fontWeight: 600,
            color: "var(--fg)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {data.headlineValue}
        </div>
        <div style={{ fontSize: 12, color: "var(--fg3)" }}>
          {data.headlineUnit}
        </div>
        {data.deltaLabel && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              color: data.flag === "warn" ? "var(--warn)" : "var(--fg3)",
              marginLeft: "auto",
            }}
          >
            {data.deltaLabel}
          </div>
        )}
      </div>
      <svg
        viewBox="0 0 100 44"
        preserveAspectRatio="none"
        style={{ width: "100%", height: 44, display: "block" }}
        aria-hidden
      >
        <polyline
          points={poly}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={2}
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: MONO,
          fontSize: 10,
          color: "var(--fg4)",
        }}
      >
        <span>{data.xAxisStart}</span>
        <span>{data.xAxisEnd}</span>
      </div>
    </div>
  );
}

type DonutSegment = Extract<
  TrendOrDistributionData,
  { kind: "donut" }
>["segments"][number];

function Donut({
  data,
}: {
  data: Extract<TrendOrDistributionData, { kind: "donut" }>;
}) {
  const OUTER = 50;
  const INNER = 30;
  const CX = 55;
  const CY = 55;

  const total = data.segments.reduce((sum, s) => sum + s.value, 0);
  const nonZero = data.segments.filter((s) => s.value > 0);

  // Degenerate case: one effective segment (either a single non-zero entry or
  // one segment ≥99.9% of total). A single-arc SVG collapses to a single point
  // when start and end coincide, so render a full ring instead.
  if (
    total > 0 &&
    (nonZero.length === 1 || nonZero[0].value / total >= 0.999)
  ) {
    const seg = nonZero[0];
    return (
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <svg
          width={110}
          height={110}
          viewBox="0 0 110 110"
          style={{ flexShrink: 0 }}
          aria-hidden
        >
          <circle
            cx={CX}
            cy={CY}
            r={(OUTER + INNER) / 2}
            fill="none"
            stroke={DONUT_FILL[seg.flag]}
            strokeWidth={OUTER - INNER}
          />
        </svg>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minWidth: 0,
          }}
        >
          <DonutLegendRow seg={seg} />
        </div>
      </div>
    );
  }

  // Normal path. Iterate non-zero segments only — zero-value segments produce
  // zero-extent arcs (stray-point artifacts) and are legend noise. Guard denom
  // for the all-zero case so we don't emit NaN into the SVG.
  const denom = total > 0 ? total : 1;
  let acc = 0;
  const arcs = nonZero.map((seg) => {
    const start = (acc / denom) * 2 * Math.PI - Math.PI / 2;
    acc += seg.value;
    const end = (acc / denom) * 2 * Math.PI - Math.PI / 2;
    const largeArc = seg.value / denom > 0.5 ? 1 : 0;
    const x1 = CX + OUTER * Math.cos(start);
    const y1 = CY + OUTER * Math.sin(start);
    const x2 = CX + OUTER * Math.cos(end);
    const y2 = CY + OUTER * Math.sin(end);
    const x3 = CX + INNER * Math.cos(end);
    const y3 = CY + INNER * Math.sin(end);
    const x4 = CX + INNER * Math.cos(start);
    const y4 = CY + INNER * Math.sin(start);
    const d = [
      `M ${x1} ${y1}`,
      `A ${OUTER} ${OUTER} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${INNER} ${INNER} 0 ${largeArc} 0 ${x4} ${y4}`,
      "Z",
    ].join(" ");
    return { d, seg };
  });

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
      <svg
        width={110}
        height={110}
        viewBox="0 0 110 110"
        style={{ flexShrink: 0 }}
        aria-hidden
      >
        {arcs.map((arc, i) => (
          <path key={i} d={arc.d} fill={DONUT_FILL[arc.seg.flag]} />
        ))}
      </svg>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 0,
        }}
      >
        {nonZero.map((seg, i) => (
          <DonutLegendRow key={i} seg={seg} />
        ))}
      </div>
    </div>
  );
}

function DonutLegendRow({ seg }: { seg: DonutSegment }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "10px 1fr auto",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          background: DONUT_FILL[seg.flag],
          borderRadius: 2,
        }}
      />
      <div style={{ fontSize: 11.5, color: "var(--fg2)" }}>{seg.label}</div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 11.5,
          color: "var(--fg)",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
        }}
      >
        {seg.value}
      </div>
    </div>
  );
}

// ─── FailedCardPlaceholder ────────────────────────────────────────────────────

export function FailedCardPlaceholder({ failed }: { failed: FailedCard }) {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        border:
          "1px solid color-mix(in srgb, var(--danger) 25%, var(--border))",
        borderRadius: 6,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--fg)",
          lineHeight: 1.4,
        }}
      >
        {failed.claim ?? "Card couldn't render"}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--fg2)",
          lineHeight: 1.55,
        }}
      >
        {failed.explanation ??
          "An internal error prevented this card from rendering."}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fg4)",
          fontStyle: "italic",
          marginTop: 4,
        }}
      >
        Reason: {failed.error}
      </div>
    </div>
  );
}
