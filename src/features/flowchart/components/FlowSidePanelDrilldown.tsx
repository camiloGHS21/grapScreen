import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CATALOG_ITEMS,
  categorisedN8nItems,
  type CatalogItem,
  type NodeGroupId,
} from "../utils/nodeCatalog";
import {
  CategoryGlyph,
  CategoryHeading,
  categoryMeta,
  INTEGRATED_CATEGORY,
  OTHER_CATEGORY,
} from "./FlowSidePanelIcons";
import { PanelItem, itemIdentity } from "./FlowSidePanelItem";

interface DrilldownViewProps {
  isEmptyCanvas: boolean;
  activeCategory: string;
  activeSubCategory: string | null;
  activeCategoryMeta: { label: string; accent: string } | null;
  onBack: () => void;
  onPick: (item: CatalogItem) => void;
  onSelectSubCategory: (subKey: string) => void;
  triggerCategories: { key: string; label: string; count: number }[];
  appSubCategories: { key: string; label: string; count: number; items: CatalogItem[] }[];
  integratedActionItems: CatalogItem[];
  integratedTriggerItems: CatalogItem[];
  triggerTypes: Set<string>;
}

export function FlowSidePanelDrilldown({
  isEmptyCanvas,
  activeCategory,
  activeSubCategory,
  activeCategoryMeta,
  onBack,
  onPick,
  onSelectSubCategory,
  triggerCategories,
  appSubCategories,
  integratedActionItems,
  integratedTriggerItems,
  triggerTypes,
}: DrilldownViewProps) {
  return (
    <div className="fsp-section">
      <button
        type="button"
        className="fsp-row"
        onClick={onBack}
        style={{ marginBottom: 10 }}
      >
        <span className="fsp-row-icon"><ChevronLeft size={16} /></span>
        <span className="fsp-row-text">
          <span className="fsp-row-title" style={{ color: "var(--dim)", fontSize: "11.5px" }}>
            {activeSubCategory ? `Volver a ${activeCategoryMeta?.label}` : "Volver a categorías"}
          </span>
        </span>
      </button>

      {/* Empty canvas trigger drilldown */}
      {isEmptyCanvas && (
        <>
          <div className="fsp-section-title">
            <CategoryHeading categoryKey={activeCategory} />
            {categoryMeta(activeCategory).label}
          </div>
          {(activeCategory === INTEGRATED_CATEGORY
            ? integratedTriggerItems
            : triggerCategories.find((r) => r.key === activeCategory)
            ? categorisedN8nItems("trigger").find((s) => (s.category ?? OTHER_CATEGORY) === activeCategory)?.items || []
            : []
          ).map((item) => (
            <PanelItem key={itemIdentity(item)} item={item} onPick={onPick} />
          ))}
        </>
      )}

      {/* Non-empty canvas drilldown: App Actions */}
      {!isEmptyCanvas && activeCategory === "action" && (
        !activeSubCategory ? (
          <>
            <div className="fsp-section-title">
              <CategoryHeading categoryKey="action" />
              Categorías de aplicaciones
            </div>
            <button
              type="button"
              className="fsp-row"
              onClick={() => onSelectSubCategory(INTEGRATED_CATEGORY)}
            >
              <CategoryGlyph categoryKey={INTEGRATED_CATEGORY} />
              <span className="fsp-row-text">
                <span className="fsp-row-title">Integrados más populares</span>
                <span className="fsp-row-desc">{integratedActionItems.length} servicios directos</span>
              </span>
              <ChevronRight size={16} className="fsp-row-chevron" />
            </button>
            {appSubCategories.map((sub) => (
              <button
                key={sub.key}
                type="button"
                className="fsp-row"
                onClick={() => onSelectSubCategory(sub.key)}
              >
                <CategoryGlyph categoryKey={sub.key} />
                <span className="fsp-row-text">
                  <span className="fsp-row-title">{sub.label}</span>
                  <span className="fsp-row-desc">{sub.count} aplicaciones</span>
                </span>
                <ChevronRight size={16} className="fsp-row-chevron" />
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="fsp-section-title">
              <CategoryHeading categoryKey={activeSubCategory} />
              {categoryMeta(activeSubCategory).label}
            </div>
            {(activeSubCategory === INTEGRATED_CATEGORY
              ? integratedActionItems
              : appSubCategories.find((s) => s.key === activeSubCategory)?.items || []
            ).map((item) => (
              <PanelItem key={itemIdentity(item)} item={item} onPick={onPick} />
            ))}
          </>
        )
      )}

      {/* Non-empty canvas drilldown: other groups */}
      {!isEmptyCanvas && activeCategory !== "action" && (
        <>
          <div className="fsp-section-title">
            <CategoryHeading categoryKey={activeCategory} />
            {activeCategoryMeta?.label}
          </div>
          {(activeCategory === "trigger"
            ? CATALOG_ITEMS.trigger
            : (CATALOG_ITEMS[activeCategory as NodeGroupId] || []).filter(
                (it) => !triggerTypes.has(it.type),
              )
          ).map((item) => (
            <PanelItem key={itemIdentity(item)} item={item} onPick={onPick} />
          ))}
        </>
      )}
    </div>
  );
}
