import React, { useState, useMemo, useRef } from "react";
import { ChevronLeft, X, Search, MousePointer2 } from "lucide-react";
import { AI_PORT_CONFIGS } from "../utils/aiPortCatalog";
import { PanelItem, itemIdentity } from "./FlowSidePanelItem";
import type { CatalogItem } from "../utils/nodeCatalog";

interface FlowPortSubNodePanelProps {
  portId: string;
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
  onBack: () => void;
}

export function FlowPortSubNodePanel({
  portId,
  onPick,
  onClose,
  onBack,
}: FlowPortSubNodePanelProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const config = AI_PORT_CONFIGS[portId];

  const allItems = useMemo(() => {
    if (!config) return [];
    return config.sections.flatMap((s) => s.items);
  }, [config]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allItems.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.desc.toLowerCase().includes(q) ||
        (it.n8nKey && it.n8nKey.toLowerCase().includes(q))
    );
  }, [allItems, query]);

  if (!config) return null;
  const Icon = config.icon;

  return (
    <aside className="flow-side-panel fsp-port-panel" aria-label={`Panel de ${config.title}`}>
      <div className="fsp-head">
        <button type="button" className="fsp-back" onClick={onBack} title="Volver al catálogo">
          <ChevronLeft size={18} />
        </button>
        <div className="fsp-head-text">
          <div className="fsp-eyebrow">SUB-NODO IA</div>
          <h2 className="fsp-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-flex", color: "var(--red, #e11d48)" }}><Icon size={16} /></span>
            {config.title}
          </h2>
          <div className="fsp-sub">Selecciona un componente para conectar al agente.</div>
        </div>
        <button type="button" className="fsp-close" onClick={onClose} title="Cerrar panel">
          <X size={18} />
        </button>
      </div>

      <div className="fsp-search">
        <Search size={16} />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search nodes..."
          aria-label="Buscar sub-nodos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            title="Limpiar búsqueda"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="fsp-scroll">
        {config.banner && !query && (
          <div className="fsp-banner-callout">
            {config.banner}
          </div>
        )}

        {filteredItems ? (
          <div className="fsp-section">
            <div className="fsp-section-title">{filteredItems.length} resultados</div>
            {filteredItems.length === 0 && (
              <div className="fsp-empty">No se encontraron nodos para «{query}».</div>
            )}
            {filteredItems.map((item) => (
              <PanelItem key={itemIdentity(item)} item={item} onPick={onPick} />
            ))}
          </div>
        ) : (
          config.sections.map((section, idx) => (
            <div key={section.title || idx} className="fsp-section">
              {section.title && (
                <div className="fsp-section-title">{section.title}</div>
              )}
              {section.items.map((item) => (
                <PanelItem key={itemIdentity(item)} item={item} onPick={onPick} />
              ))}
            </div>
          ))
        )}
      </div>

      <div className="fsp-footer">
        <MousePointer2 size={15} />
        <span>Haz clic para conectar automáticamente al puerto {portId}.</span>
      </div>
    </aside>
  );
}

export default FlowPortSubNodePanel;
