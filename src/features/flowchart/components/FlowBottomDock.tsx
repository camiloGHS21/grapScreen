import React, { useEffect, useRef, useState } from "react";
import { Trash2, History, ChevronDown, ChevronUp, Terminal, MessageSquare, Send, Sparkles } from "lucide-react";
import { LogEntry } from "./FlowLogsPanel";

export interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  time: string;
}

interface FlowBottomDockProps {
  entries: LogEntry[];
  onClearLogs: () => void;
  onOpenHistory?: () => void;
  executing?: boolean;
  hasChatTrigger?: boolean;
  onSendChatMessage?: (message: string) => Promise<string | null>;
}

const LEVEL_LABEL: Record<LogEntry["level"], string> = {
  info: "INFO",
  success: "SUCCESS",
  error: "ERROR",
  warning: "WARN",
};

export function FlowBottomDock({
  entries,
  onClearLogs,
  onOpenHistory,
  executing,
  hasChatTrigger = false,
  onSendChatMessage,
}: FlowBottomDockProps) {
  const [activeTab, setActiveTab] = useState<"logs" | "chat">(hasChatTrigger ? "chat" : "logs");
  const [collapsed, setCollapsed] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [chatSending, setChatSending] = useState(false);

  const logsBodyRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasChatTrigger) {
      setActiveTab("chat");
    }
  }, [hasChatTrigger]);

  useEffect(() => {
    if (!collapsed && activeTab === "logs" && logsBodyRef.current) {
      logsBodyRef.current.scrollTop = logsBodyRef.current.scrollHeight;
    }
  }, [entries, collapsed, activeTab]);

  useEffect(() => {
    if (!collapsed && activeTab === "chat" && chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [chatMessages, collapsed, activeTab, chatSending]);

  const handleSend = async () => {
    const text = inputVal.trim();
    if (!text || chatSending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputVal("");
    setChatSending(true);

    try {
      let replyText = "Respuesta recibida del flujo.";
      if (onSendChatMessage) {
        const res = await onSendChatMessage(text);
        if (res) replyText = res;
      }

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: "bot",
        text: replyText,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        sender: "bot",
        text: `Error al ejecutar: ${String(err)}`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setChatSending(false);
    }
  };

  return (
    <div className={"flow-logs flow-bottom-dock" + (collapsed ? " collapsed" : "")}>
      <div className="flogs-head">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            className={`flogs-tab-btn ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => {
              if (collapsed) setCollapsed(false);
              setActiveTab("logs");
            }}
          >
            <Terminal size={13} />
            <span>Registros</span>
            {entries.length > 0 && <span className="flogs-badge">{entries.length}</span>}
          </button>

          {hasChatTrigger && (
            <button
              type="button"
              className={`flogs-tab-btn chat-tab ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => {
                if (collapsed) setCollapsed(false);
                setActiveTab("chat");
              }}
            >
              <MessageSquare size={13} />
              <span>Chat de Prueba</span>
              <span className="flogs-pulse-dot" />
            </button>
          )}

          <button
            type="button"
            className="flogs-toggle-chevron"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expandir panel" : "Minimizar panel"}
          >
            {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        <div className="flogs-actions">
          {executing && <span className="flogs-live">en vivo</span>}
          {activeTab === "logs" ? (
            <>
              <button type="button" onClick={onOpenHistory} title="Ejecución anterior">
                <History size={12} /> Historial
              </button>
              <button type="button" onClick={onClearLogs} title="Limpiar registros" disabled={entries.length === 0}>
                <Trash2 size={12} /> Limpiar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setChatMessages([])}
              title="Limpiar chat"
              disabled={chatMessages.length === 0}
            >
              <Trash2 size={12} /> Limpiar Chat
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {activeTab === "logs" ? (
            <div className="flogs-body" ref={logsBodyRef}>
              {entries.length === 0 ? (
                <div className="flogs-empty">
                  <Terminal size={18} />
                  <p>Aún no hay nada que mostrar. Ejecuta el flujo para ver los registros.</p>
                </div>
              ) : (
                entries.map((e) => (
                  <div key={e.id} className={"flog-row flog-" + e.level}>
                    <span className="flog-time">{e.time}</span>
                    <span className={"flog-level flog-level-" + e.level}>{LEVEL_LABEL[e.level]}</span>
                    <span className="flog-msg">{e.message}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flow-chat-panel">
              <div className="flow-chat-messages" ref={chatBodyRef}>
                {chatMessages.length === 0 ? (
                  <div className="flow-chat-empty">
                    <Sparkles size={24} style={{ color: "var(--accent, #ff6d5a)", marginBottom: "8px" }} />
                    <p style={{ fontWeight: 600, fontSize: "13px", color: "var(--fg)" }}>Chat con el Flujo de Trabajo</p>
                    <p style={{ fontSize: "12px", color: "var(--dim)", maxWidth: "340px", margin: "4px auto 0" }}>
                      Escribe un mensaje para activar el disparador Chat e interactuar con el agente en tiempo real.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((m) => (
                    <div key={m.id} className={`flow-chat-bubble-wrap ${m.sender}`}>
                      <div className={`flow-chat-bubble ${m.sender}`}>
                        <div className="chat-bubble-text">{m.text}</div>
                        <div className="chat-bubble-time">{m.time}</div>
                      </div>
                    </div>
                  ))
                )}
                {chatSending && (
                  <div className="flow-chat-bubble-wrap bot">
                    <div className="flow-chat-bubble bot thinking">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                )}
              </div>

              <form
                className="flow-chat-footer"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
              >
                <input
                  type="text"
                  className="flow-chat-input"
                  placeholder="Escribe tu mensaje y pulsa Enter…"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  disabled={chatSending}
                />
                <button type="submit" className="flow-chat-send-btn" disabled={!inputVal.trim() || chatSending}>
                  <Send size={13} />
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FlowBottomDock;
