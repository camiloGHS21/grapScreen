import React, { useState, useEffect } from "react";
import { X, Check, Pin, Database, FileJson, Clock, AlertCircle } from "lucide-react";
import { FlowNode, RecordedEvent, NodeRunStatus } from "../../types";
import { NODE_COLORS } from "../../Flowchart";
import { getNodeIcon } from "./buildNodes";
import { JsonTreeViewer } from "./components/JsonTreeViewer";

interface NodeInspectorPanelProps {
  node: FlowNode | null;
  events: RecordedEvent[];
  lastRunStatus?: NodeRunStatus | null;
  open: boolean;
  onClose: () => void;
  onUpdateNodePin?: (nodeId: string, pinEnabled: boolean, pinnedData: any) => void;
}

export function NodeInspectorPanel({
  node,
  events,
  lastRunStatus,
  open,
  onClose,
  onUpdateNodePin,
}: NodeInspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<"input" | "output" | "pin">("input");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinDataText, setPinDataText] = useState("{\n  \"status\": 200,\n  \"data\": \"mock_value\"\n}");
  const [pinJsonError, setPinJsonError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (node) {
      setPinEnabled(!!node.pinEnabled);
      if (node.pinnedData !== undefined) {
        setPinDataText(
          typeof node.pinnedData === "string"
            ? node.pinnedData
            : JSON.stringify(node.pinnedData, null, 2)
        );
      } else {
        setPinDataText("{\n  \"status\": 200,\n  \"mock_output\": \"test\"\n}");
      }
    }
  }, [node]);

  if (!open || !node) return null;

  const accent = (NODE_COLORS as Record<string, string>)[node.type] || "#6E58F2";
  const icon = getNodeIcon(node.type, 18);

  const ev = node.data_idx != null && events[node.data_idx] ? events[node.data_idx] : null;

  const inputData = lastRunStatus?.input_data || {
    config: ev ? ev.data : { label: node.label, type: node.type },
    variables: {},
  };

  const outputData =
    node.pinEnabled && node.pinnedData
      ? { _pinned: true, payload: node.pinnedData }
      : lastRunStatus?.output_data || null;

  const handleCopyPath = (expr: string) => {
    navigator.clipboard.writeText(expr);
    setToastMsg(`Copiado: ${expr}`);
    setTimeout(() => setToastMsg(null), 2200);
  };

  const handleSavePin = () => {
    try {
      const parsed = JSON.parse(pinDataText);
      setPinJsonError(null);
      if (onUpdateNodePin) {
        onUpdateNodePin(node.id, pinEnabled, parsed);
      }
      setToastMsg(pinEnabled ? "📌 Pin Data activado" : "Pin Data guardado");
      setTimeout(() => setToastMsg(null), 2000);
    } catch (e: any) {
      setPinJsonError(`JSON inválido: ${e.message}`);
    }
  };

  return (
    <div className="node-inspector-drawer">
      {toastMsg && (
        <div className="inspector-toast">
          <Check size={14} /> {toastMsg}
        </div>
      )}

      {/* Drawer Header */}
      <div className="inspector-head" style={{ borderLeft: `4px solid ${accent}` }}>
        <div className="inspector-head-left">
          <div className="inspector-head-icon" style={{ borderColor: accent, color: accent }}>
            {icon}
          </div>
          <div className="inspector-head-titles">
            <div className="inspector-title-row">
              <span className="inspector-title">{node.label}</span>
              {pinEnabled && <span className="inspector-pin-badge">📌 Pinned</span>}
            </div>
            <span className="inspector-subtitle">{node.type} • ID: {node.id}</span>
          </div>
        </div>
        <button type="button" className="inspector-close" onClick={onClose} title="Cerrar panel (Esc)">
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="inspector-tabs">
        <button
          type="button"
          className={`inspector-tab ${activeTab === "input" ? "active" : ""}`}
          onClick={() => setActiveTab("input")}
        >
          <Database size={13} /> Entrada (Input)
        </button>
        <button
          type="button"
          className={`inspector-tab ${activeTab === "output" ? "active" : ""}`}
          onClick={() => setActiveTab("output")}
        >
          <FileJson size={13} /> Salida (Output)
        </button>
        <button
          type="button"
          className={`inspector-tab ${activeTab === "pin" ? "active" : ""}`}
          onClick={() => setActiveTab("pin")}
        >
          <Pin size={13} /> Pin Data
        </button>
      </div>

      {/* Drawer Body */}
      <div className="inspector-body">
        {activeTab === "input" && (
          <div className="tab-content">
            <div className="inspector-hint">
              💡 Haz clic en cualquier clave para copiar su expresión <code>{"{{ variable }}"}</code> al portapapeles.
            </div>
            <div className="json-box">
              <JsonTreeViewer data={inputData} onCopyPath={handleCopyPath} />
            </div>
          </div>
        )}

        {activeTab === "output" && (
          <div className="tab-content">
            {lastRunStatus?.duration_ms != null && (
              <div className="meta-badge" style={{ marginBottom: 10, fontSize: 11, color: "var(--mint)", display: "flex", alignItems: "center", gap: 6 }}>
                <Clock size={12} /> Ejecutado en {lastRunStatus.duration_ms} ms
              </div>
            )}

            {outputData ? (
              <div className="json-box">
                <JsonTreeViewer data={outputData} onCopyPath={handleCopyPath} />
              </div>
            ) : (
              <div className="inspector-empty">
                <AlertCircle size={28} style={{ color: "var(--dim)", marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
                  No hay datos de salida aún. Ejecuta el flujo o activa <b>Pin Data</b> para fijar datos de prueba.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "pin" && (
          <div className="tab-content pin-tab" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="pin-toggle-bar">
              <label className="pin-switch-label">
                <input
                  type="checkbox"
                  checked={pinEnabled}
                  onChange={(e) => setPinEnabled(e.target.checked)}
                />
                <span>Activar Pin Data (Fijar salida de prueba)</span>
              </label>
            </div>

            <p className="pin-desc">
              Cuando Pin Data está activo, grapScreen usará esta salida simulada en lugar de ejecutar la acción real del nodo. Ideal para diseñar flujos complejos sin invocar APIs externas.
            </p>

            {pinJsonError && <div className="pin-error-box">{pinJsonError}</div>}

            <textarea
              className="pin-editor"
              value={pinDataText}
              onChange={(e) => setPinDataText(e.target.value)}
              placeholder="Escribe tu objeto JSON simulado aquí..."
              rows={10}
            />

            <button type="button" className="btn-save-pin" onClick={handleSavePin}>
              <Check size={14} /> Guardar Pin Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
