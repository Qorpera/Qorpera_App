"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Decision } from "@/lib/deliberation-types";

interface DecisionsSectionProps {
  situationId: string;
  decisions: Decision[];
  onOverridden: () => void;
}

export function DecisionsSection({ situationId, decisions, onOverridden }: DecisionsSectionProps) {
  const [overrideTarget, setOverrideTarget] = useState<Decision | null>(null);

  if (decisions.length === 0) return null;

  const autoAppliedCount = decisions.filter((d) => d.kind === "auto_applied").length;
  const answeredCount = decisions.filter((d) => d.kind === "answered").length;
  const countSummary = [
    answeredCount > 0 ? `${answeredCount} answered` : null,
    autoAppliedCount > 0 ? `${autoAppliedCount} auto-applied` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-hidden min-w-0 w-[70%] mx-auto" style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.02em", color: "var(--foreground)" }}>
          Decisions
        </span>
        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--fg3)" }}>{countSummary}</span>
      </div>

      <div
        style={{
          background: "var(--card-background, rgba(255,255,255,0.02))",
          border: "1px solid var(--card-border)",
          borderRadius: 8,
          padding: "4px 16px",
        }}
      >
        {decisions.map((d, i) => (
          <DecisionRow
            key={d.id}
            decision={d}
            isFirst={i === 0}
            onOverride={() => setOverrideTarget(d)}
          />
        ))}
      </div>

      {overrideTarget && overrideTarget.kind === "auto_applied" && (
        <OverrideModal
          situationId={situationId}
          decision={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onOverridden={() => {
            setOverrideTarget(null);
            onOverridden();
          }}
        />
      )}
    </div>
  );
}

function DecisionRow({
  decision,
  isFirst,
  onOverride,
}: {
  decision: Decision;
  isFirst: boolean;
  onOverride: () => void;
}) {
  const tagBg =
    decision.kind === "answered"
      ? "color-mix(in srgb, var(--accent) 12%, transparent)"
      : "color-mix(in srgb, var(--accent) 10%, transparent)";
  const tagColor = "var(--accent)";
  const tagLabel = decision.kind === "answered" ? "answered" : "auto-applied";

  return (
    <div
      style={{
        padding: "12px 0",
        borderTop: isFirst ? "none" : "1px solid var(--card-border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{decision.dimension}</span>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: "ui-monospace, monospace",
            padding: "2px 7px",
            borderRadius: 3,
            background: tagBg,
            color: tagColor,
            whiteSpace: "nowrap",
          }}
        >
          {tagLabel}
        </span>
      </div>

      {decision.kind === "answered" ? (
        <>
          <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 3 }}>
            Raised {formatAt(decision.raisedAt)} · answered by {decision.answeredBySlug ?? decision.answeredByUserId} {formatAt(decision.answeredAt)}
          </div>
          <div style={{ fontSize: 12, color: "var(--fg2)" }}>
            <strong style={{ color: "var(--foreground)", fontWeight: 500 }}>Chosen:</strong> {decision.choice}
            {decision.isCustomAnswer && (
              <span style={{ fontSize: 10, color: "var(--fg3)", marginLeft: 6, fontStyle: "italic" }}>(custom)</span>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 3 }}>{decision.basis}</div>
          <div style={{ fontSize: 12, color: "var(--fg2)" }}>
            <strong style={{ color: "var(--foreground)", fontWeight: 500 }}>Applied:</strong> {decision.choice}
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, fontSize: 10, color: "var(--fg3)", fontFamily: "ui-monospace, monospace" }}>
        <span>Affects steps {decision.affectedStepOrders.join(", ")}</span>
        {decision.kind === "auto_applied" && (
          <button
            type="button"
            onClick={onOverride}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              fontSize: 11,
              color: "var(--fg2)",
              cursor: "pointer",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textUnderlineOffset: 2,
              fontFamily: "inherit",
            }}
          >
            Override
          </button>
        )}
      </div>
    </div>
  );
}

function OverrideModal({
  situationId,
  decision,
  onClose,
  onOverridden,
}: {
  situationId: string;
  decision: Decision;
  onClose: () => void;
  onOverridden: () => void;
}) {
  const { toast } = useToast();
  const [newChoice, setNewChoice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = newChoice.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/situations/${situationId}/decisions/${decision.id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newChoice: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast(body?.error ?? "Failed to override", "error");
        return;
      }
      toast("Override applied", "success");
      onOverridden();
    } catch {
      toast("Failed to override", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Override: ${decision.dimension}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.55 }}>
          The system applied <strong style={{ color: "var(--foreground)" }}>{decision.choice}</strong>. Enter the choice you want instead — affected steps will be re-refined and the learned preference will update to reflect your disagreement.
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--fg3)", display: "block", marginBottom: 6 }}>
            New choice
          </label>
          <textarea
            value={newChoice}
            onChange={(e) => setNewChoice(e.target.value)}
            placeholder="Describe the choice you want instead"
            style={{
              width: "100%",
              minHeight: 72,
              padding: "8px 10px",
              background: "var(--card-background, rgba(255,255,255,0.02))",
              border: "1px solid var(--card-border)",
              borderRadius: 6,
              color: "var(--foreground)",
              fontSize: 13,
              lineHeight: 1.5,
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
            }}
            autoFocus
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!newChoice.trim() || submitting}>
            {submitting ? "Applying…" : "Apply override"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function formatAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
  } catch {
    return iso;
  }
}
