"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────────────────────────

interface DeliverableDetail {
  id: string;
  slug: string;
  title: string;
  content: string;
  stage: string;
  status: string;
  parentProjectSlug: string;
  parentProjectName: string | null;
  confidenceLevel: string | null;
  riskCount: number;
  assignedToSlug: string | null;
  assignedToName: string | null;
  acceptedBySlug: string | null;
  acceptedByName: string | null;
  acceptedAt: string | null;
  generationMode: string | null;
  createdAt: string;
  updatedAt: string;
  completenessReport: null;
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
  const projectSlug = params.id as string;
  const deliverableSlug = params.deliverableId as string;

  const [deliverable, setDeliverable] = useState<DeliverableDetail | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Chat is disabled for wiki-only deliverables, but we still read any history
  // the legacy endpoint happens to return.
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [delRes, chatRes] = await Promise.all([
          fetchApi(
            `/api/projects/${encodeURIComponent(projectSlug)}/deliverables/${encodeURIComponent(deliverableSlug)}`,
          ),
          fetchApi(
            `/api/projects/${encodeURIComponent(projectSlug)}/deliverables/${encodeURIComponent(deliverableSlug)}/chat`,
          ),
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
    return () => {
      cancelled = true;
    };
  }, [projectSlug, deliverableSlug]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

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
              <div className="animate-pulse" style={{ width: "70%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />
            </div>
            <div style={{ borderLeft: "0.5px solid rgba(255,255,255,0.05)", padding: "14px 20px" }}>
              <div className="animate-pulse" style={{ width: 90, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.05)", marginBottom: 24 }} />
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
          <button
            onClick={() => router.push(`/projects/${encodeURIComponent(projectSlug)}`)}
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
          {/* Left pane — wiki content */}
          <div style={{ overflowY: "auto", borderRight: "0.5px solid rgba(255,255,255,0.05)" }}>
            <div style={{ padding: "28px 44px", maxWidth: 760, margin: "0 auto" }}>
              <WikiMarkdownContent title={deliverable.title} content={deliverable.content} />
            </div>
          </div>

          {/* Right pane — AI assistant (disabled for wiki-only deliverables) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              background: "rgba(255,255,255,0.01)",
            }}
          >
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

            <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: "center", paddingTop: 40 }}>
                  <p style={{ fontSize: 12, color: "var(--fg4)", lineHeight: 1.5 }}>
                    Chat for wiki deliverables is not yet wired up.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => (
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
                          ? { background: "rgba(255,255,255,0.08)" }
                          : {
                              background: "rgba(255,255,255,0.02)",
                              border: "0.5px solid rgba(255,255,255,0.05)",
                            }),
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Disabled input (visually dimmed, non-interactive) */}
            <div
              className="flex items-center gap-2"
              style={{
                padding: "10px 20px 14px",
                borderTop: "0.5px solid rgba(255,255,255,0.05)",
                flexShrink: 0,
                opacity: 0.45,
                pointerEvents: "none",
              }}
            >
              <input
                placeholder="Chat coming soon…"
                disabled
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
                disabled
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--fg4)",
                  border: "none",
                  cursor: "default",
                  flexShrink: 0,
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
          {confidenceLevel ? `${confidenceLevel} confidence` : "intelligence"}
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

// ── Wiki markdown content renderer ───────────────────────────────────────────

function WikiMarkdownContent({ title, content }: { title: string; content: string }) {
  const processed = useMemo(() => {
    // Strip a leading H1 if it matches the page title (same heuristic as the
    // wiki ContentPane, so the title doesn't appear twice).
    const match = content.match(/^#{1,2}\s+(.+)\n/);
    if (match) {
      const headingText = match[1].trim().replace(/\s*\(.*\)\s*$/, "").trim();
      const pageTitle = title.replace(/\s*\(.*\)\s*$/, "").trim();
      if (
        headingText.toLowerCase() === pageTitle.toLowerCase() ||
        pageTitle.toLowerCase().startsWith(headingText.toLowerCase())
      ) {
        return content.slice(match[0].length);
      }
    }
    return content;
  }, [content, title]);

  return (
    <div
      className="wiki-content"
      style={{
        fontSize: 14,
        lineHeight: 1.7,
        color: "var(--foreground)",
      }}
    >
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ marginBottom: 12 }}>{children}</p>,
          h1: ({ children }) => (
            <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--foreground)" }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 10, color: "var(--foreground)" }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8, color: "var(--foreground)" }}>
              {children}
            </h3>
          ),
          ul: ({ children }) => <ul style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4, color: "var(--fg2)" }}>{children}</li>,
          strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--foreground)" }}>{children}</strong>,
          em: ({ children }) => <em style={{ color: "var(--fg2)" }}>{children}</em>,
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />,
          code: ({ children }) => (
            <code style={{ padding: "2px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", fontSize: 12, fontFamily: "monospace" }}>
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote style={{ borderLeft: "2px solid var(--border)", paddingLeft: 14, color: "var(--fg3)", margin: "12px 0" }}>
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0", fontSize: 12 }}>
              {children}
            </table>
          ),
          th: ({ children }) => (
            <th style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid var(--border)", color: "var(--fg3)", fontWeight: 600 }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a href={href} style={{ color: "var(--accent)" }}>
              {children}
            </a>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
