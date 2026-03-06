"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type OrientationMode = {
  sessionId: string;
  phase: string;
} | null;

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orientationMode, setOrientationMode] = useState<OrientationMode>(null);
  const [initializing, setInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoTriggered = useRef(false);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  // Initialize: detect orientation mode + load messages
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/orientation/current");
        if (res.ok) {
          const { session } = await res.json();
          if (session && (session.phase === "orienting" || session.phase === "confirming")) {
            setOrientationMode({ sessionId: session.id, phase: session.phase });

            // Load persisted messages for this orientation session
            const msgRes = await fetch(`/api/copilot/messages?sessionId=${session.id}`);
            if (msgRes.ok) {
              const { messages: dbMessages } = await msgRes.json();
              const loaded: Message[] = dbMessages
                .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
                .map((m: { role: string; content: string }) => ({
                  role: m.role as "user" | "assistant",
                  content: m.content,
                }));
              if (loaded.length > 0) {
                setMessages(loaded);
              }
            }
          }
        }
      } catch {
        // Continue without orientation mode
      }
      setInitializing(false);
    })();
  }, []);

  // Send a message to the copilot API
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

      // Build history for API (all visible messages minus the one we just added)
      const history = (showAsUserMessage ? messages : messages).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      try {
        const res = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
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
            updated[updated.length - 1] = { role: "assistant", content: assistantContent };
            return updated;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
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
    [messages, streaming],
  );

  // Auto-trigger orientation conversation if no messages
  useEffect(() => {
    if (
      !initializing &&
      orientationMode &&
      messages.length === 0 &&
      !streaming &&
      !hasAutoTriggered.current
    ) {
      hasAutoTriggered.current = true;
      sendMessage(
        "Hi, let's get started with the orientation.",
        false, // don't show as user bubble — AI opens the conversation
      );
    }
  }, [initializing, orientationMode, messages.length, streaming, sendMessage]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  }, [input, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isOrientation = !!orientationMode;

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-0px)]">
        {/* Orientation banner */}
        {isOrientation && (
          <div className="px-6 py-2 bg-purple-500/10 border-b border-purple-500/20">
            <div className="max-w-3xl mx-auto flex items-center gap-2 text-xs text-purple-300/70">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              {orientationMode.phase === "orienting"
                ? "Orientation — learning about your business"
                : "Orientation — confirming what I've learned"}
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {initializing ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
            </div>
          ) : messages.length === 0 && !streaming ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <svg
                  className="w-12 h-12 text-white/10 mx-auto mb-4"
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
                <h2 className="text-lg font-medium text-white/60 mb-2">
                  AI Co-pilot
                </h2>
                <p className="text-sm text-white/35">
                  Ask me anything about your business data, entities,
                  relationships, or get help with analysis and insights.
                </p>
              </div>
            </div>
          ) : null}

          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-purple-500/20 text-white/90 border border-purple-500/20"
                      : "bg-white/[0.04] text-white/80 border border-white/[0.06]"
                  }`}
                >
                  {msg.content}
                  {streaming &&
                    i === messages.length - 1 &&
                    msg.role === "assistant" && (
                      <span className="inline-block w-1.5 h-4 bg-purple-400/60 ml-0.5 animate-pulse" />
                    )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-6">
            <div className="max-w-3xl mx-auto text-sm text-red-400 pb-2">
              {error}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-white/[0.06] px-6 py-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isOrientation
                  ? "Tell me about your business..."
                  : "Ask me anything about your business data..."
              }
              rows={1}
              className="flex-1 resize-none px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 text-sm"
              disabled={streaming || initializing}
            />
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={streaming || !input.trim() || initializing}
              className="self-end"
            >
              {streaming ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              )}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
