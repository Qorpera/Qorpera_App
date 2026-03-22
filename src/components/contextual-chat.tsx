"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useIsMobile } from "@/hooks/use-media-query";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ContextualChatProps {
  contextType: "situation" | "initiative" | "workstream";
  contextId: string;
  placeholder?: string;
  hints?: string[];
}

export function ContextualChat({
  contextType,
  contextId,
  placeholder,
  hints,
}: ContextualChatProps) {
  const t = useTranslations("contextualChat");
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [expanded, setExpanded] = useState(true);
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
      <div style={{ borderTop: "1px solid #1e1e1e" }}>
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-3 flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
          style={{ background: "#0c0c0c" }}
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
    <div className="flex flex-col" style={{ borderTop: "1px solid #1e1e1e" }}>
      {/* Messages area */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="overflow-y-auto px-4 py-3 space-y-3" style={{ maxHeight: 300 }}>
          {messages.map((msg, i) => (
            <div key={i}>
              <div style={{ fontSize: 10, fontWeight: 500, color: msg.role === "user" ? "#707070" : "#c084fc", marginBottom: 2 }}>
                {msg.role === "user" ? t("you") : t("qorpera")}
              </div>
              <div style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "#b0b0b0",
                whiteSpace: "pre-wrap",
              }}>
                {msg.content}
                {streaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" && (
                  <span className="inline-flex gap-0.5 ml-1">
                    <span className="w-1 h-1 rounded-full bg-purple-400/60 animate-[pulse_1.4s_ease-in-out_infinite]" />
                    <span className="w-1 h-1 rounded-full bg-purple-400/60 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                    <span className="w-1 h-1 rounded-full bg-purple-400/60 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hints */}
      {messages.length === 0 && hints && hints.length > 0 && (
        <div className="px-4 pt-3 flex flex-wrap gap-1.5">
          {hints.map((hint, i) => (
            <button
              key={i}
              onClick={() => sendMessage(hint)}
              className="text-[11px] px-2.5 py-1 rounded-full transition"
              style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)", color: "#c084fc" }}
            >
              {hint}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 flex items-end gap-2" style={{ background: "#0c0c0c" }}>
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
          placeholder={placeholder || t("defaultPlaceholder")}
          rows={1}
          className="flex-1 outline-none resize-none"
          style={{
            background: "#161616",
            border: "1px solid #222",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#e8e8e8",
            fontFamily: "inherit",
            maxHeight: 120,
          }}
        />
        <button
          onClick={handleSend}
          disabled={streaming || !input.trim()}
          className="flex-shrink-0 p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: "rgba(168,85,247,0.15)", color: "#c084fc" }}
        >
          {streaming ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
