"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { OpenQuestion } from "@/lib/deliberation-types";

interface OpenQuestionsCardProps {
  situationId: string;
  questions: OpenQuestion[];
  onAnswered: () => void; // Caller refetches situation detail
}

export function OpenQuestionsCard({ situationId, questions, onAnswered }: OpenQuestionsCardProps) {
  if (questions.length === 0) return null;

  return (
    <div className="overflow-hidden min-w-0 w-[70%] mx-auto" style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.02em", color: "var(--foreground)" }}>
          Open Questions
        </span>
        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--fg3)" }}>
          {questions.length === 1 ? "1 awaiting" : `${questions.length} awaiting`}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {questions.map((q) => (
          <SingleQuestion key={q.id} situationId={situationId} question={q} onAnswered={onAnswered} />
        ))}
      </div>
    </div>
  );
}

function SingleQuestion({
  situationId,
  question,
  onAnswered,
}: {
  situationId: string;
  question: OpenQuestion;
  onAnswered: () => void;
}) {
  const { toast } = useToast();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = selectedOption !== null || customText.trim().length > 0;

  const handleOptionChange = (label: string) => {
    setSelectedOption(label);
    setCustomText("");
  };

  const handleCustomChange = (v: string) => {
    setCustomText(v);
    if (v.trim().length > 0) setSelectedOption(null);
  };

  const handleUsePrior = () => {
    if (!question.priorCustomAnswer) return;
    setCustomText(question.priorCustomAnswer);
    setSelectedOption(null);
  };

  const handleSubmit = async () => {
    const choice = selectedOption ?? customText.trim();
    const isCustomAnswer = selectedOption === null;
    if (!choice) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/situations/${situationId}/clarifications/${question.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice, isCustomAnswer }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast(body?.error ?? "Failed to answer", "error");
        return;
      }
      toast("Answered", "success");
      onAnswered();
    } catch {
      toast("Failed to answer", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--warn) 4%, transparent)",
        border: "1px solid color-mix(in srgb, var(--warn) 28%, transparent)",
        borderRadius: 8,
        padding: "14px 16px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--warn)",
            boxShadow: "0 0 0 3px color-mix(in srgb, var(--warn) 15%, transparent)",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
          {question.dimension}
        </span>
      </div>

      {/* Body */}
      <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.55, margin: "0 0 12px" }}>
        {question.question}
      </p>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {question.options.map((opt, i) => (
          <label
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "9px 12px",
              background: "var(--card-background, rgba(255,255,255,0.02))",
              border: "1px solid var(--card-border)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              checked={selectedOption === opt.label}
              onChange={() => handleOptionChange(opt.label)}
              style={{ marginTop: 3, accentColor: "var(--warn)" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--foreground)" }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2, lineHeight: 1.45 }}>{opt.hint}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Divider + custom answer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "6px 0",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--fg3)",
        }}
      >
        <div style={{ flex: 1, height: 1, background: "var(--card-border)" }} />
        or
        <div style={{ flex: 1, height: 1, background: "var(--card-border)" }} />
      </div>

      <div
        style={{
          padding: "9px 12px",
          background: "var(--card-background, rgba(255,255,255,0.02))",
          border: "1px solid var(--card-border)",
          borderRadius: 6,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: "var(--fg3)",
            marginBottom: 4,
          }}
        >
          <span>Write your own answer</span>
          {question.priorCustomAnswer && (
            <button
              type="button"
              onClick={handleUsePrior}
              style={{
                background: "transparent",
                border: 0,
                padding: 0,
                fontSize: 11,
                color: "var(--accent)",
                cursor: "pointer",
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textUnderlineOffset: 2,
              }}
            >
              use prior: &quot;{question.priorCustomAnswer.slice(0, 60)}{question.priorCustomAnswer.length > 60 ? "…" : ""}&quot;
            </button>
          )}
        </div>
        <textarea
          value={customText}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Describe the answer you want — the system will refine the drafts accordingly."
          style={{
            width: "100%",
            minHeight: 48,
            background: "transparent",
            border: 0,
            padding: 0,
            color: "var(--foreground)",
            fontSize: 12,
            lineHeight: 1.45,
            resize: "vertical",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 10,
          borderTop: "1px solid var(--card-border)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "ui-monospace, monospace" }}>
          Affects steps {question.affectedStepOrders.join(", ")}
        </span>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? "Saving…" : "Answer"}
        </Button>
      </div>
    </div>
  );
}
