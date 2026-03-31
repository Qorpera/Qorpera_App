"use client";

import { useState } from "react";

interface CycleData {
  id: string;
  cycleNumber: number;
  triggerType: string;
  triggerSummary: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  executionPlan: {
    id: string;
    status: string;
    steps: Array<{
      id: string;
      title: string;
      description: string;
      executionMode: string;
      status: string;
      outputResult: string | null;
      executedAt: string | null;
    }>;
  } | null;
}

function triggerBadge(type: string): { label: string; color: string } {
  switch (type) {
    case "detection": return { label: "Detected", color: "var(--accent)" };
    case "response_received": return { label: "Response", color: "var(--ok)" };
    case "timeout": return { label: "Timeout", color: "var(--warn)" };
    case "manual": return { label: "Manual", color: "var(--fg3)" };
    default: return { label: "Signal", color: "var(--fg4)" };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function CycleTimeline({ cycles }: { cycles: CycleData[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ position: "relative", minHeight: cycles.length * 80 }}>
      {/* Center rail */}
      <div style={{
        position: "absolute",
        left: "50%",
        top: 0,
        bottom: 0,
        width: 2,
        background: "var(--border)",
        transform: "translateX(-1px)",
      }} />

      {cycles.map((cycle, i) => {
        const isLeft = i % 2 === 0;
        const badge = triggerBadge(cycle.triggerType);
        const isOpen = expanded.has(cycle.id);
        const steps = cycle.executionPlan?.steps ?? [];

        return (
          <div key={cycle.id} style={{ position: "relative", marginBottom: 16 }}>
            {/* Center dot */}
            <div style={{
              position: "absolute",
              left: "50%",
              top: 8,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--surface)",
              border: "2px solid var(--ok)",
              transform: "translateX(-9px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "var(--ok)",
              zIndex: 1,
            }}>
              &#10003;
            </div>

            {/* Card */}
            <div
              onClick={() => toggle(cycle.id)}
              style={{
                width: "44%",
                ...(isLeft ? { marginRight: "auto" } : { marginLeft: "auto" }),
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg2)" }}>
                  Cycle {cycle.cycleNumber}
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: `color-mix(in srgb, ${badge.color} 15%, transparent)`,
                  color: badge.color,
                  border: `1px solid color-mix(in srgb, ${badge.color} 30%, transparent)`,
                }}>
                  {badge.label}
                </span>
                <span style={{ fontSize: 10, color: "var(--fg4)", marginLeft: "auto" }}>
                  {formatDate(cycle.createdAt)}
                </span>
              </div>

              {/* Summary */}
              <p style={{ fontSize: 12, color: "var(--fg3)", lineHeight: 1.5 }}>
                {cycle.triggerSummary}
              </p>

              {/* Expanded: steps */}
              {isOpen && steps.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  {steps.map((step) => (
                    <div key={step.id} className="flex items-start gap-2" style={{ marginBottom: 4 }}>
                      <span style={{
                        color: step.status === "completed" ? "var(--ok)" : "var(--fg4)",
                        fontSize: 12,
                        flexShrink: 0,
                        marginTop: 1,
                      }}>
                        {step.status === "completed" ? "✓" : "○"}
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: step.status === "completed" ? "var(--fg3)" : "var(--fg2)",
                        textDecoration: step.status === "completed" ? "line-through" : "none",
                      }}>
                        {step.title}
                        {step.outputResult && (() => {
                          try {
                            const r = JSON.parse(step.outputResult!);
                            return r.notes ? <span style={{ color: "var(--fg4)" }}> — {r.notes}</span> : null;
                          } catch { return null; }
                        })()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
