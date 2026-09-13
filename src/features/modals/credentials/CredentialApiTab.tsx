import React, { useState } from "react";
import { CredentialAiProvidersForm } from "./CredentialAiProvidersForm";
import { FileSpreadsheet, MessageSquare, Send, Eye, EyeOff, ShieldCheck } from "lucide-react";

interface CredentialApiTabProps {
  openaiKey: string;
  setOpenaiKey: (k: string) => void;
  deepseekKey: string;
  setDeepseekKey: (k: string) => void;
  geminiKey: string;
  setGeminiKey: (k: string) => void;
  openrouterKey: string;
  setOpenrouterKey: (k: string) => void;
  customAiUrl: string;
  setCustomAiUrl: (u: string) => void;
  customAiKey: string;
  setCustomAiKey: (k: string) => void;
  customAiModel: string;
  setCustomAiModel: (m: string) => void;
  googleJson: string;
  setGoogleJson: (j: string) => void;
  whatsappToken: string;
  setWhatsappToken: (t: string) => void;
  whatsappPhoneId: string;
  setWhatsappPhoneId: (id: string) => void;
  telegramToken: string;
  setTelegramToken: (t: string) => void;
  telegramChatId: string;
  setTelegramChatId: (id: string) => void;
}

export function CredentialApiTab({
  openaiKey,
  setOpenaiKey,
  deepseekKey,
  setDeepseekKey,
  geminiKey,
  setGeminiKey,
  openrouterKey,
  setOpenrouterKey,
  customAiUrl,
  setCustomAiUrl,
  customAiKey,
  setCustomAiKey,
  customAiModel,
  setCustomAiModel,
  googleJson,
  setGoogleJson,
  whatsappToken,
  setWhatsappToken,
  whatsappPhoneId,
  setWhatsappPhoneId,
  telegramToken,
  setTelegramToken,
  telegramChatId,
  setTelegramChatId,
}: CredentialApiTabProps) {
  const [showWpToken, setShowWpToken] = useState(false);
  const [showTgToken, setShowTgToken] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <CredentialAiProvidersForm
        openaiKey={openaiKey}
        setOpenaiKey={setOpenaiKey}
        deepseekKey={deepseekKey}
        setDeepseekKey={setDeepseekKey}
        geminiKey={geminiKey}
        setGeminiKey={setGeminiKey}
        openrouterKey={openrouterKey}
        setOpenrouterKey={setOpenrouterKey}
        customAiUrl={customAiUrl}
        setCustomAiUrl={setCustomAiUrl}
        customAiKey={customAiKey}
        setCustomAiKey={setCustomAiKey}
        customAiModel={customAiModel}
        setCustomAiModel={setCustomAiModel}
      />

      {/* Google Workspace */}
      <div style={{ background: 'var(--s1)', padding: '16px', borderRadius: '14px', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={16} style={{ color: 'var(--mint)' }} />
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Google Workspace (Sheets & Docs)</h4>
          </div>
          <span style={{ fontSize: '10px', background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--muted)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>Google Cloud API</span>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 600 }}>
            Service Account JSON (Credenciales de Cuenta de Servicio)
          </label>
          <textarea
            placeholder='Pega aquí el contenido JSON completo de tu Service Account...'
            value={googleJson}
            onChange={(e) => setGoogleJson(e.target.value)}
            style={{
              minHeight: '84px',
              fontFamily: 'DM Mono, monospace',
              fontSize: '11.5px',
              width: '100%',
              resize: 'vertical',
              background: 'var(--s2)',
              border: '1px solid var(--line)',
              borderRadius: '10px',
              padding: '10px 12px',
              color: 'var(--text)'
            }}
          />
        </div>
      </div>

      {/* WhatsApp Business */}
      <div style={{ background: 'var(--s1)', padding: '16px', borderRadius: '14px', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={16} style={{ color: '#25D366' }} />
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>WhatsApp Business Cloud API</h4>
          </div>
          <span style={{ fontSize: '10px', background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--muted)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>Meta Cloud</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', fontWeight: 600 }}>Token de Acceso Permanente</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showWpToken ? "text" : "password"}
                placeholder="EAAG..."
                value={whatsappToken}
                onChange={(e) => setWhatsappToken(e.target.value)}
                style={{ width: '100%', paddingRight: '36px' }}
              />
              <button
                type="button"
                onClick={() => setShowWpToken(!showWpToken)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer' }}
              >
                {showWpToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', fontWeight: 600 }}>ID de Teléfono API</label>
            <input
              type="text"
              placeholder="1092384729..."
              value={whatsappPhoneId}
              onChange={(e) => setWhatsappPhoneId(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Telegram Bot */}
      <div style={{ background: 'var(--s1)', padding: '16px', borderRadius: '14px', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Send size={16} style={{ color: '#0088cc' }} />
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Telegram Bot API</h4>
          </div>
          <span style={{ fontSize: '10px', background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--muted)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>BotFather</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', fontWeight: 600 }}>Bot Token</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showTgToken ? "text" : "password"}
                placeholder="123456789:ABCdef..."
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                style={{ width: '100%', paddingRight: '36px' }}
              />
              <button
                type="button"
                onClick={() => setShowTgToken(!showTgToken)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer' }}
              >
                {showTgToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', fontWeight: 600 }}>Chat ID por defecto</label>
            <input
              type="text"
              placeholder="Ej. -10012345678"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
