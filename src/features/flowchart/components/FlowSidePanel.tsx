import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronRight, ChevronLeft, MousePointer2 } from "lucide-react";
import {
  CATALOG_GROUPS,
  CATALOG_ITEMS,
  ALL_CATALOG_ITEMS,
  categorisedN8nItems,
  integratedCount,
  type CatalogItem,
  type NodeGroupId,
} from "../utils/nodeCatalog";
import {
  type FlowSidePanelProps,
  type SidePanelMode,
  normalise,
  ACTION_CATEGORY_DESCS,
} from "./FlowSidePanelTypes";
import {
  CategoryGlyph,
  categoryMeta,
  INTEGRATED_CATEGORY,
  OTHER_CATEGORY,
} from "./FlowSidePanelIcons";
import { PanelItem, itemIdentity } from "./FlowSidePanelItem";
import { FlowSidePanelDrilldown } from "./FlowSidePanelDrilldown";
import { FlowPortSubNodePanel } from "./FlowPortSubNodePanel";
import { AI_PORT_IDS } from "../utils/aiPortCatalog";

export type { SidePanelMode };

const TRIGGER_TYPES = new Set<string>([
  ...CATALOG_ITEMS["trigger"].map((i) => i.type),
  "n8n_trigger",
]);

const searchableItems = ALL_CATALOG_ITEMS.filter((item, index, all) =>
  !item.comingSoon &&
  all.findIndex((other) => itemIdentity(other) === itemIdentity(item) && !other.comingSoon) === index,
);

export function FlowSidePanel({
  mode,
  group,
  panelSource,
  onClearPort,
  onPickNode,
  onModeChange,
  onClose,
  nodeCount,
}: FlowSidePanelProps) {
  const isEmptyCanvas = nodeCount === 0;
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(group || null);
  const [activeSubCategory, setActiveSubCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const portId = panelSource?.portId;
  const isPortSubNode = Boolean(portId && AI_PORT_IDS.includes(portId));

  useEffect(() => {
    if (mode === "group" && group) {
      setActiveCategory(group);
      setActiveSubCategory(null);
    } else if (mode === "catalog" && !group) {
      setActiveCategory(null);
    }
  }, [mode, group]);

  const searchResults = useMemo(() => {
    const q = normalise(query.trim());
    if (!q) return [];
    const haystack = (item: CatalogItem) =>
      normalise(`${item.label} ${item.desc} ${item.type} ${item.n8nCategory ?? ""} ${item.n8nKey ?? ""}`);
    const matches = searchableItems.filter((item) => haystack(item).includes(q));
    if (isEmptyCanvas) return matches.filter((item) => TRIGGER_TYPES.has(item.type));
    return matches;
  }, [query, isEmptyCanvas]);

  const pick = (item: CatalogItem) => {
    if (item.comingSoon) return;
    onPickNode(
      item.type,
      item.label,
      item.n8nKey ? { key: item.n8nKey, mode: item.n8nMode } : undefined,
    );
  };

  const actionCategories = useMemo(() => {
    return CATALOG_GROUPS.map((g) => {
      const items = CATALOG_ITEMS[g.id] || [];
      const nonTriggers = g.id === "trigger" ? items : items.filter((it) => !TRIGGER_TYPES.has(it.type));
      return {
        id: g.id,
        title: g.title,
        desc: ACTION_CATEGORY_DESCS[g.id] || g.desc,
        count: nonTriggers.length,
      };
    });
  }, []);

  const triggerCategories = useMemo(() => {
    const rows = categorisedN8nItems("trigger").map((s) => ({
      key: s.category ?? OTHER_CATEGORY,
      label: s.category ? s.label : categoryMeta(OTHER_CATEGORY).label,
      count: s.items.length,
    }));
    return [...rows.filter((r) => r.key !== OTHER_CATEGORY), ...rows.filter((r) => r.key === OTHER_CATEGORY)];
  }, []);

  const appSubCategories = useMemo(() => {
    return categorisedN8nItems("action").map((s) => ({
      key: s.category ?? OTHER_CATEGORY,
      label: s.category ? s.label : categoryMeta(OTHER_CATEGORY).label,
      count: s.items.length,
      items: s.items,
    }));
  }, []);

  const activeCategoryMeta = activeCategory ? categoryMeta(activeCategory) : null;
  const integratedActionItems = useMemo(() => CATALOG_ITEMS.action.slice(0, integratedCount("action")), []);
  const integratedTriggerItems = useMemo(() => CATALOG_ITEMS.trigger.slice(0, integratedCount("trigger")), []);

  const handleBack = () => {
    if (activeSubCategory) {
      setActiveSubCategory(null);
    } else {
      setActiveCategory(null);
      onModeChange("catalog");
    }
  };

  if (isPortSubNode && portId) {
    return (
      <FlowPortSubNodePanel
        portId={portId}
        onPick={pick}
        onClose={onClose}
        onBack={() => {
          onClearPort?.();
          onModeChange("catalog");
        }}
      />
    );
  }

  return (
    <aside className="flow-side-panel" aria-label="Panel de nodos">
      <div className="fsp-head">
        {activeCategory && (
          <button type="button" className="fsp-back" onClick={handleBack} title="Volver">
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="fsp-head-text">
          <div className="fsp-eyebrow">CONSTRUIR EL FLUJO</div>
          <h2 className="fsp-title">
            {activeSubCategory
              ? categoryMeta(activeSubCategory).label
              : activeCategoryMeta?.label || (isEmptyCanvas ? "Añadir disparador" : "Añadir nodos")}
          </h2>
          <div className="fsp-sub">
            {isEmptyCanvas
              ? "Elige un disparador para iniciar el flujo."
              : "Haz clic en un nodo para ponerlo en el lienzo."}
          </div>
        </div>
        <button type="button" className="fsp-close" onClick={onClose} title="Cerrar panel de nodos">
          <X size={18} />
        </button>
      </div>

      <div className="fsp-search">
        <Search size={16} />
        <input
          ref={inputRef}
          type="search"
          placeholder="Buscar un nodo…"
          aria-label="Buscar nodos"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (mode !== "search") onModeChange("search");
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onModeChange("catalog");
              inputRef.current?.focus();
            }}
            title="Limpiar búsqueda"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="fsp-scroll">
        {mode === "search" && query.trim() ? (
          <div className="fsp-section">
            <div className="fsp-section-title">{searchResults.length} resultados</div>
            {searchResults.length === 0 && (
              <div className="fsp-empty">No hay resultados para «{query}». Prueba con otro término.</div>
            )}
            {searchResults.map((item) => (
              <PanelItem key={itemIdentity(item)} item={item} onPick={pick} showCategory />
            ))}
          </div>
        ) : !activeCategory ? (
          <div className="fsp-section">
            <div className="fsp-section-title">Explorar categorías</div>
            {isEmptyCanvas ? (
              <>
                <button
                  type="button"
                  className="fsp-row"
                  onClick={() => setActiveCategory(INTEGRATED_CATEGORY)}
                >
                  <CategoryGlyph categoryKey={INTEGRATED_CATEGORY} />
                  <span className="fsp-row-text">
                    <span className="fsp-row-title">{categoryMeta(INTEGRATED_CATEGORY).label}</span>
                    <span className="fsp-row-desc">{integratedTriggerItems.length} disparadores</span>
                  </span>
                  <ChevronRight size={16} className="fsp-row-chevron" />
                </button>
                {triggerCategories.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    className="fsp-row"
                    onClick={() => setActiveCategory(row.key)}
                  >
                    <CategoryGlyph categoryKey={row.key} />
                    <span className="fsp-row-text">
                      <span className="fsp-row-title">{row.label}</span>
                      <span className="fsp-row-desc">{row.count} disparadores</span>
                    </span>
                    <ChevronRight size={16} className="fsp-row-chevron" />
                  </button>
                ))}
              </>
            ) : (
              actionCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="fsp-row"
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setActiveSubCategory(null);
                    onModeChange("group", cat.id as NodeGroupId);
                  }}
                >
                  <CategoryGlyph categoryKey={cat.id} />
                  <span className="fsp-row-text">
                    <span className="fsp-row-title">{cat.title}</span>
                    <span className="fsp-row-desc">{cat.desc}</span>
                  </span>
                  <ChevronRight size={16} className="fsp-row-chevron" />
                </button>
              ))
            )}
          </div>
        ) : (
          <FlowSidePanelDrilldown
            isEmptyCanvas={isEmptyCanvas}
            activeCategory={activeCategory}
            activeSubCategory={activeSubCategory}
            activeCategoryMeta={activeCategoryMeta}
            onBack={handleBack}
            onPick={pick}
            onSelectSubCategory={(subKey) => setActiveSubCategory(subKey)}
            triggerCategories={triggerCategories}
            appSubCategories={appSubCategories}
            integratedActionItems={integratedActionItems}
            integratedTriggerItems={integratedTriggerItems}
            triggerTypes={TRIGGER_TYPES}
          />
        )}
      </div>

      <div className="fsp-footer">
        <MousePointer2 size={15} />
        <span>Haz clic en un nodo para añadirlo. Conecta los puertos para definir el orden.</span>
      </div>
    </aside>
  );
}

export default FlowSidePanel;
