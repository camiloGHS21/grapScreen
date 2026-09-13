import React, { useState, useEffect } from "react";
import { Backdrop } from "../../components/Backdrop";
import { Settings, Cpu, Sliders, X } from "lucide-react";
import { CredentialGeneralTab } from "./credentials/CredentialGeneralTab";
import { CredentialApiTab } from "./credentials/CredentialApiTab";

interface CredentialsModalProps {
  aiSettingsOpen: boolean;
  setAiSettingsOpen: (open: boolean) => void;
  aiProvider: string;
  setAiProvider: (p: string) => void;
  openaiKey: string;
  setOpenaiKey: (k: string) => void;
  deepseekKey: string;
  setDeepseekKey: (k: string) => void;
  geminiKey?: string;
  setGeminiKey?: (k: string) => void;
  openrouterKey?: string;
  setOpenrouterKey?: (k: string) => void;
  customAiUrl?: string;
  setCustomAiUrl?: (u: string) => void;
  customAiKey?: string;
  setCustomAiKey?: (k: string) => void;
  customAiModel?: string;
  setCustomAiModel?: (m: string) => void;
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
  handleSaveCredentials: (onSuccess: () => void) => void;
  initialTab?: "general" | "api";
}

export function CredentialsModal({
  aiSettingsOpen,
  setAiSettingsOpen,
  aiProvider,
  setAiProvider,
  openaiKey,
  setOpenaiKey,
  deepseekKey,
  setDeepseekKey,
  geminiKey = "",
  setGeminiKey = () => {},
  openrouterKey = "",
  setOpenrouterKey = () => {},
  customAiUrl = "http://localhost:11434/v1",
  setCustomAiUrl = () => {},
  customAiKey = "",
  setCustomAiKey = () => {},
  customAiModel = "llama3",
  setCustomAiModel = () => {},
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
  handleSaveCredentials,
  initialTab = "general"
}: CredentialsModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "api">(initialTab);
  const [theme, setTheme] = useState(() => localStorage.getItem("grap_theme") || "dark");
  const [language, setLanguage] = useState(() => localStorage.getItem("grap_lang") || "es");
  const [bgModeDefault, setBgModeDefault] = useState(true);
  const [videoNotify, setVideoNotify] = useState(true);

  useEffect(() => {
    if (aiSettingsOpen) {
      setActiveTab(initialTab);
    }
  }, [aiSettingsOpen, initialTab]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  if (!aiSettingsOpen) return null;

  const applyTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("grap_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const applyLanguage = (newLang: string) => {
    setLanguage(newLang);
    localStorage.setItem("grap_lang", newLang);
  };

  return (
    <Backdrop>
      <div className="modal" style={{ width: '640px', padding: '24px', maxWidth: '92vw', borderRadius: '20px', boxShadow: '0 24px 64px rgba(0, 0, 0, 0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Settings size={16} style={{ color: 'var(--red)' }} />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--dim)', fontFamily: 'DM Mono, monospace' }}>CONFIGURACIÓN DEL SISTEMA</span>
              <span style={{ fontSize: '9.5px', background: 'color-mix(in srgb, var(--mint) 12%, transparent)', color: 'var(--mint)', padding: '1px 7px', borderRadius: '4px', fontWeight: 700, border: '1px solid color-mix(in srgb, var(--mint) 25%, transparent)' }}>DPAPI Encriptado</span>
            </div>
            <h2 style={{ fontSize: '20px', margin: 0, fontWeight: 800, color: 'var(--text)' }}>Ajustes y Preferencias</h2>
          </div>
          <button
            type="button"
            onClick={() => setAiSettingsOpen(false)}
            style={{ background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modern Segmented Tab Switcher */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--s2)', padding: '4px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--line)' }}>
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === "general" ? 'var(--s1)' : 'transparent',
              color: activeTab === "general" ? 'var(--text)' : 'var(--muted)',
              fontWeight: activeTab === "general" ? 700 : 500,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: activeTab === "general" ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Sliders size={15} style={{ color: activeTab === "general" ? 'var(--red)' : 'currentColor' }} />
            <span>General y Apariencia</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("api")}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === "api" ? 'var(--s1)' : 'transparent',
              color: activeTab === "api" ? 'var(--text)' : 'var(--muted)',
              fontWeight: activeTab === "api" ? 700 : 500,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: activeTab === "api" ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Cpu size={15} style={{ color: activeTab === "api" ? 'var(--mint)' : 'currentColor' }} />
            <span>IA e Integraciones API</span>
          </button>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
          {activeTab === "general" && (
            <CredentialGeneralTab
              theme={theme}
              applyTheme={applyTheme}
              language={language}
              applyLanguage={applyLanguage}
              bgModeDefault={bgModeDefault}
              setBgModeDefault={setBgModeDefault}
              videoNotify={videoNotify}
              setVideoNotify={setVideoNotify}
            />
          )}

          {activeTab === "api" && (
            <CredentialApiTab
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
              googleJson={googleJson}
              setGoogleJson={setGoogleJson}
              whatsappToken={whatsappToken}
              setWhatsappToken={setWhatsappToken}
              whatsappPhoneId={whatsappPhoneId}
              setWhatsappPhoneId={setWhatsappPhoneId}
              telegramToken={telegramToken}
              setTelegramToken={setTelegramToken}
              telegramChatId={telegramChatId}
              setTelegramChatId={setTelegramChatId}
            />
          )}
        </div>

        <div className="actions" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="quiet"
            onClick={() => setAiSettingsOpen(false)}
            style={{
              padding: '0 16px',
              height: '40px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '10px',
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--muted)',
              transition: 'all 0.15s ease'
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="save"
            onClick={() => handleSaveCredentials(() => setAiSettingsOpen(false))}
            style={{
              background: 'var(--red)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '0 22px',
              height: '40px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px color-mix(in srgb, var(--red) 30%, transparent)',
              transition: 'transform 0.15s ease, background 0.15s ease'
            }}
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </Backdrop>
  );
}
