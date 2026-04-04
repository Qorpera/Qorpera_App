"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────────────────────────

interface DeliverableDetail {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  stage: string;
  generationMode: string;
  content: ContentDoc | null;
  completenessReport: unknown;
  confidenceLevel: string | null;
  riskCount: number;
  templateSectionId: string | null;
  assignedToId: string | null;
  acceptedById: string | null;
  acceptedAt: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  acceptedBy: { id: string; name: string; email: string } | null;
}

interface ContentSection {
  type: string;
  level?: number;
  text?: string;
  severity?: string;
}

interface ContentDoc {
  sections: ContentSection[];
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  user?: { id: string; name: string } | null;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DeliverableDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const deliverableId = params.deliverableId as string;

  const [deliverable, setDeliverable] = useState<DeliverableDetail | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [delRes, chatRes] = await Promise.all([
          fetchApi(`/api/projects/${projectId}/deliverables/${deliverableId}`),
          fetchApi(`/api/projects/${projectId}/deliverables/${deliverableId}/chat`),
        ]);
        if (!cancelled) {
          if (delRes.ok) setDeliverable(await delRes.json());
          if (chatRes.ok) {
            const data = await chatRes.json();
            setChatMessages(data.messages ?? []);
          }
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, deliverableId]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleTransition = async (targetStage: string) => {
    setTransitioning(true);
    try {
      const res = await fetchApi(
        `/api/projects/${projectId}/deliverables/${deliverableId}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetStage }),
        },
      );
      if (res.ok) {
        router.push(`/projects/${projectId}`);
      }
    } catch {}
    setTransitioning(false);
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput("");
    setSending(true);

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: tempId, role: "user", content: text, createdAt: new Date().toISOString() }]);

    try {
      const res = await fetchApi(
        `/api/projects/${projectId}/deliverables/${deliverableId}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        // Replace optimistic message with real one, add assistant response
        setChatMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          return [...withoutTemp, data.userMessage, data.assistantMessage];
        });
      }
    } catch {}
    setSending(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-shrink-0" style={{ padding: "10px 24px", borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}>
            <div className="animate-pulse" style={{ width: 220, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.06)" }} />
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", minHeight: 0 }}>
            <div style={{ padding: "28px 44px" }}>
              <div className="animate-pulse" style={{ width: "50%", height: 18, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginBottom: 20 }} />
              <div className="animate-pulse" style={{ width: "100%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.04)", marginBottom: 10 }} />
              <div className="animate-pulse" style={{ width: "90%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.04)", marginBottom: 10 }} />
              <div className="animate-pulse" style={{ width: "70%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.04)", marginBottom: 24 }} />
              <div className="animate-pulse" style={{ width: "40%", height: 14, borderRadius: 4, background: "rgba(255,255,255,0.05)", marginBottom: 16 }} />
              <div className="animate-pulse" style={{ width: "100%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.04)", marginBottom: 10 }} />
              <div className="animate-pulse" style={{ width: "80%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />
            </div>
            <div style={{ borderLeft: "0.5px solid rgba(255,255,255,0.05)", padding: "14px 20px" }}>
              <div className="animate-pulse" style={{ width: 90, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.05)", marginBottom: 24 }} />
              <div className="animate-pulse" style={{ width: "70%", height: 32, borderRadius: 8, background: "rgba(255,255,255,0.03)", marginBottom: 12 }} />
              <div className="animate-pulse" style={{ width: "50%", height: 32, borderRadius: 8, background: "rgba(255,255,255,0.03)", marginLeft: "auto" }} />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!deliverable) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <p style={{ fontSize: 14, color: "var(--fg4)" }}>Deliverable not found</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* ── Top bar ── */}
        <div
          className="flex items-center gap-3 flex-shrink-0"
          style={{
            padding: "10px 24px",
            borderBottom: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Left */}
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="flex items-center gap-1 transition-colors"
            style={{ fontSize: 12, color: "var(--fg3)", flexShrink: 0 }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to project
          </button>

          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>
            {deliverable.title}
          </span>

          <StageBadge stage={deliverable.stage} confidenceLevel={deliverable.confidenceLevel} />

          <div style={{ flex: 1 }} />

          {/* Right: stage action */}
          {deliverable.stage === "intelligence" && (
            <button
              onClick={() => handleTransition("workboard")}
              disabled={transitioning}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 14px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.08)",
                border: "0.5px solid rgba(255,255,255,0.12)",
                color: "var(--foreground)",
                cursor: transitioning ? "wait" : "pointer",
                opacity: transitioning ? 0.5 : 1,
              }}
              className="hover:brightness-125 transition"
            >
              Pull to workboard
            </button>
          )}
          {deliverable.stage === "workboard" && (
            <button
              onClick={() => handleTransition("deliverable")}
              disabled={transitioning}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 14px",
                borderRadius: 6,
                background: "rgba(52,211,153,0.12)",
                border: "0.5px solid rgba(52,211,153,0.25)",
                color: "rgb(52,211,153)",
                cursor: transitioning ? "wait" : "pointer",
                opacity: transitioning ? 0.5 : 1,
              }}
              className="hover:brightness-125 transition"
            >
              Accept deliverable
            </button>
          )}
        </div>

        {/* ── Split layout ── */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            minHeight: 0,
          }}
        >
          {/* Left pane — Report content */}
          <div style={{ overflowY: "auto", borderRight: "0.5px solid rgba(255,255,255,0.05)" }}>
            <div style={{ padding: "28px 44px", maxWidth: 600 }}>
              {deliverable.content ? (
                <ReportContent sections={deliverable.content.sections} />
              ) : (
                <EmptyContent stage={deliverable.stage} />
              )}
            </div>
          </div>

          {/* Right pane — AI assistant */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              background: "rgba(255,255,255,0.01)",
            }}
          >
            {/* Header */}
            <div style={{ padding: "14px 20px 8px", flexShrink: 0 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                AI ASSISTANT
              </span>
            </div>

            {/* Chat thread */}
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: 40 }}>
                  <p style={{ fontSize: 12, color: "var(--fg4)", lineHeight: 1.5 }}>
                    Ask questions about this deliverable,<br />request changes, or explore the analysis.
                  </p>
                </div>
              )}
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "8px 12px",
                      borderRadius: 10,
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--foreground)",
                      ...(msg.role === "user"
                        ? {
                            background: "rgba(255,255,255,0.08)",
                          }
                        : {
                            background: "rgba(255,255,255,0.02)",
                            border: "0.5px solid rgba(255,255,255,0.05)",
                          }),
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Hint pills */}
            <div
              className="flex flex-wrap gap-1.5"
              style={{ padding: "4px 20px 8px", flexShrink: 0 }}
            >
              {["Explain risk factors", "Show evidence chain", "Suggest revisions"].map((hint) => (
                <button
                  key={hint}
                  onClick={() => {
                    setChatInput(hint);
                    inputRef.current?.focus();
                  }}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "rgba(255,255,255,0.04)",
                    border: "0.5px solid rgba(255,255,255,0.07)",
                    color: "var(--fg3)",
                    cursor: "pointer",
                  }}
                  className="hover:brightness-125 transition"
                >
                  {hint}
                </button>
              ))}
            </div>

            {/* Input */}
            <div
              className="flex items-center gap-2"
              style={{
                padding: "10px 20px 14px",
                borderTop: "0.5px solid rgba(255,255,255,0.05)",
                flexShrink: 0,
              }}
            >
              <input
                ref={inputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="Ask about this deliverable..."
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 12,
                  color: "var(--foreground)",
                  outline: "none",
                }}
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || sending}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: chatInput.trim() ? "var(--btn-primary-bg)" : "rgba(255,255,255,0.05)",
                  color: chatInput.trim() ? "var(--btn-primary-text)" : "var(--fg4)",
                  border: "none",
                  cursor: chatInput.trim() ? "pointer" : "default",
                  flexShrink: 0,
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Stage badge ──────────────────────────────────────────────────────────────

function StageBadge({ stage, confidenceLevel }: { stage: string; confidenceLevel: string | null }) {
  if (stage === "intelligence") {
    const dotColor =
      confidenceLevel === "high"
        ? "rgb(52,211,153)"
        : confidenceLevel === "medium"
          ? "rgb(250,204,21)"
          : confidenceLevel === "low"
            ? "rgb(248,113,113)"
            : "rgba(255,255,255,0.2)";
    return (
      <span className="flex items-center gap-1.5" style={{ marginLeft: 4 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: confidenceLevel ? dotColor : "transparent",
            border: confidenceLevel ? "none" : `1.5px solid ${dotColor}`,
          }}
        />
        <span style={{ fontSize: 10, color: "var(--fg4)" }}>
          {confidenceLevel ? `${confidenceLevel} confidence` : "analyzing"}
        </span>
      </span>
    );
  }

  if (stage === "workboard") {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          padding: "2px 7px",
          borderRadius: 4,
          background: "rgba(250,204,21,0.12)",
          color: "rgb(250,204,21)",
          marginLeft: 4,
        }}
      >
        in review
      </span>
    );
  }

  if (stage === "deliverable") {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          padding: "2px 7px",
          borderRadius: 4,
          background: "rgba(52,211,153,0.12)",
          color: "rgb(52,211,153)",
          marginLeft: 4,
        }}
      >
        accepted
      </span>
    );
  }

  return null;
}

// ── Report content renderer ──────────────────────────────────────────────────

function ReportContent({ sections }: { sections: ContentSection[] }) {
  return (
    <div>
      {sections.map((s, i) => {
        switch (s.type) {
          case "heading":
            if (s.level === 2) {
              return (
                <h2
                  key={i}
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    color: "var(--foreground)",
                    borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                    paddingBottom: 10,
                    marginBottom: 20,
                    marginTop: i > 0 ? 32 : 0,
                  }}
                >
                  {s.text}
                </h2>
              );
            }
            return (
              <h3
                key={i}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 24,
                  marginBottom: 10,
                }}
              >
                {s.text}
              </h3>
            );

          case "paragraph":
            return (
              <p
                key={i}
                style={{
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: "rgba(255,255,255,0.65)",
                  marginBottom: 14,
                }}
              >
                {s.text}
              </p>
            );

          case "risk":
            return (
              <div
                key={i}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#facc15",
                  marginBottom: 8,
                  lineHeight: 1.5,
                }}
              >
                {s.text}
              </div>
            );

          case "evidence":
            return (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  fontStyle: "italic",
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                {s.text}
              </div>
            );

          case "completeness_ok":
            return (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  color: "rgb(52,211,153)",
                  marginBottom: 4,
                }}
              >
                ✓ {s.text}
              </div>
            );

          case "completeness_gap":
            return (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  color: "#facc15",
                  marginBottom: 4,
                }}
              >
                ⚠ {s.text}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

// ── Empty content state ──────────────────────────────────────────────────────

function EmptyContent({ stage }: { stage: string }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ marginBottom: 16 }}>
        <svg
          width={32}
          height={32}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1.5}
          style={{ margin: "0 auto" }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--fg3)", marginBottom: 6 }}>
        {stage === "intelligence" ? "Analysis in progress..." : "Queued"}
      </p>
      <p style={{ fontSize: 12, color: "var(--fg4)", lineHeight: 1.5 }}>
        {stage === "intelligence"
          ? "The AI is analyzing data sources and generating findings."
          : "Waiting for data ingestion to complete."}
      </p>
    </div>
  );
}
