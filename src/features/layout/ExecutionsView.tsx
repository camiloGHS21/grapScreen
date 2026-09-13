import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2, XCircle, StopCircle, RefreshCw, ChevronRight,
  ChevronDown, Clock, Zap, Inbox,
} from "lucide-react";

interface NodeRunStatus {
  node_id: string;
  label: string;
  status: string;
  detail?: string | null;
  duration_ms?: number;
}

interface ExecutionRecord {
  automation_id: string;
  automation_name: string;
  started_at: number;
  finished_at: number;
  duration_ms: number;
  status: string;
  error?: string | null;
  node_statuses: NodeRunStatus[];
  trigger_kind?: string | null;
}

interface ExecutionsViewProps {
  automationId: string;
  notify?: (msg: string) => void;
}

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("es-ES", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
function fmtDur(ms: number): string {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
    success: { label: "Éxito", cls: "ok", Icon: CheckCircle2 },
    error: { label: "Error", cls: "err", Icon: XCircle },
    stopped: { label: "Detenido", cls: "stop", Icon: StopCircle },
  };
  const cfg = map[status] || map.stopped;
  const Icon = cfg.Icon;
  return (
    <span className={"exec-pill exec-pill-" + cfg.cls}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

export function ExecutionsView({ automationId, notify }: ExecutionsViewProps) {
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!automationId) return;
    setLoading(true);
    try {
      const list = await invoke<ExecutionRecord[]>("get_execution_history", { automationId });
      setRecords(list || []);
    } catch (e) {
      notify?.(String(e));
    } finally {
      setLoading(false);
    }
  }, [automationId, notify]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="exec-view">
      <div className="exec-view-head">
        <div>
          <h3>Ejecuciones</h3>
          <p>Historial de cada corrida de este flujo, con el detalle por nodo.</p>
        </div>
        <button type="button" className="exec-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? "ftb-spin" : ""} />
          Actualizar
        </button>
      </div>

      {records.length === 0 && !loading && (
        <div className="exec-empty">
          <Inbox size={26} />
          <p>Todavía no hay ejecuciones registradas.</p>
          <span>Ejecuta el flujo desde el Editor para ver los resultados aquí.</span>
        </div>
      )}

      {records.length > 0 && (
        <div className="exec-table">
          <div className="exec-tr exec-th">
            <span className="exec-td-status">Estado</span>
            <span className="exec-td-time">Inicio</span>
            <span className="exec-td-dur">Duración</span>
            <span className="exec-td-trigger">Disparador</span>
            <span className="exec-td-nodes">Nodos</span>
            <span className="exec-td-chev" />
          </div>

          {records.map((r, i) => (
            <React.Fragment key={`${r.started_at}-${i}`}>
              <button
                type="button"
                className={"exec-tr exec-row" + (expanded === i ? " open" : "")}
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <span className="exec-td-status"><StatusPill status={r.status} /></span>
                <span className="exec-td-time">{fmtDateTime(r.started_at)}</span>
                <span className="exec-td-dur"><Clock size={11} /> {fmtDur(r.duration_ms)}</span>
                <span className="exec-td-trigger">
                  {r.trigger_kind ? <><Zap size={11} /> {r.trigger_kind}</> : "Manual"}
                </span>
                <span className="exec-td-nodes">{r.node_statuses?.length ?? 0}</span>
                <span className="exec-td-chev">
                  {expanded === i ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {expanded === i && (
                <div className="exec-detail">
                  {r.error && <div className="exec-error-line">{r.error}</div>}
                  {r.node_statuses?.map((n, j) => (
                    <div className="exec-node-row" key={`${n.node_id}-${j}`}>
                      <span className={"exec-node-dot exec-node-" + (n.status === "ok" ? "ok" : n.status === "error" ? "err" : "skip")} />
                      <span className="exec-node-label">{n.label || n.node_id}</span>
                      <span className="exec-node-status">{n.status}</span>
                      <span className="exec-node-dur">{n.duration_ms != null ? fmtDur(n.duration_ms) : ""}</span>
                    </div>
                  ))}
                  {(!r.node_statuses || r.node_statuses.length === 0) && (
                    <div className="exec-node-empty">Sin detalle de nodos para esta ejecución.</div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export default ExecutionsView;
