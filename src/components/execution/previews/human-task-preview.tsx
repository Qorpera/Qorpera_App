"use client";

import { useState } from "react";
import type { PreviewProps } from "./get-preview-component";

export function HumanTaskPreview({ step, isEditable, onParametersUpdate, onStepComplete, locale, inPanel }: PreviewProps) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(step.status === "completed");

  const params = step.parameters ?? {};
  const context = params.context as string | undefined;
  const evidence = params.evidence as string | string[] | undefined;
  const deadline = params.deadline as string | undefined;
  const assignee = params.assignee as string | undefined;

  const handleComplete = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Save notes as parameters first
      if (onParametersUpdate) {
        await onParametersUpdate({ ...params, completionNotes: notes, completedAt: new Date().toISOString() });
      }
      // Then mark the step as complete
      if (onStepComplete) {
        await onStepComplete(notes);
      }
      setCompleted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: inPanel ? 0 : 16 }}>
      {/* Task description */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: "var(--foreground)", lineHeight: 1.7 }}>
          {step.description}
        </p>
      </div>

      {/* Deadline */}
      {deadline && (
        <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 6, background: "color-mix(in srgb, var(--warn) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--warn) 20%, transparent)" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--warn)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Deadline</span>
          <p style={{ fontSize: 13, color: "var(--foreground)", marginTop: 2 }}>{deadline}</p>
        </div>
      )}

      {/* Assignee */}
      {assignee && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assigned to</span>
          <p style={{ fontSize: 13, color: "var(--fg2)", marginTop: 2 }}>{assignee}</p>
        </div>
      )}

      {/* Context */}
      {context && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Context</span>
          <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.6, marginTop: 4 }}>{context}</p>
        </div>
      )}

      {/* Evidence */}
      {evidence && (
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Evidence</span>
          <div style={{ marginTop: 6 }}>
            {(Array.isArray(evidence) ? evidence : [evidence]).map((e, i) => (
              <p key={i} style={{ fontSize: 12, color: "var(--fg3)", lineHeight: 1.5, marginBottom: 4, paddingLeft: 10, borderLeft: "2px solid var(--border)" }}>{e}</p>
            ))}
          </div>
        </div>
      )}

      {/* Completion flow */}
      {!completed ? (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>What happened?</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe what was done, any details that affect next steps..."
            style={{
              width: "100%",
              minHeight: 100,
              marginTop: 8,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.04)",
              border: "0.5px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
              fontSize: 13,
              lineHeight: 1.5,
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            disabled={submitting}
            onClick={handleComplete}
            style={{
              marginTop: 10,
              padding: "8px 20px",
              borderRadius: 6,
              background: "var(--accent)",
              color: "white",
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? "Submitting..." : "Mark Complete"}
          </button>
        </div>
      ) : (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <div style={{ padding: "10px 14px", borderRadius: 6, background: "color-mix(in srgb, var(--ok) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--ok) 20%, transparent)" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ok)" }}>Completed</span>
            {(params.completionNotes || notes) && (
              <p style={{ fontSize: 13, color: "var(--fg2)", marginTop: 4 }}>{(params.completionNotes as string) || notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
