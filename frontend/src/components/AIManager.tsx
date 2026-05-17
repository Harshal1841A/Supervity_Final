"use client";

import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Bot, User, Loader2 } from "lucide-react";

// ─── Theme (light) ────────────────────────────────────────────────────────────
const T = {
  bg:         "#FFFFFF",
  card:       "#FAFAFA",
  cardBorder: "#E2E8F0",
  primary:    "#0F172A",
  muted:      "#64748B",
  subtle:     "#F1F5F9",
  hover:      "#F8FAFC",
  btnBg:      "#000000",
  btnText:    "#FFFFFF",
  accent:     "#6366F1",   // indigo — AI accent
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id:      string;
  role:    "user" | "ai";
  text:    string;
  loading?: boolean;
}

// ─── Pre-populated mock history ──────────────────────────────────────────────
const MOCK_HISTORY: ChatMessage[] = [
  { id: "m1", role: "user", text: "Why did Vanguard get blocked on boAt?" },
  {
    id: "m2", role: "ai",
    text: "Reading HubSpot logs… Vanguard was suppressed because boAt's Share of Voice drop (3.7pp) did not meet the >5pp minimum threshold required to trigger a conquest campaign. The Atlas orchestrator routed execution to Lens for continued monitoring instead.",
  },
  { id: "m3", role: "user", text: "Add a policy: never post on Sundays." },
  {
    id: "m4", role: "ai",
    text: "Policy 9 created and saved to HubSpot. Orchestrator updated — Quill-2 will now suppress all scheduled publications on Sundays across all brand accounts. Sentry has been notified to monitor for policy compliance.",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AIManager() {
  const [isOpen,    setIsOpen]    = useState(false);
  const [messages,  setMessages]  = useState<ChatMessage[]>(MOCK_HISTORY);
  const [input,     setInput]     = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  // Build session context from the chat history (last 6 messages)
  const buildContext = () =>
    messages.slice(-6).map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n");

  const sendMessage = async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = { id: `u${Date.now()}`, role: "user", text: query };
    const placeholderId = `ai${Date.now()}`;
    const placeholder:  ChatMessage = { id: placeholderId, role: "ai", text: "", loading: true };

    setMessages(prev => [...prev, userMsg, placeholder]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai-manager/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query, sessionContext: buildContext() }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Read SSE stream and accumulate text
      const reader  = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer    = "";
      let aiText    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          const dataLine = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
          if (!dataLine || dataLine === "[DONE]") continue;
          let evt: Record<string, unknown> = {};
          try { evt = JSON.parse(dataLine); } catch { evt = { message: dataLine }; }
          const chunk = String(evt.output ?? evt.message ?? evt.content ?? "");
          if (chunk) {
            aiText += (aiText ? " " : "") + chunk;
            // Live-update the placeholder
            setMessages(prev => prev.map(m =>
              m.id === placeholderId ? { ...m, text: aiText, loading: true } : m
            ));
          }
        }
      }

      // Finalize
      setMessages(prev => prev.map(m =>
        m.id === placeholderId
          ? { ...m, text: aiText || "Response received.", loading: false }
          : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === placeholderId
          ? { ...m, text: `Error: ${err instanceof Error ? err.message : "Network error"}`, loading: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      {/* ── Floating Action Button ── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        aria-label="Open AI Manager"
        style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 1000,
          width: 52, height: 52, borderRadius: "50%",
          backgroundColor: T.btnBg, color: T.btnText,
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.28)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)";    e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.18)"; }}
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {/* ── Chat Panel (right-side drawer) ── */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 999,
          width: 420,
          backgroundColor: T.bg,
          borderLeft: `1px solid ${T.cardBorder}`,
          boxShadow: "-8px 0 40px rgba(0,0,0,0.08)",
          display: "flex", flexDirection: "column",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px",
          borderBottom: `1px solid ${T.cardBorder}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          backgroundColor: T.bg,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              backgroundColor: T.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bot size={16} color={T.btnText} />
            </div>
            <div>
              <p style={{ color: T.primary, fontWeight: 700, fontSize: 13, margin: 0, letterSpacing: "0.04em" }}>
                NEXUS OS AI Manager
              </p>
              <p style={{ color: T.muted, fontSize: 10, margin: 0, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Always available · HubSpot-aware
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 4, borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget.style.color = T.primary)}
            onMouseLeave={e => (e.currentTarget.style.color = T.muted)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                backgroundColor: msg.role === "user" ? T.primary : T.subtle,
                border: `1px solid ${T.cardBorder}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {msg.role === "user"
                  ? <User size={13} color={T.btnText} />
                  : <Bot  size={13} color={T.primary} />
                }
              </div>
              {/* Bubble */}
              <div style={{
                maxWidth: "76%",
                padding: "10px 14px",
                borderRadius: msg.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                backgroundColor: msg.role === "user" ? T.primary : T.card,
                border: msg.role === "user" ? "none" : `1px solid ${T.cardBorder}`,
                color: msg.role === "user" ? T.btnText : T.primary,
                fontSize: 13, lineHeight: 1.65, fontWeight: 300,
              }}>
                {msg.loading && !msg.text
                  ? <Loader2 size={14} className="animate-spin" style={{ opacity: 0.6 } as React.CSSProperties} />
                  : msg.text
                }
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <div style={{
          padding: "12px 16px",
          borderTop: `1px solid ${T.cardBorder}`,
          backgroundColor: T.bg,
          flexShrink: 0,
          display: "flex", gap: 10, alignItems: "flex-end",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about agents, policies, campaigns…"
            rows={1}
            disabled={isLoading}
            style={{
              flex: 1, resize: "none", border: `1px solid ${T.cardBorder}`,
              borderRadius: 10, padding: "10px 14px",
              fontSize: 13, color: T.primary, backgroundColor: T.card,
              fontFamily: "inherit", outline: "none",
              lineHeight: 1.5,
              maxHeight: 120, overflowY: "auto",
              transition: "border-color 0.15s",
            }}
            onFocus={e  => (e.target.style.borderColor = T.primary)}
            onBlur={e   => (e.target.style.borderColor = T.cardBorder)}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              backgroundColor: input.trim() && !isLoading ? T.btnBg : T.subtle,
              color: input.trim() && !isLoading ? T.btnText : T.muted,
              border: "none", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
          >
            {isLoading
              ? <Loader2 size={15} className="animate-spin" />
              : <Send size={15} />
            }
          </button>
        </div>
      </div>

      {/* Backdrop (mobile / click-outside) */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 998,
            backgroundColor: "rgba(0,0,0,0.12)",
          }}
        />
      )}
    </>
  );
}
