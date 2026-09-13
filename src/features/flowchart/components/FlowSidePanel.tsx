import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronRight, ChevronLeft, Plus, MousePointer2 } from "lucide-react";
import type { FlowNodeType } from "../../../types";
import { NODE_COLORS } from "../../../Flowchart";
import { CATALOG_GROUPS, CATALOG_ITEMS, ALL_CATALOG_ITEMS, type CatalogItem, type NodeGroupId } from "../utils/nodeCatalog";

export type SidePanelMode = "empty" | "catalog" | "group" | "search";
interface FlowSidePanelProps {
  mode: SidePanelMode;
  group?: NodeGroupId | null;
  onPickNode: (type: FlowNodeType, label?: string) => void;
  onModeChange: (mode: SidePanelMode, group?: NodeGroupId | null) => void;
  onClose: () => void;
  nodeCount: number;
}

// The same kind can be listed in two categories. Search should show it once,
// and an unfinished alias must never hide a working node of the same kind.
const searchableItems = ALL_CATALOG_ITEMS.filter((item, index, all) =>
  !item.comingSoon && all.findIndex((other) => other.type === item.type && !other.comingSoon) === index,
);
const normalise = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function FlowSidePanel({ mode, group, onPickNode, onModeChange, onClose, nodeCount }: FlowSidePanelProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const activeGroup = mode === "group" ? CATALOG_GROUPS.find((g) => g.id === group) : undefined;
  const searchResults = useMemo(() => searchableItems.filter((item) =>
    normalise(`${item.label} ${item.desc} ${item.type}`).includes(normalise(query.trim())),
  ), [query]);
  useEffect(() => { if (mode !== "search") setQuery(""); }, [mode, group]);
  const pick = (item: CatalogItem) => { if (!item.comingSoon) onPickNode(item.type, item.label); };

  return (
    <aside className="flow-side-panel" aria-label="Panel de nodos">
      <div className="fsp-head">
        {activeGroup && <button type="button" className="fsp-back" onClick={() => onModeChange("catalog")} title="Volver a categorías"><ChevronLeft size={18} /></button>}
        <div className="fsp-head-text">
          <div className="fsp-eyebrow">CONSTRUIR EL FLUJO</div>
          <h2 className="fsp-title">{activeGroup?.title || "Añadir nodos"}</h2>
          <div className="fsp-sub">{activeGroup?.desc || "Haz clic en un nodo para ponerlo en el lienzo."}</div>
        </div>
        <button type="button" className="fsp-close" onClick={onClose} title="Cerrar panel de nodos"><X size={18} /></button>
      </div>
      <div className="fsp-search">
        <Search size={16} />
        <input ref={inputRef} type="search" placeholder="Buscar un nodo…" aria-label="Buscar nodos" value={query}
          onChange={(e) => { setQuery(e.target.value); if (mode !== "search") onModeChange("search"); }} />
        {query && <button type="button" onClick={() => { setQuery(""); onModeChange("catalog"); inputRef.current?.focus(); }} title="Limpiar búsqueda"><X size={14} /></button>}
      </div>
      <div className="fsp-scroll">
        {mode === "search" && query.trim() ? (
          <div className="fsp-section">
            <div className="fsp-section-title">{searchResults.length} resultados</div>
            {searchResults.length === 0 && <div className="fsp-empty">No hay resultados para «{query}». Prueba con otro nombre.</div>}
            {searchResults.map((item) => <PanelItem key={item.type} item={item} onPick={pick} />)}
          </div>
        ) : activeGroup ? (
          <div className="fsp-section">
            {CATALOG_ITEMS[activeGroup.id].map((item) => <PanelItem key={`${item.type}-${item.label}`} item={item} onPick={pick} />)}
          </div>
        ) : (
          <>
            <div className="fsp-section">
              <div className="fsp-section-title">{nodeCount ? "Más utilizados" : "Empieza con un disparador"}</div>
              {(nodeCount ? ["trigger", "http_request", "condition", "edit_fields"] : ["trigger", "cron", "webhook"]).map((type) => {
                const item = searchableItems.find((it) => it.type === type);
                return item ? <PanelItem key={type} item={item} onPick={pick} /> : null;
              })}
            </div>
            <div className="fsp-divider" />
            <div className="fsp-section">
              <div className="fsp-section-title">Explorar categorías</div>
              {CATALOG_GROUPS.map((g) => (
                <button key={g.id} type="button" className="fsp-row" onClick={() => onModeChange("group", g.id)}>
                  <span className="fsp-row-icon"><g.icon size={19} /></span>
                  <span className="fsp-row-text"><span className="fsp-row-title">{g.title}</span><span className="fsp-row-desc">{g.desc}</span></span>
                  <ChevronRight size={16} className="fsp-row-chevron" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="fsp-footer"><MousePointer2 size={15} /><span>Haz clic en un nodo para añadirlo. Conecta los puertos para definir el orden.</span></div>
    </aside>
  );
}

function PanelItem({ item, onPick }: { item: CatalogItem; onPick: (item: CatalogItem) => void }) {
  const accent = NODE_COLORS[item.type] || "var(--muted)";
  return (
    <button type="button" className="fsp-item" disabled={item.comingSoon} style={{ "--accent": accent } as React.CSSProperties}
      onClick={() => onPick(item)} title={item.comingSoon ? `${item.label}: no implementado` : item.desc}>
      <span className="fsp-item-icon"><item.icon size={21} /></span>
      <span className="fsp-item-text"><span className="fsp-item-title">{item.label}{item.comingSoon && <em className="fsp-soon">No disponible</em>}</span><span className="fsp-item-desc">{item.desc}</span></span>
      {!item.comingSoon && <Plus size={15} className="fsp-plus" />}
    </button>
  );
}
export default FlowSidePanel;
