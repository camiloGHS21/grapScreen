import React, { useEffect, useRef, useState } from "react";
import { Trash2, History, ChevronDown, ChevronUp, Terminal } from "lucide-react";

export interface LogEntry {
  id: string;
  time: string;
  level: "info" | "success" | "error" | "warning";
  message: string;
}

interface FlowLogsPanelProps {
  entries: LogEntry[];
  onClear: () => void;
  /** Opens the execution-history drawer (n8n "Previous execution"). */
  onOpenHistory?: () => void;
  executing?: boolean;
}

const LEVEL_LABEL: Record<LogEntry["level"], string> = {
  info: "INFO",
  success: "SUCCESS",
  error: "ERROR",
  warning: "WARN",
};

export function FlowLogsPanel({ entries, onClear, onOpenHistory, executing }: FlowLogsPanelProps) {
  // Collapsed to a single strip by default, like n8n's bottom dock.
  const [collapsed, setCollapsed] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the newest entry in view.
  useEffect(() => {
    if (!collapsed && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries, collapsed]);

  return (
    <div className={"flow-logs" + (collapsed ? " collapsed" : "")}>
      <div className="flogs-head">
        <button
          type="button"
          className="flogs-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Mostrar registros" : "Ocultar registros"}
        >
          <Terminal size={13} />
          <span>Registros</span>
          {entries.length > 0 && <span className="flogs-badge">{entries.length}</span>}
          {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        <div className="flogs-actions">
          {executing && <span className="flogs-live">en vivo</span>}
          <button type="button" onClick={onOpenHistory} title="Ejecución anterior">
            <History size={12} /> Historial
          </button>
          <button type="button" onClick={onClear} title="Limpiar registros" disabled={entries.length === 0}>
            <Trash2 size={12} /> Limpiar
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="flogs-body" ref={bodyRef}>
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
      )}
    </div>
  );
}

export default FlowLogsPanel;
