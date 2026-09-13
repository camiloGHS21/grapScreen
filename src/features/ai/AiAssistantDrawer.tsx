import React from "react";
import { X, Loader2 } from "lucide-react";
import { Message } from "../../hooks/useAiAssistant";

interface AiAssistantDrawerProps {
  aiChatOpen: boolean;
  setAiChatOpen: (open: boolean) => void;
  botPos: { right: number; bottom: number };
  aiMessages: Message[];
  aiLoading: boolean;
  aiPrompt: string;
  setAiPrompt: (prompt: string) => void;
  sendAiMessage: (e: React.FormEvent) => void;
}

export function AiAssistantDrawer({
  aiChatOpen,
  setAiChatOpen,
  botPos,
  aiMessages,
  aiLoading,
  aiPrompt,
  setAiPrompt,
  sendAiMessage
}: AiAssistantDrawerProps) {
  if (!aiChatOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      right: `${botPos.right}px`,
      bottom: `${botPos.bottom + 54}px`,
      width: '340px',
      height: '400px',
      background: 'var(--s1)',
      backdropFilter: 'blur(16px)',
      border: '1px solid var(--line)',
      borderRadius: '16px',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 16px 48px rgba(0, 0, 0, 0.18)',
      zIndex: 100,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--s2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--mint)', boxShadow: '0 0 8px var(--mint)' }}></span>
          <h4 style={{ margin: 0, fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>AI Asistente</h4>
        </div>
        <button
          type="button"
          onClick={() => setAiChatOpen(false)}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            transition: 'background 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--s3)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages Log */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        background: 'var(--bg)'
      }}>
        {aiMessages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex',
            flexDirection: 'column',
            alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: msg.sender === 'user' ? 'var(--s3)' : 'var(--s2)',
            border: '1px solid var(--line)',
            borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
            padding: '6px 10px',
            fontSize: '12px',
            color: 'var(--text)'
          }}>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.35' }}>{msg.text}</div>
            <span style={{ fontSize: '9px', color: 'var(--dim)', alignSelf: 'flex-end', marginTop: '4px' }}>{msg.time}</span>
          </div>
        ))}
        {aiLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--dim)', fontSize: '11px', padding: '2px' }}>
            <Loader2 className="animate-spin" size={12} />
            <span>Generando pasos en el flujo...</span>
          </div>
        )}
      </div>

      {/* Footer Input Form */}
      <form onSubmit={sendAiMessage} style={{ display: 'flex', gap: '6px', padding: '10px 12px', borderTop: '1px solid var(--line)', background: 'var(--s2)' }}>
        <input
          type="text"
          placeholder="Describe qué deseas automatizar..."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          disabled={aiLoading}
          style={{
            flex: 1,
            background: 'var(--s2)',
            color: 'var(--text)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '0 10px',
            height: '34px',
            fontSize: '12px',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={aiLoading || !aiPrompt.trim()}
          className="primary"
          style={{
            height: '34px',
            minHeight: '34px',
            padding: '0 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
