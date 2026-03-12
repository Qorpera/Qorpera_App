"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { AppShell } from "@/components/app-shell";

// ── Types ────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

type OrientationMode = {
  sessionId: string;
  phase: string;
} | null;

interface SessionEntry {
  sessionId: string;
  preview: string;
  createdAt: string;
}

// ── Thinking indicator ──────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="mb-6">
      <div className="text-xs font-medium mb-1.5 text-purple-300/70">Qorpera</div>
      <div className="flex items-center gap-1 h-5">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-[pulse_1.4s_ease-in-out_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
      </div>
    </div>
  );
}

// ── Typewriter assistant content ────────────────────────

function AssistantContent({
  content,
  isStreaming,
  onRevealStep,
}: {
  content: string;
  isStreaming: boolean;
  onRevealStep?: () => void;
}) {
  const [revealedLen, setRevealedLen] = useState(isStreaming ? 0 : Infinity);
  const revealedRef = useRef(isStreaming ? 0 : Infinity);
  const contentRef = useRef(content);
  const rafRef = useRef(0);
  const onRevealRef = useRef(onRevealStep);

  contentRef.current = content;
  onRevealRef.current = onRevealStep;

  useEffect(() => {
    if (!isStreaming) {
      cancelAnimationFrame(rafRef.current);
      revealedRef.current = Infinity;
      setRevealedLen(Infinity);
      return;
    }

    revealedRef.current = 0;
    setRevealedLen(0);

    const tick = () => {
      const target = contentRef.current.length;
      const current = revealedRef.current;
      if (current < target) {
        const step = Math.min(40, target - current);
        revealedRef.current += step;
        setRevealedLen(revealedRef.current);
        onRevealRef.current?.();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isStreaming]);

  const visibleText = content.slice(0, revealedLen);

  return (
    <>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-lg font-semibold text-white/90 mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-white/90 mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-white/90 mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-medium text-white/90">{children}</strong>,
          em: ({ children }) => <em className="text-white/70">{children}</em>,
          a: ({ href, children }) => <a href={href} className="text-purple-300 hover:text-purple-200 underline underline-offset-2">{children}</a>,
          ul: ({ children }) => <ul className="list-disc marker:text-white/40 ml-5 mt-2 mb-3 space-y-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal marker:text-white/40 ml-5 mt-2 mb-3 space-y-1.5">{children}</ol>,
          li: ({ children }) => <li className="text-white/70 pl-1">{children}</li>,
          code: ({ className, children }) => {
            if (className?.includes("language-")) {
              return <code className="font-mono text-[13px] text-white/80">{children}</code>;
            }
            return <code className="font-mono text-[13px] bg-white/[0.06] px-1.5 py-0.5 rounded text-purple-200/90">{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="my-3 rounded-lg bg-white/[0.04] border border-white/[0.06] px-4 py-3 overflow-x-auto text-[13px] leading-relaxed">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-purple-500/30 pl-3 my-2 text-white/60">{children}</blockquote>
          ),
          hr: () => <hr className="border-white/[0.08] my-4" />,
        }}
      >
        {visibleText}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-purple-400/50 ml-0.5 animate-pulse align-middle" />
      )}
    </>
  );
}

// ── Main component ──────────────────────────────────────

export default function CopilotPage() {
  // Core chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  // Orientation state
  const [orientationMode, setOrientationMode] = useState<OrientationMode>(null);
  const [completingOrientation, setCompletingOrientation] = useState(false);

  // Sessions sidebar state
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("default");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoTriggered = useRef(false);
  const isNearBottomRef = useRef(true);

  // ── Scroll tracking ─────────────────────────────────────
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ── Auto-scroll on new messages ──────────────────────────
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ── Scroll callback for typewriter reveal ────────────────
  const handleRevealStep = useCallback(() => {
    if (isNearBottomRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, []);

  // ── Auto-focus input ───────────────────────────────────
  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  // ── Auto-resize textarea ───────────────────────────────
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    },
    [],
  );

  // ── Fetch sessions list ────────────────────────────────
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/copilot/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch {
      // Ignore session fetch errors
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  // ── Load messages for a given sessionId ────────────────
  const loadSessionMessages = useCallback(
    async (sessionId: string) => {
      setInitializing(true);
      setMessages([]);
      setHasMoreMessages(false);
      setActiveSessionId(sessionId);
      try {
        const res = await fetch(
          `/api/copilot/messages?sessionId=${encodeURIComponent(sessionId)}&limit=50`,
        );
        if (res.ok) {
          const { messages: dbMessages, hasMore: more } = await res.json();
          const loaded: Message[] = dbMessages
            .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
            .map((m: { role: string; content: string; createdAt: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              createdAt: m.createdAt,
            }));
          setMessages(loaded);
          setHasMoreMessages(more ?? false);
        }
      } catch {
        // Ignore
      } finally {
        setInitializing(false);
      }
    },
    [],
  );

  // ── Initialize: detect orientation + load messages ─────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/orientation/current");
        if (res.ok) {
          const { session } = await res.json();
          if (session && session.phase === "orienting") {
            setOrientationMode({ sessionId: session.id, phase: session.phase });
            setActiveSessionId(session.id);

            const msgRes = await fetch(
              `/api/copilot/messages?sessionId=${session.id}&limit=50`,
            );
            if (msgRes.ok) {
              const { messages: dbMessages, hasMore: more } = await msgRes.json();
              const loaded: Message[] = dbMessages
                .filter(
                  (m: { role: string }) => m.role === "user" || m.role === "assistant",
                )
                .map(
                  (m: { role: string; content: string; createdAt: string }) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                    createdAt: m.createdAt,
                  }),
                );
              if (loaded.length > 0) setMessages(loaded);
              setHasMoreMessages(more ?? false);
            }
            setInitializing(false);
            fetchSessions();
            return;
          }
        }
      } catch {
        // Continue without orientation mode
      }

      // No orientation — load default session messages
      try {
        const msgRes = await fetch(
          `/api/copilot/messages?sessionId=default&limit=50`,
        );
        if (msgRes.ok) {
          const { messages: dbMessages, hasMore: more } = await msgRes.json();
          const loaded: Message[] = dbMessages
            .filter(
              (m: { role: string }) => m.role === "user" || m.role === "assistant",
            )
            .map(
              (m: { role: string; content: string; createdAt: string }) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
                createdAt: m.createdAt,
              }),
            );
          if (loaded.length > 0) setMessages(loaded);
          setHasMoreMessages(more ?? false);
        }
      } catch {
        // Ignore
      }

      setInitializing(false);
      fetchSessions();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message to copilot API ────────────────────────
  const sendMessage = useCallback(
    async (text: string, showAsUserMessage = true) => {
      if (!text.trim() || streaming) return;

      setError(null);

      const userMessage: Message = { role: "user", content: text };
      const newMessages = showAsUserMessage
        ? [...messages, userMessage]
        : [...messages];

      if (showAsUserMessage) {
        setMessages(newMessages);
      }
      setStreaming(true);

      const history = (showAsUserMessage ? messages : messages).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      try {
        const res = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history, sessionId: activeSessionId }),
        });

        if (!res.ok) {
          const errData = await res
            .json()
            .catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";

        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantContent,
            };
            return updated;
          });
        }

        // Refresh sessions list after a message exchange
        fetchSessions();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to send message",
        );
        setMessages((prev) => {
          if (
            prev.length > 0 &&
            prev[prev.length - 1].role === "assistant" &&
            prev[prev.length - 1].content === ""
          ) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setStreaming(false);
      }
    },
    [messages, streaming, activeSessionId, fetchSessions],
  );

  // ── Auto-trigger orientation ───────────────────────────
  useEffect(() => {
    if (
      !initializing &&
      orientationMode &&
      messages.length === 0 &&
      !streaming &&
      !hasAutoTriggered.current
    ) {
      hasAutoTriggered.current = true;
      sendMessage("Hi, let's get started with the orientation.", false);
    }
  }, [initializing, orientationMode, messages.length, streaming, sendMessage]);

  // ── Handle send ────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    sendMessage(text);
  }, [input, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Complete orientation ───────────────────────────────
  const handleCompleteOrientation = useCallback(async () => {
    setCompletingOrientation(true);
    try {
      const res = await fetch("/api/orientation/complete", { method: "POST" });
      if (res.ok) {
        setOrientationMode(null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Orientation complete \u2014 I'm now watching your data. You'll see situations appear as I detect them. For the first while, I'll always ask before taking action.",
          },
        ]);
      }
    } catch {
      // Ignore
    } finally {
      setCompletingOrientation(false);
    }
  }, []);

  // ── Load earlier messages ──────────────────────────────
  const handleLoadEarlier = useCallback(async () => {
    if (!hasMoreMessages || loadingEarlier) return;
    setLoadingEarlier(true);
    const oldest = messages.find((m) => m.createdAt);
    const before = oldest?.createdAt ?? new Date().toISOString();
    const sessionId = orientationMode?.sessionId ?? activeSessionId;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    try {
      const res = await fetch(
        `/api/copilot/messages?sessionId=${encodeURIComponent(sessionId)}&limit=50&before=${encodeURIComponent(before)}`,
      );
      if (res.ok) {
        const { messages: older, hasMore: more } = await res.json();
        const loaded: Message[] = older
          .filter(
            (m: { role: string }) => m.role === "user" || m.role === "assistant",
          )
          .map(
            (m: { role: string; content: string; createdAt: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              createdAt: m.createdAt,
            }),
          );
        if (loaded.length > 0) {
          setMessages((prev) => [...loaded, ...prev]);
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight - prevScrollHeight;
            }
          });
        }
        setHasMoreMessages(more ?? false);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingEarlier(false);
    }
  }, [hasMoreMessages, loadingEarlier, messages, orientationMode, activeSessionId]);

  // ── New conversation ───────────────────────────────────
  const handleNewConversation = useCallback(() => {
    const newId = `chat-${Date.now()}`;
    setActiveSessionId(newId);
    setMessages([]);
    setHasMoreMessages(false);
    setError(null);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }
  }, []);

  // ── Switch to a session ────────────────────────────────
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      loadSessionMessages(sessionId);
    },
    [activeSessionId, loadSessionMessages],
  );

  const isOrientation = !!orientationMode;

  // ── Render ─────────────────────────────────────────────

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-0px)]">
        {/* ── Sessions sidebar ─────────────────────────── */}
        {sidebarOpen && (
          <div className="w-60 flex-shrink-0 border-r border-white/[0.06] bg-[rgba(8,12,16,0.6)] flex flex-col">
            {/* Sidebar header */}
            <div className="px-3 pt-4 pb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
                History
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
                title="Close sidebar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            </div>

            {/* New conversation button */}
            <div className="px-3 pb-2">
              <button
                onClick={handleNewConversation}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white/90 hover:bg-white/[0.06] border border-white/[0.08] border-dashed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New conversation
              </button>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {loadingSessions && sessions.length === 0 ? (
                <div className="flex justify-center py-6">
                  <div className="w-4 h-4 rounded-full border-2 border-purple-500/30 border-t-purple-400 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-white/20 text-center py-6">
                  No conversations yet
                </p>
              ) : (
                sessions.map((s) => {
                  const isActive = s.sessionId === activeSessionId;
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => handleSelectSession(s.sessionId)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-colors ${
                        isActive
                          ? "bg-purple-500/10 text-white/80"
                          : "text-white/50 hover:bg-white/[0.04] hover:text-white/70"
                      }`}
                    >
                      <div className="text-xs truncate leading-snug">
                        {s.preview}
                      </div>
                      <div className="text-[10px] text-white/25 mt-1">
                        {new Date(s.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Main chat area ───────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
                title="Show history"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
            )}
            <h1 className="text-sm font-medium text-white/50">
              Co-pilot
            </h1>
          </div>

          {/* Orientation banner */}
          {isOrientation && (
            <div className="px-6 py-2 bg-purple-500/10 border-b border-purple-500/20">
              <div className="max-w-[720px] mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-purple-300/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  Orientation — learning about your business
                </div>
                <button
                  onClick={handleCompleteOrientation}
                  disabled={completingOrientation || streaming}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 hover:text-purple-200 transition-colors disabled:opacity-50"
                >
                  {completingOrientation
                    ? "Completing..."
                    : "Complete orientation \u2192"}
                </button>
              </div>
            </div>
          )}

          {/* Messages area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto"
          >
            {initializing ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
              </div>
            ) : messages.length === 0 && !streaming ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md px-6">
                  <svg
                    className="w-10 h-10 text-white/[0.07] mx-auto mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                    />
                  </svg>
                  <h2 className="text-base font-medium text-white/40 mb-2">
                    AI Co-pilot
                  </h2>
                  <p className="text-sm text-white/25 leading-relaxed">
                    Ask me anything about your business data, entities,
                    relationships, or get help with analysis and insights.
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-w-[720px] mx-auto px-6 py-6">
                {/* Load earlier */}
                {hasMoreMessages && (
                  <div className="flex justify-center pb-4">
                    <button
                      onClick={handleLoadEarlier}
                      disabled={loadingEarlier}
                      className="text-xs text-purple-400/70 hover:text-purple-300 transition-colors disabled:opacity-50"
                    >
                      {loadingEarlier ? (
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400/30 border-t-purple-400" />
                          Loading...
                        </span>
                      ) : (
                        "Load earlier messages"
                      )}
                    </button>
                  </div>
                )}

                {/* Messages */}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`mb-6 ${
                      msg.role === "user"
                        ? "border-l-2 border-purple-500/20 pl-4"
                        : ""
                    }`}
                  >
                    {/* Label */}
                    <div
                      className={`text-xs font-medium mb-1.5 ${
                        msg.role === "user"
                          ? "text-white/40"
                          : "text-purple-300/70"
                      }`}
                    >
                      {msg.role === "user" ? "You" : "Qorpera"}
                    </div>

                    {/* Content */}
                    {msg.role === "assistant" ? (
                      <div className="text-sm leading-[1.7] text-white/80" style={{ wordBreak: "break-word" }}>
                        <AssistantContent
                          content={msg.content}
                          isStreaming={streaming && i === messages.length - 1}
                          onRevealStep={handleRevealStep}
                        />
                      </div>
                    ) : (
                      <div
                        className="text-sm leading-[1.7] text-white/60"
                        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                      >
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))}

                {/* Thinking indicator — shown after user message while waiting for response */}
                {streaming && (messages.length === 0 || messages[messages.length - 1].role === "user") && (
                  <ThinkingIndicator />
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-6">
              <div className="max-w-[720px] mx-auto text-sm text-red-400/80 pb-2">
                {error}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-white/[0.06] px-6 py-4 bg-[rgba(8,12,16,0.4)]">
            <div className="max-w-[720px] mx-auto flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  isOrientation
                    ? "Tell me about your business..."
                    : "Ask anything..."
                }
                rows={1}
                className="flex-1 resize-none px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 placeholder:text-white/25 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/15 text-sm leading-relaxed"
                style={{ maxHeight: 200 }}
                disabled={streaming || initializing}
              />
              <button
                onClick={handleSend}
                disabled={streaming || !input.trim() || initializing}
                className="flex-shrink-0 p-3 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 hover:text-purple-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {streaming ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300" />
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
