import React, { useState } from "react";
import { Sparkles, Key, Server, Globe, Eye, EyeOff, Check } from "lucide-react";

interface CredentialAiProvidersFormProps {
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
}

const PROVIDERS = [
  { id: "gemini", label: "🧠 Google Gemini", hint: "Obtén tu API key en Google AI Studio → Gemini 3.6 / 3.5 / 3.1 Pro.", placeholder: "AIzaSy..." },
  { id: "openai", label: "🤖 OpenAI", hint: "GPT-5.6 Sol, Terra, Luna — agentes e interpretación de pantallas.", placeholder: "sk-proj-..." },
  { id: "deepseek", label: "🐋 DeepSeek", hint: "DeepSeek V4 Pro / V4 Flash — código y razonamiento ultrarrápido.", placeholder: "sk-..." },
  { id: "openrouter", label: "⚡ OpenRouter", hint: "Claude Opus 5, Sonnet 5, Fable 5 y más vía OpenRouter.", placeholder: "sk-or-v1-..." },
  { id: "ollama", label: "🏠 Ollama / IA Local", hint: "Ejecuta modelos localmente. No requiere API key.", placeholder: "" },
  { id: "custom", label: "⚙️ API Personalizada", hint: "Endpoint compatible con OpenAI.", placeholder: "" },
];

export function CredentialAiProvidersForm({
  openaiKey, setOpenaiKey,
  deepseekKey, setDeepseekKey,
  geminiKey, setGeminiKey,
  openrouterKey, setOpenrouterKey,
  customAiUrl, setCustomAiUrl,
  customAiKey, setCustomAiKey,
  customAiModel, setCustomAiModel,
}: CredentialAiProvidersFormProps) {
  const [selectedProvider, setSelectedProvider] = useState("gemini");
  const [showKey, setShowKey] = useState(false);

  const current = PROVIDERS.find((p) => p.id === selectedProvider) ?? PROVIDERS[0];

  const keyMap: Record<string, { value: string; set: (v: string) => void }> = {
    gemini: { value: geminiKey, set: setGeminiKey },
    openai: { value: openaiKey, set: setOpenaiKey },
    deepseek: { value: deepseekKey, set: setDeepseekKey },
    openrouter: { value: openrouterKey, set: setOpenrouterKey },
  };

  const hasKey = (id: string) => {
    if (id === "ollama") return Boolean(customAiUrl?.trim());
    if (id === "custom") return Boolean(customAiKey?.trim());
    return Boolean(keyMap[id]?.value?.trim());
  };

  const isSimpleKey = selectedProvider === "gemini" || selectedProvider === "openai"
    || selectedProvider === "deepseek" || selectedProvider === "openrouter";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderBottom: '1px solid var(--line)', paddingBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Sparkles size={16} style={{ color: 'var(--mint)' }} />
        <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--mint)', margin: 0 }}>
          Proveedores de IA
        </h4>
      </div>

      {/* Provider selector */}
      <div>
        <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', fontWeight: 600 }}>
          Selecciona un proveedor para configurar su API Key
        </label>
        <select
          value={selectedProvider}
          onChange={(e) => { setSelectedProvider(e.target.value); setShowKey(false); }}
          style={{
            background: 'var(--s1)', color: 'var(--text)',
            border: '1px solid var(--line)', borderRadius: '10px',
            padding: '10px 12px', fontSize: '13px', fontWeight: 600,
            outline: 'none', cursor: 'pointer', width: '100%',
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}{hasKey(p.id) ? " ✓ Configurado" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* API key field */}
      {isSimpleKey && (
        <ApiKeyField
          label={`Clave API de ${current.label.replace(/^[^\s]+\s/, "")}`}
          placeholder={current.placeholder}
          hint={current.hint}
          value={keyMap[selectedProvider].value}
          onChange={keyMap[selectedProvider].set}
          showKey={showKey}
          setShowKey={setShowKey}
          configured={hasKey(selectedProvider)}
        />
      )}

      {selectedProvider === "ollama" && (
        <OllamaFields
          url={customAiUrl} setUrl={setCustomAiUrl}
          model={customAiModel} setModel={setCustomAiModel}
          hint={current.hint}
        />
      )}

      {selectedProvider === "custom" && (
        <CustomFields
          url={customAiUrl} setUrl={setCustomAiUrl}
          apiKey={customAiKey} setApiKey={setCustomAiKey}
          model={customAiModel} setModel={setCustomAiModel}
          showKey={showKey} setShowKey={setShowKey}
        />
      )}
    </div>
  );
}

/* ── Reusable API Key input ── */
function ApiKeyField({ label, placeholder, hint, value, onChange, showKey, setShowKey, configured }: {
  label: string; placeholder: string; hint: string;
  value: string; onChange: (v: string) => void;
  showKey: boolean; setShowKey: (v: boolean) => void;
  configured: boolean;
}) {
  return (
    <div style={{
      background: 'var(--s1)', padding: '14px', borderRadius: '12px',
      border: configured ? '1px solid var(--mint)' : '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>
          <Key size={13} style={{ color: configured ? 'var(--mint)' : 'var(--dim)' }} />
          {label}
        </label>
        {configured && (
          <span style={{
            fontSize: '10px', background: 'color-mix(in srgb, var(--mint) 15%, transparent)',
            color: 'var(--mint)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <Check size={10} /> Configurado
          </span>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={showKey ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', paddingRight: '36px' }}
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          style={{
            position: 'absolute', right: '10px', top: '50%',
            transform: 'translateY(-50%)', background: 'none',
            border: 'none', color: 'var(--dim)', cursor: 'pointer',
          }}
        >
          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      <span style={{ fontSize: '10.5px', color: 'var(--dim)' }}>{hint}</span>
    </div>
  );
}

/* ── Ollama fields ── */
function OllamaFields({ url, setUrl, model, setModel, hint }: {
  url: string; setUrl: (v: string) => void;
  model: string; setModel: (v: string) => void;
  hint: string;
}) {
  return (
    <div style={{
      background: 'var(--s1)', padding: '14px', borderRadius: '12px',
      border: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>
        <Server size={13} style={{ color: 'var(--mint)' }} /> URL de Ollama
      </label>
      <input type="text" placeholder="http://localhost:11434" value={url} onChange={(e) => setUrl(e.target.value)} />
      <label style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>Modelo</label>
      <input type="text" placeholder="llama3, mistral, qwen2.5" value={model} onChange={(e) => setModel(e.target.value)} />
      <span style={{ fontSize: '10.5px', color: 'var(--dim)' }}>{hint}</span>
    </div>
  );
}

/* ── Custom endpoint fields ── */
function CustomFields({ url, setUrl, apiKey, setApiKey, model, setModel, showKey, setShowKey }: {
  url: string; setUrl: (v: string) => void;
  apiKey: string; setApiKey: (v: string) => void;
  model: string; setModel: (v: string) => void;
  showKey: boolean; setShowKey: (v: boolean) => void;
}) {
  return (
    <div style={{
      background: 'var(--s1)', padding: '14px', borderRadius: '12px',
      border: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>
        <Globe size={13} style={{ color: 'var(--mint)' }} /> URL Base (OpenAI Compatible)
      </label>
      <input type="text" placeholder="https://api.mi-custom-ai.com/v1" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600, marginBottom: '4px' }}>
            <Key size={13} style={{ color: 'var(--dim)' }} /> API Key
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? "text" : "password"}
              placeholder="sk-custom-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ width: '100%', paddingRight: '36px' }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute', right: '10px', top: '50%',
                transform: 'translateY(-50%)', background: 'none',
                border: 'none', color: 'var(--dim)', cursor: 'pointer',
              }}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600, marginBottom: '4px', display: 'block' }}>
            Nombre del Modelo
          </label>
          <input type="text" placeholder="gpt-4o-custom" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
