import React from "react";
import { Play, Square, Loader2, Monitor, EyeOff } from "lucide-react";

interface ExecuteWorkflowButtonProps {
  onExecute: () => void;
  onStop?: () => void;
  executing: boolean;
  disabled?: boolean;
  hasErrors?: boolean;
  /** How many nodes will run, shown as a hint. */
  nodeCount?: number;
  /** Mirrors useExecution.bgMode: run without taking over the mouse/keyboard. */
  bgMode?: boolean;
  onToggleBgMode?: () => void;
}

export function ExecuteWorkflowButton({
  onExecute,
  onStop,
  executing,
  disabled = false,
  hasErrors = false,
  nodeCount,
  bgMode = false,
  onToggleBgMode,
}: ExecuteWorkflowButtonProps) {
  const isBlocked = !executing && (disabled || hasErrors);

  return (
    <div className="exec-fab-wrap">
      <button
        type="button"
        className={"exec-fab" + (executing ? " running" : "") + (hasErrors && !executing ? " has-errors" : "")}
        onClick={executing ? onStop : onExecute}
        disabled={isBlocked}
        title={
          executing
            ? "Detener la ejecución"
            : hasErrors
            ? "No se puede ejecutar: hay nodos con errores o sin configurar"
            : "Iniciar el flujo de trabajo"
        }
      >
        {executing ? (
          <>
            <Loader2 size={15} className="ftb-spin" />
            Detener
          </>
        ) : (
          <>
            <Play size={15} />
            Iniciar Flujo
          </>
        )}
      </button>

      {!executing && onToggleBgMode && (
        <button
          type="button"
          className={"exec-mode" + (bgMode ? " active" : "")}
          onClick={onToggleBgMode}
          aria-pressed={bgMode}
          title={
            bgMode
              ? "Segundo plano: la automatización trabaja sin bloquear tu ratón ni tu teclado. Clic para usar primer plano."
              : "Segundo plano: ejecuta sin bloquear tu ratón ni tu teclado. La ventana no se queda en pantalla."
          }
        >
          {bgMode ? <EyeOff size={14} /> : <Monitor size={14} />}
        </button>
      )}

      {!executing && nodeCount != null && nodeCount > 0 && (
        <span className="exec-fab-hint">
          {nodeCount} {nodeCount === 1 ? "nodo" : "nodos"}
        </span>
      )}
    </div>
  );
}

export default ExecuteWorkflowButton;
