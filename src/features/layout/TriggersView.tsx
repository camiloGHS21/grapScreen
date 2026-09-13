import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Zap, RefreshCw, PowerOff, Inbox, Radio,
} from "lucide-react";

interface ActiveTrigger {
  automation_id: string;
  description: string;
}

interface TriggersViewProps {
  notify?: (msg: string) => void;
  currentAutomationId?: string;
  onTriggerStopped?: (automationId: string) => void;
}

export function TriggersView({ notify, currentAutomationId, onTriggerStopped }: TriggersViewProps) {
  const [triggers, setTriggers] = useState<ActiveTrigger[]>([]);
  const [loading, setLoading] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<[string, string][]>("list_active_triggers");
      setTriggers(list.map(([automation_id, description]) => ({ automation_id, description })));
    } catch (e) {
      notify?.(String(e));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const handleStop = async (id: string) => {
    setStoppingId(id);
    try {
      await invoke("stop_automation_trigger", { id });
      notify?.("Disparador desactivado");
      onTriggerStopped?.(id);
      setTriggers((prev) => prev.filter((t) => t.automation_id !== id));
    } catch (e) {
      notify?.(String(e));
    } finally {
      setStoppingId(null);
    }
  };

  return (
    <div className="exec-view">
      <div className="exec-view-head">
        <div>
          <h3>Triggers activos</h3>
          <p>Todos los disparadores automáticos que están escuchando en este momento.</p>
        </div>
        <button type="button" className="exec-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? "ftb-spin" : ""} />
          Actualizar
        </button>
      </div>

      {triggers.length === 0 && !loading && (
        <div className="exec-empty">
          <Inbox size={26} />
          <p>No hay triggers activos.</p>
          <span>Publica una automatización desde el Editor para activar sus disparadores.</span>
        </div>
      )}

      {triggers.length > 0 && (
        <div className="trigger-table">
          <div className="trigger-tr trigger-th">
            <span className="trigger-td-status">Estado</span>
            <span className="trigger-td-id">Automatización</span>
            <span className="trigger-td-desc">Descripción</span>
            <span className="trigger-td-action" />
          </div>

          {triggers.map((t) => {
            const isCurrent = t.automation_id === currentAutomationId;
            return (
              <div key={t.automation_id} className={"trigger-tr trigger-row" + (isCurrent ? " current" : "")}>
                <span className="trigger-td-status">
                  <span className="trigger-pill">
                    <Radio size={11} className="trigger-pulse" />
                    Activo
                  </span>
                </span>
                <span className="trigger-td-id" title={t.automation_id}>
                  <code className="trigger-code">{t.automation_id.slice(0, 8)}…</code>
                  {isCurrent && <span className="trigger-current-badge">actual</span>}
                </span>
                <span className="trigger-td-desc">{t.description}</span>
                <span className="trigger-td-action">
                  <button
                    type="button"
                    className="trigger-stop-btn"
                    onClick={() => handleStop(t.automation_id)}
                    disabled={stoppingId === t.automation_id}
                    title="Desactivar disparadores de esta automatización"
                  >
                    {stoppingId === t.automation_id ? (
                      <RefreshCw size={12} className="ftb-spin" />
                    ) : (
                      <PowerOff size={12} />
                    )}
                    Desactivar
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TriggersView;
