import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, XCircle, StopCircle, Clock, ChevronDown, ChevronRight, Trash2, RefreshCw, History } from "lucide-react";

interface NodeRunStatus {
  node_id: string;
  label: string;
  status: string;
  detail?: string | null;
  input_data?: any;
  output_data?: any;
  duration_ms?: number;
}

interface ExecutionRecord {
  automation_id: string;
  automation_name: string;
  started_at: number;
  finished_at: number;
  duration_ms: number;
  status: string; // "success" | "error" | "stopped"
  error?: string | null;
  node_statuses: NodeRunStatus[];
  trigger_kind?: string | null;
}


interface ExecutionHistoryPanelProps {
  automationId: string;
  open: boolean;
  onClose: () => void;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 size={14} color="#22c55e" />;
  if (status === "error") return <XCircle size={14} color="#ef4444" />;
  return <StopCircle size={14} color="#eab308" />;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}
function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ExecutionHistoryPanel({ automationId, open, onClose }: ExecutionHistoryPanelProps) {
  const [runs, setRuns] = useState<ExecutionRecord[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [inspectNodeId, setInspectNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);


  const load = useCallback(async () => {
    if (!automationId) return;
    setLoading(true);
    try {
      const records = await invoke<ExecutionRecord[]>("get_execution_history", { automationId });
      setRuns(records);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [automationId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Refresh when a run finishes while the panel is open.
  useEffect(() => {
    if (!open) return;
    const un = listen("automation-finished", () => load());
    return () => { un.then(fn => fn()); };
  }, [open, load]);

  const clearAll = async () => {
    await invoke("clear_execution_history");
    setRuns([]);
  };

  if (!open) return null;

  return (
    <div className="exec-history">
      <div className="exec-history-head">
        <span className="exec-history-title"><History size={13} /> Ejecuciones</span>
        <div className="exec-history-actions">
          <button type="button" title="Actualizar" onClick={load} disabled={loading}>
            <RefreshCw size={12} className={loading ? "spin" : ""} />
          </button>
          <button type="button" title="Limpiar historial" onClick={clearAll}>
            <Trash2 size={12} />
          </button>
          <button type="button" title="Cerrar" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="exec-history-list">
        {runs.length === 0 && (
          <div className="exec-history-empty">
            {loading ? "Cargando…" : "Sin ejecuciones todavía. Ejecuta el flujo o activa un trigger."}
          </div>
        )}
        {runs.map((run, i) => (
          <div key={`${run.started_at}-${i}`} className="exec-run">
            <button
              type="button"
              className="exec-run-row"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              {expanded === i ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <StatusIcon status={run.status} />
              <span className="exec-run-name">{run.automation_name}</span>
              {run.trigger_kind && <span className="exec-run-trigger">{run.trigger_kind}</span>}
              <span className="exec-run-time">
                <Clock size={10} /> {fmtDate(run.started_at)} {fmtTime(run.started_at)}
              </span>
              <span className="exec-run-dur">{fmtDur(run.duration_ms)}</span>
            </button>
            {run.status === "error" && run.error && (
              <div className="exec-run-error">{run.error}</div>
            )}
            {expanded === i && run.node_statuses.length > 0 && (
              <div className="exec-run-nodes">
                {run.node_statuses.map((n) => {
                  const isNodeInsp = inspectNodeId === `${run.started_at}-${n.node_id}`;
                  return (
                    <div key={n.node_id} className="exec-run-node-wrap">
                      <div
                        className="exec-run-node"
                        onClick={() =>
                          setInspectNodeId(isNodeInsp ? null : `${run.started_at}-${n.node_id}`)
                        }
                      >
                        <StatusIcon status={n.status === "ok" ? "success" : n.status === "error" ? "error" : "stopped"} />
                        <span className="exec-run-node-label">{n.label} ({n.node_id})</span>
                        {n.duration_ms !== undefined && <span className="exec-run-node-dur">{n.duration_ms}ms</span>}
                        <span className="exec-run-node-status">{n.status}</span>
                      </div>

                      {isNodeInsp && (
                        <div className="exec-node-payloads">
                          {n.input_data && (
                            <div className="payload-block">
                              <span className="payload-title">Input Payload</span>
                              <pre className="payload-json">{JSON.stringify(n.input_data, null, 2)}</pre>
                            </div>
                          )}
                          {n.output_data && (
                            <div className="payload-block">
                              <span className="payload-title">Output Payload</span>
                              <pre className="payload-json">{JSON.stringify(n.output_data, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        ))}
      </div>
    </div>
  );
}
export default ExecutionHistoryPanel;
