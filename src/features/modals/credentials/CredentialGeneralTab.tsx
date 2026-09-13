import React from "react";
import { Check, Sun, Moon, Zap, Sliders, Globe } from "lucide-react";

export function ToggleSwitch({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '10px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        {desc && <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{desc}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: '46px',
          minWidth: '46px',
          height: '26px',
          borderRadius: '13px',
          background: checked ? 'var(--red)' : 'var(--s2)',
          border: `1px solid ${checked ? 'var(--red)' : 'var(--line)'}`,
          position: 'relative',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          padding: 0,
          outline: 'none',
          boxShadow: checked ? '0 0 12px color-mix(in srgb, var(--red) 35%, transparent)' : 'none'
        }}
      >
        <span style={{
          position: 'absolute',
          top: '3px',
          left: checked ? '23px' : '3px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
          transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }} />
      </button>
    </div>
  );
}

interface CredentialGeneralTabProps {
  theme: string;
  applyTheme: (theme: string) => void;
  language: string;
  applyLanguage: (lang: string) => void;
  bgModeDefault: boolean;
  setBgModeDefault: (v: boolean) => void;
  videoNotify: boolean;
  setVideoNotify: (v: boolean) => void;
}

export function CredentialGeneralTab({
  theme,
  applyTheme,
  language,
  applyLanguage,
  bgModeDefault,
  setBgModeDefault,
  videoNotify,
  setVideoNotify,
}: CredentialGeneralTabProps) {
  const themes = [
    {
      id: 'dark',
      label: 'Oscuro',
      desc: 'Modo nocturno moderno',
      icon: <Moon size={16} style={{ color: '#a39cb8' }} />,
      colors: ['#121018', '#181522', '#ff3b5c']
    },
    {
      id: 'light',
      label: 'Claro',
      desc: 'Interfaz fresca y limpia',
      icon: <Sun size={16} style={{ color: '#e53935' }} />,
      colors: ['#f4f6fb', '#ffffff', '#e53935']
    },
    {
      id: 'neon',
      label: 'Neón Cyber',
      desc: 'Estilo cyberpunk futurista',
      icon: <Zap size={16} style={{ color: '#05ffa1' }} />,
      colors: ['#0c0714', '#140d21', '#ff2a6d']
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Sliders size={16} style={{ color: 'var(--red)' }} />
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Tema Visual de la Aplicación
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {themes.map((t) => {
            const isSelected = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTheme(t.id)}
                style={{
                  padding: '14px 12px',
                  borderRadius: '14px',
                  border: isSelected ? '2px solid var(--red)' : '1px solid var(--line)',
                  background: isSelected ? 'color-mix(in srgb, var(--red) 8%, var(--s1))' : 'var(--s1)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '8px',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 4px 16px color-mix(in srgb, var(--red) 15%, transparent)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: isSelected ? 700 : 600 }}>
                    {t.icon}
                    <span>{t.label}</span>
                  </div>
                  {isSelected && <Check size={16} style={{ color: 'var(--red)' }} />}
                </div>

                {/* Color Swatch Preview */}
                <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                  {t.colors.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: c,
                        border: '1px solid rgba(255,255,255,0.15)'
                      }}
                    />
                  ))}
                </div>

                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 400, textAlign: 'left', marginTop: '2px' }}>
                  {t.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Globe size={16} style={{ color: 'var(--mint)' }} />
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Idioma de la Interfaz
          </label>
        </div>
        <select
          value={language}
          onChange={(e) => applyLanguage(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--s1)',
            color: 'var(--text)',
            border: '1px solid var(--line)',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '13px',
            fontWeight: 600,
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="es">🇲🇽 Español (Latinoamérica)</option>
          <option value="en">🇺🇸 English (US)</option>
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
          Preferencias de Ejecución del Sistema
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--s1)', padding: '12px 16px', borderRadius: '14px', border: '1px solid var(--line)' }}>
          <ToggleSwitch
            checked={bgModeDefault}
            onChange={setBgModeDefault}
            label="Ejecutar automatizaciones en segundo plano por defecto"
            desc="Minimiza u oculta ventanas del sistema durante la reproducción de flujos de trabajo"
          />
          <div style={{ height: '1px', background: 'var(--line)', margin: '4px 0' }} />
          <ToggleSwitch
            checked={videoNotify}
            onChange={setVideoNotify}
            label="Notificaciones al finalizar compilación de video"
            desc="Muestra un aviso flotante cuando la generación de MP4/demostración haya concluido"
          />
        </div>
      </div>
    </div>
  );
}
