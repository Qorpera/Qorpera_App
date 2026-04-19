"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useIsMobile } from "@/hooks/use-media-query";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ContextualChatProps {
  contextType: "situation" | "idea" | "system-health" | "system_job" | "system_jobs";
  contextId: string;
  placeholder?: string;
  hints?: string[];
  uncertaintyLevel?: "high" | "medium" | "none";
}

export function ContextualChat({
  contextType,
  contextId,
  placeholder,
  hints,
  uncertaintyLevel = "none",
}: ContextualChatProps) {
  const t = useTranslations("contextualChat");
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [chatFocused, setChatFocused] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Collapse by default on mobile
  useEffect(() => {
    if (isMobile) setExpanded(false);
  }, [isMobile]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Uncertainty nudge bounce
  useEffect(() => {
    if (uncertaintyLevel === "none" || chatFocused) return;
    const interval = uncertaintyLevel === "high" ? 45000 : 75000;
    const timer = setInterval(() => {
      setBouncing(true);
      setTimeout(() => setBouncing(false), 400);
    }, interval);
    return () => clearInterval(timer);
  }, [uncertaintyLevel, chatFocused, contextId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMessage: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMessage]);
    setStreaming(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          sessionId: `${contextType}-${contextId}`,
          contextType,
          contextId,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantContent };
          return updated;
        });
      }
    } catch {
      setMessages(prev => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && prev[prev.length - 1].content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming, contextType, contextId]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!expanded) {
    return (
      <div>
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-3 flex items-center gap-2 text-sm text-accent hover:text-accent transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
          </svg>
          {t("askAboutThis")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Messages area */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="overflow-y-auto px-4 py-3 space-y-3 w-[80%] mx-auto" style={{ maxHeight: 300 }}>
          {messages.map((msg, i) => (
            <div key={i}>
              <div style={{ fontSize: 10, fontWeight: 500, color: msg.role === "user" ? "var(--fg2)" : "var(--accent)", marginBottom: 2 }}>
                {msg.role === "user" ? t("you") : t("qorpera")}
              </div>
              <div style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--muted)",
                whiteSpace: "pre-wrap",
              }}>
                {msg.content}
                {streaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" && (
                  <span className="inline-flex gap-0.5 ml-1">
                    <span className="w-1 h-1 rounded-full bg-accent/60 animate-[pulse_1.4s_ease-in-out_infinite]" />
                    <span className="w-1 h-1 rounded-full bg-accent/60 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                    <span className="w-1 h-1 rounded-full bg-accent/60 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hints */}
      {messages.length === 0 && hints && hints.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5 w-[80%] mx-auto">
          {hints.map((hint, i) => (
            <button
              key={i}
              onClick={() => sendMessage(hint)}
              className="text-[12px] px-3 py-1.5 rounded-full transition-all hover:opacity-80"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--fg3)" }}
            >
              {hint}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-4 pb-[25px] w-[80%] mx-auto">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setChatFocused(true)}
            onBlur={() => setChatFocused(false)}
            placeholder={placeholder || t("defaultPlaceholder")}
            id={`${contextType}-chat-input`}
            rows={1}
            className="w-full outline-none resize-none"
            style={{
              background: chatFocused
                ? "color-mix(in srgb, var(--accent) 5%, var(--elevated))"
                : "var(--elevated)",
              border: chatFocused
                ? "2px solid var(--accent)"
                : "1px solid var(--border)",
              borderRadius: 8,
              padding: chatFocused ? "15px 17px" : "16px 18px",
              paddingRight: chatFocused ? 55 : 56,
              fontSize: 14,
              minHeight: 88,
              lineHeight: 1.5,
              color: "var(--foreground)",
              fontFamily: "inherit",
              maxHeight: 120,
              transform: chatFocused
                ? "translateY(-2px)"
                : bouncing
                  ? undefined
                  : "translateY(0)",
              boxShadow: chatFocused ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
              transition: "all 200ms ease",
              animation: bouncing ? "chatNudge 400ms ease-out" : undefined,
            }}
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="absolute bottom-5 right-4 p-2.5 rounded-md transition-all disabled:cursor-not-allowed"
            style={{
              background: input.trim() ? "var(--btn-primary-bg)" : "var(--badge-bg)",
              color: input.trim() ? "var(--btn-primary-text)" : "var(--fg4)",
            }}
          >
            {streaming ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
