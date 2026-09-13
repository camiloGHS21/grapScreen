import React from "react";
import { Sparkles, Loader2 } from "lucide-react";

export function UIBuilderAiModal({
  isOpen,
  isGenerating,
  genText,
  setGenText,
  onClose,
  onApply
}: {
  isOpen: boolean;
  isGenerating: boolean;
  genText: string;
  setGenText: (v: string) => void;
  onClose: () => void;
  onApply: (prompt?: string) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="ub-gen-overlay" onClick={() => !isGenerating && onClose()}>
      <div className="ub-gen-modal" onClick={e => e.stopPropagation()}>
        <div className="ub-gen-head">
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <Sparkles size={18} style={{ color: "#a855f7" }} /> Generar Formulario con IA
          </span>
          <button type="button" className="ub-gen-x" onClick={onClose} disabled={isGenerating}>×</button>
        </div>
        
        <p className="ub-gen-hint">
          Escribe en lenguaje natural lo que necesitas o selecciona un ejemplo de formulario rápido:
        </p>

        <div className="ub-ai-presets">
          <button type="button" className="ub-ai-preset-chip" onClick={() => { setGenText("Formulario de Registro de Usuario"); onApply("Formulario de Registro de Usuario"); }}>✨ Registro</button>
          <button type="button" className="ub-ai-preset-chip" onClick={() => { setGenText("Iniciar Sesión"); onApply("Iniciar Sesión"); }}>🔑 Login</button>
          <button type="button" className="ub-ai-preset-chip" onClick={() => { setGenText("Formulario de Contacto Empresarial"); onApply("Formulario de Contacto Empresarial"); }}>📧 Contacto</button>
          <button type="button" className="ub-ai-preset-chip" onClick={() => { setGenText("Solicitud de Cita y Reserva"); onApply("Solicitud de Cita y Reserva"); }}>📅 Reserva / Cita</button>
          <button type="button" className="ub-ai-preset-chip" onClick={() => { setGenText("Encuesta de Satisfacción de Clientes"); onApply("Encuesta de Satisfacción de Clientes"); }}>📊 Encuesta</button>
        </div>

        <textarea
          className="ub-gen-area"
          value={genText}
          disabled={isGenerating}
          onChange={e => setGenText(e.target.value)}
          placeholder="Ej: Crear un formulario de reserva de hotel con Nombre, Email, Teléfono, Fecha de entrada, Tipo de habitación y botón de Confirmar..."
          rows={5}
        />

        <div className="ub-gen-actions">
          <button type="button" className="ub-btn ub-btn-quiet" onClick={onClose} disabled={isGenerating}>Cancelar</button>
          <button type="button" className="ub-btn ub-btn-save ub-btn-ai" onClick={() => onApply()} disabled={isGenerating || !genText.trim()}>
            {isGenerating ? (
              <>
                <Loader2 size={15} className="ub-spinner" /> Generando con IA...
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generar Formulario 🪄
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
