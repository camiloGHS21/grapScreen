import React, { useState } from "react";
import {
  CheckCircle2, AlertTriangle, Play, Zap, ArrowRight,
  Clock, Search, Copy, Check, ChevronLeft, ChevronRight,
  Table2, Braces, Binary,
} from "lucide-react";
import { DraggableJsonTree } from "./components/DraggableJsonTree";
import { NdvDataTableView } from "./components/NdvDataTableView";
import { NdvDataSchemaView } from "./components/NdvDataSchemaView";

interface NdvOutputPanelProps {
  stepResult: { ok: boolean; output?: any; error?: string; duration_ms?: number } | null;
  stepRunning: boolean;
  onExecuteStep: () => void;
  onCopyExpression?: (expr: string) => void;
  isTriggerNode?: boolean;
  onSetMockData?: () => void;
}

export function NdvOutputPanel({
  stepResult,
  stepRunning,
  onExecuteStep,
  onCopyExpression,
  isTriggerNode = false,
  onSetMockData,
}: NdvOutputPanelProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"table" | "json" | "schema">("json");

  const outputData = stepResult?.output;
  const isArray = Array.isArray(outputData);
  const totalItems = isArray ? outputData.length : outputData !== undefined ? 1 : 0;
  const currentItemData = isArray ? outputData[activeItemIndex] : outputData;

  const handleCopyFullJson = () => {
    if (outputData === undefined) return;
    navigator.clipboard.writeText(JSON.stringify(outputData, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="ndv-col-output">
      <div className="ndv-col-head">
        <div className="ndv-col-title-wrap">
          <span className="ndv-col-title">OUTPUT</span>
          {outputData !== undefined && (
            <span className="ndv-badge-count">{totalItems} {totalItems === 1 ? "item" : "items"}</span>
          )}
        </div>

        {outputData !== undefined && (
          <div className="ndv-view-switchers" style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              className={`ndv-view-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Vista de tabla"
            >
              <Table2 size={12} /> Tabla
            </button>
            <button
              type="button"
              className={`ndv-view-btn ${viewMode === "json" ? "active" : ""}`}
              onClick={() => setViewMode("json")}
              title="Vista JSON"
            >
              <Braces size={12} /> JSON
            </button>
            <button
              type="button"
              className={`ndv-view-btn ${viewMode === "schema" ? "active" : ""}`}
              onClick={() => setViewMode("schema")}
              title="Vista de esquema"
            >
              <Binary size={12} /> Esquema
            </button>
            <button
              type="button"
              className="ndv-view-btn"
              onClick={handleCopyFullJson}
              title="Copiar JSON completo"
            >
              {copiedAll ? <Check size={12} style={{ color: "#22c55e" }} /> : <Copy size={12} />}
            </button>
          </div>
        )}

        {stepResult?.duration_ms !== undefined && (
          <span className="ndv-duration-badge" title="Tiempo de ejecución en Rust">
            <Clock size={11} /> {stepResult.duration_ms} ms
          </span>
        )}
      </div>

      {outputData !== undefined && (
        <div className="ndv-search-bar">
          <Search size={12} className="ndv-search-icon" />
          <input
            type="text"
            placeholder="Buscar en la salida…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ndv-search-input"
          />
        </div>
      )}

      {isArray && totalItems > 1 && viewMode === "json" && (
        <div className="ndv-items-pagination">
          <button
            type="button"
            disabled={activeItemIndex === 0}
            onClick={() => setActiveItemIndex((i) => Math.max(0, i - 1))}
            className="ndv-page-btn"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="ndv-page-info">
            Item {activeItemIndex + 1} de {totalItems}
          </span>
          <button
            type="button"
            disabled={activeItemIndex >= totalItems - 1}
            onClick={() => setActiveItemIndex((i) => Math.min(totalItems - 1, i + 1))}
            className="ndv-page-btn"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      <div className="ndv-col-body">
        {stepResult?.ok ? (
          <div className="ndv-output-success">
            <div className="ndv-status-strip success">
              <CheckCircle2 size={13} />
              <span>Ejecutado correctamente</span>
            </div>

            <div className="ndv-tree-scroll">
              {viewMode === "table" ? (
                <NdvDataTableView
                  data={outputData}
                  onCopyExpression={onCopyExpression}
                  searchTerm={searchTerm}
                />
              ) : viewMode === "schema" ? (
                <NdvDataSchemaView
                  data={outputData}
                  onCopyExpression={onCopyExpression}
                  searchTerm={searchTerm}
                />
              ) : (
                <DraggableJsonTree
                  data={currentItemData}
                  onCopyExpression={onCopyExpression}
                />
              )}
            </div>
          </div>
        ) : stepResult && !stepResult.ok ? (
          <div className="ndv-output-error">
            <div className="ndv-status-strip error">
              <AlertTriangle size={14} />
              <span>Error en la ejecución</span>
            </div>
            <div className="ndv-error-box">
              <pre className="ndv-error-text">{stepResult.error}</pre>
            </div>
          </div>
        ) : (
          <div className="ndv-empty-state">
            <div className="ndv-empty-icon">
              {isTriggerNode ? <Zap size={24} /> : <ArrowRight size={24} />}
            </div>
            <div className="ndv-empty-title">
              {isTriggerNode ? "No trigger output" : "No output data"}
            </div>
            <button
              type="button"
              className="ndv-btn-test-step"
              disabled={stepRunning}
              onClick={onExecuteStep}
            >
              {isTriggerNode ? <Zap size={13} /> : <Play size={13} />}
              {stepRunning
                ? "Ejecutando…"
                : isTriggerNode
                ? "Test this trigger"
                : "Execute step"}
            </button>
            {onSetMockData && (
              <div
                className="ndv-mock-link"
                onClick={onSetMockData}
                style={{ marginTop: 12, fontSize: "11px", color: "var(--dim)", cursor: "pointer" }}
              >
                or <span style={{ color: "#ff6d5a", textDecoration: "underline" }}>set mock data</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NdvOutputPanel;
