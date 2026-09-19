import React, { useRef, useEffect } from "react";
import { X, Loader2, Sparkles, Send } from "lucide-react";
import { Message } from "../../hooks/useAiAssistant";

export interface AiAssistantDrawerProps {
  aiChatOpen: boolean;
  setAiChatOpen: (open: boolean) => void;
  aiMessages: Message[];
  aiLoading: boolean;
  aiPrompt: string;
  setAiPrompt: (prompt: string) => void;
  sendAiMessage: (e: React.FormEvent) => void;
  botPos?: { right: number; bottom: number };
}

export function AiAssistantDrawer({
  aiChatOpen,
  setAiChatOpen,
  aiMessages,
  aiLoading,
  aiPrompt,
  setAiPrompt,
  sendAiMessage,
}: AiAssistantDrawerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [aiMessages, aiLoading]);

  if (!aiChatOpen) return null;

  return (
    <aside className="flow-side-panel fsp-ai-drawer" aria-label="Asistente de IA">
      {/* Header matching FlowSidePanel (.fsp-head) */}
      <div className="fsp-head">
        <div className="fsp-icon-box" style={{ background: "color-mix(in srgb, var(--purple, #a855f7) 16%, transparent)", color: "#a855f7" }}>
          <Sparkles size={16} />
        </div>
        <div className="fsp-head-text">
          <div className="fsp-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>AI Asistente</span>
            <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
          </div>
          <div className="fsp-sub">Genera y conecta nodos con lenguaje natural</div>
        </div>
        <button
          type="button"
          className="fsp-close"
          onClick={() => setAiChatOpen(false)}
          title="Cerrar asistente"
          aria-label="Cerrar asistente"
        >
          <X size={15} />
        </button>
      </div>

      {/* Messages Log */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "14px",
          background: "var(--bg)",
        }}
      >
        {aiMessages.length === 0 ? (
          <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--muted)", fontSize: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "color-mix(in srgb, #a855f7 15%, transparent)", color: "#a855f7", display: "grid", placeItems: "center" }}>
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>¿Qué deseas automatizar?</div>
              <div style={{ fontSize: "11px", lineHeight: "1.4" }}>Describe tu flujo y crearé los nodos correspondientes.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", marginTop: 8 }}>
              {[
                "Consulta Postgres y envía un webhook",
                "Monitorea archivos y envía email",
                "Disparador al recibir un webhook HTTP",
              ].map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAiPrompt(suggestion)}
                  style={{
                    background: "var(--s1)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: "11px",
                    color: "var(--text)",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--red)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
                >
                  ✨ {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          aiMessages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                flexDirection: "column",
                alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                background: msg.sender === "user" ? "var(--s3)" : "var(--s2)",
                border: "1px solid var(--line)",
                borderRadius: msg.sender === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                padding: "8px 11px",
                fontSize: "12px",
                color: "var(--text)",
              }}
            >
              <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.4" }}>{msg.text}</div>
              <span style={{ fontSize: "9px", color: "var(--dim)", alignSelf: "flex-end", marginTop: "4px" }}>
                {msg.time}
              </span>
            </div>
          ))
        )}
        {aiLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--dim)", fontSize: "11.5px", padding: "4px 8px" }}>
            <Loader2 className="animate-spin" size={13} />
            <span>Generando pasos en el flujo...</span>
          </div>
        )}
      </div>

      {/* Footer Input Form */}
      <form
        onSubmit={sendAiMessage}
        style={{
          display: "flex",
          gap: "6px",
          padding: "10px 12px",
          borderTop: "1px solid var(--line)",
          background: "var(--s2)",
        }}
      >
        <input
          type="text"
          placeholder="Escribe tu instrucción..."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          disabled={aiLoading}
          style={{
            flex: 1,
            background: "var(--s1)",
            color: "var(--text)",
            border: "1px solid var(--line)",
            borderRadius: "8px",
            padding: "0 10px",
            height: "34px",
            fontSize: "12px",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={aiLoading || !aiPrompt.trim()}
          className="primary"
          style={{
            height: "34px",
            minHeight: "34px",
            padding: "0 10px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Send size={13} />
        </button>
      </form>
    </aside>
  );
}
