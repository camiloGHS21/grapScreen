import React from "react";
import { Play, Loader2 } from "lucide-react";

interface NdvFooterProps {
  busy: boolean;
  stepRunning: boolean;
  canRunStep: boolean;
  onExecuteStep: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function NdvFooter({
  busy,
  stepRunning,
  canRunStep,
  onExecuteStep,
  onCancel,
  onSave,
}: NdvFooterProps) {
  return (
    <div className="ndv-footer">
      <button
        type="button"
        className="ndv-exec"
        disabled={busy || stepRunning || !canRunStep}
        onClick={onExecuteStep}
        title={canRunStep ? "Ejecutar solo este paso en Rust" : "Guarda el flujo antes de probar un nodo"}
      >
        {stepRunning ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
        {stepRunning ? "Ejecutando en Rust…" : "Probar paso"}
      </button>

      <div className="ndv-footer-right">
        <button
          type="button"
          className="quiet"
          disabled={busy || stepRunning}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="save"
          disabled={busy || stepRunning}
          onClick={onSave}
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
