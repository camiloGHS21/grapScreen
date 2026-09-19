import React, { useState } from "react";
import {
  Play,
  Database,
  Pin,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
  Table,
  FileJson,
  ListTree,
  Search,
  Copy,
  ArrowRight,
} from "lucide-react";
import { DraggableJsonTree } from "./components/DraggableJsonTree";
import { NdvDataTableView } from "./components/NdvDataTableView";
import { NdvDataSchemaView } from "./components/NdvDataSchemaView";
import { NdvInputItem } from "./types";

interface NdvInputPanelProps {
  upstreamSources: NdvInputItem[];
  activeInputItem: NdvInputItem | null;
  selectedSourceId: string | null;
  onSelectSourceId: (id: string) => void;
  onExecutePreviousNodes: (upstreamNodeId: string) => void;
  upstreamRunning: boolean;
  onCopyExpression: (expr: string) => void;
  onUpdatePinData?: (data: unknown) => void;
}

export function NdvInputPanel({
  upstreamSources,
  activeInputItem,
  selectedSourceId,
  onSelectSourceId,
  onExecutePreviousNodes,
  upstreamRunning,
  onCopyExpression,
  onUpdatePinData,
}: NdvInputPanelProps) {
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"table" | "json" | "schema">("json");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState('{\n  "id": 1,\n  "nombre": "Ejemplo"\n}');

  const rawData = activeInputItem?.data;
  const isArray = Array.isArray(rawData);
  const totalItems = isArray ? (rawData as unknown[]).length : rawData ? 1 : 0;
  const currentItemData = isArray ? (rawData as unknown[])[activeItemIndex] : rawData;

  const handleSavePin = () => {
    try {
      const parsed = JSON.parse(pinDraft);
      onUpdatePinData?.(parsed);
      setIsEditingPin(false);
    } catch (e: unknown) {
      alert(`JSON inválido: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCopyAll = () => {
    if (!rawData) return;
    navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div className="ndv-col-input">
      {/* Column Header */}
      <div className="ndv-col-head">
        <div className="ndv-col-title-wrap">
          <Database size={13} className="ndv-col-icon" />
          <span className="ndv-col-title">INPUT</span>
          {totalItems > 0 && (
            <span className="ndv-badge-count">
              {totalItems} item{totalItems !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {upstreamSources.length > 1 && (
          <select
            className="ndv-source-select"
            value={selectedSourceId || activeInputItem?.nodeId || ""}
            onChange={(e) => onSelectSourceId(e.target.value)}
          >
            {upstreamSources.map((src) => (
              <option key={src.nodeId} value={src.nodeId}>
                {src.nodeLabel}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Subheader: View Switcher (Table / JSON / Schema) + Search + Copy */}
      <div className="ndv-toolbar-row">
        <div className="ndv-view-switch">
          <button
            type="button"
            className={`ndv-view-btn ${viewMode === "table" ? "active" : ""}`}
            onClick={() => setViewMode("table")}
            title="Vista de Tabla (Hoja de cálculo)"
          >
            <Table size={12} /> Tabla
          </button>
          <button
            type="button"
            className={`ndv-view-btn ${viewMode === "json" ? "active" : ""}`}
            onClick={() => setViewMode("json")}
            title="Vista de Árbol JSON"
          >
            <FileJson size={12} /> JSON
          </button>
          <button
            type="button"
            className={`ndv-view-btn ${viewMode === "schema" ? "active" : ""}`}
            onClick={() => setViewMode("schema")}
            title="Vista de Esquema (Tipos)"
          >
            <ListTree size={12} /> Esquema
          </button>
        </div>

        <div className="ndv-toolbar-actions">
          {rawData != null && (
            <button
              type="button"
              className="ndv-btn-icon"
              onClick={handleCopyAll}
              title="Copiar JSON completo"
            >
              {copiedAll ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {rawData != null && (
        <div className="ndv-search-bar">
          <Search size={12} className="ndv-search-icon" />
          <input
            type="text"
            placeholder="Buscar campos o valores…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ndv-search-input"
          />
        </div>
      )}

      {/* Item Pagination if array and in JSON mode */}
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

      {/* Hint banner for drag-and-drop */}
      <div className="ndv-drag-hint-banner">
        <Sparkles size={12} />
        <span>Arrastra cualquier campo al formulario para mapear expresiones.</span>
      </div>

      {/* Main Content Area */}
      <div className="ndv-col-body">
        {currentItemData ? (
          <div className="ndv-tree-scroll">
            {viewMode === "table" ? (
              <NdvDataTableView
                data={rawData}
                onCopyExpression={onCopyExpression}
                searchTerm={searchTerm}
              />
            ) : viewMode === "schema" ? (
              <NdvDataSchemaView
                data={rawData}
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
        ) : (
          <div className="ndv-empty-state">
            <div className="ndv-empty-icon">
              <ArrowRight size={24} />
            </div>
            <div className="ndv-empty-title">No input data</div>
            <button
              type="button"
              className="ndv-btn-test-step"
              disabled={upstreamRunning}
              onClick={() =>
                onExecutePreviousNodes(
                  selectedSourceId || upstreamSources[0]?.nodeId || "",
                )
              }
            >
              <Play size={13} />
              {upstreamRunning ? "Ejecutando…" : "Execute previous nodes"}
            </button>
            <div style={{ marginTop: 8, fontSize: "11px", color: "var(--dim)" }}>
              to view input data
            </div>
            <div
              className="ndv-mock-link"
              onClick={() => setIsEditingPin(true)}
              style={{ marginTop: 12, fontSize: "11px", color: "var(--dim)", cursor: "pointer" }}
            >
              or <span style={{ color: "#ff6d5a", textDecoration: "underline" }}>set mock data</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal / Dialog for Pin Data editing */}
      {isEditingPin && (
        <div className="ndv-pin-editor-overlay">
          <div className="ndv-pin-editor-card">
            <div className="ndv-pin-head">
              <span>Fijar datos de prueba (Pin Data)</span>
              <button
                type="button"
                className="ndv-btn-icon"
                onClick={() => setIsEditingPin(false)}
              >
                ×
              </button>
            </div>
            <textarea
              className="ndv-pin-textarea"
              rows={8}
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value)}
            />
            <div className="ndv-pin-actions">
              <button
                type="button"
                className="quiet"
                onClick={() => setIsEditingPin(false)}
              >
                Cancelar
              </button>
              <button type="button" className="save" onClick={handleSavePin}>
                <Check size={13} /> Fijar datos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default NdvInputPanel;
