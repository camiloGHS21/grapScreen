import React, { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { UIElementType } from "../../../types";
import { PALETTE_CATEGORIES } from "./UIBuilderTemplates";

interface UIBuilderPaletteProps {
  startDrag: (e: React.MouseEvent, type: UIElementType, label: string, preset?: string) => void;
  addRoot: (t: UIElementType, preset?: string) => void;
}

export function UIBuilderPalette({ startDrag, addRoot }: UIBuilderPaletteProps) {
  const [paletteSearch, setPaletteSearch] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({
    layout: true,
    fields: true,
    basic: true,
    advanced: true,
  });

  const toggleCat = (id: string) => setCollapsedCats((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="ub-palette">
      <div className="ub-palette-head">Componentes</div>
      <div className="ub-palette-search">
        <input
          type="text"
          className="ub-input"
          placeholder="🔍 Buscar componente..."
          value={paletteSearch}
          onChange={(e) => setPaletteSearch(e.target.value)}
        />
      </div>
      <div className="ub-palette-list">
        {PALETTE_CATEGORIES.map((cat) => {
          const q = paletteSearch.toLowerCase().trim();
          const catItems = q
            ? cat.items.filter(
                (item) =>
                  item.label.toLowerCase().includes(q) ||
                  item.desc.toLowerCase().includes(q) ||
                  item.type.toLowerCase().includes(q)
              )
            : cat.items;
          if (catItems.length === 0) return null;

          const isCollapsed = q ? false : collapsedCats[cat.id] ?? true;

          return (
            <div key={cat.id} className="ub-palette-cat">
              <div
                className="ub-palette-cat-title"
                onClick={() => toggleCat(cat.id)}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}
              >
                <span>{cat.title}</span>
                <span style={{ display: "flex", alignItems: "center", opacity: 0.7 }}>
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </span>
              </div>
              {!isCollapsed &&
                catItems.map((item) => (
                  <div
                    key={item.type + (item.preset || "")}
                    className="ub-palette-item"
                    onMouseDown={(e) => startDrag(e, item.type, item.label, item.preset)}
                    onClick={() => addRoot(item.type, item.preset)}
                    title={item.desc}
                  >
                    <span className="ub-palette-icon" style={{ color: "var(--red)" }}>
                      {item.icon}
                    </span>
                    <span className="ub-palette-text">
                      <span className="ub-palette-name">{item.label}</span>
                      <span className="ub-palette-desc">{item.desc}</span>
                    </span>
                  </div>
                ))}
            </div>
          );
        })}
        {paletteSearch.trim() !== "" &&
          PALETTE_CATEGORIES.every(
            (c) =>
              c.items.filter(
                (i) =>
                  i.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
                  i.desc.toLowerCase().includes(paletteSearch.toLowerCase())
              ).length === 0
          ) && <div className="ub-palette-empty">No se encontraron componentes</div>}
      </div>
      <div className="ub-palette-hint">Arrastra al canvas o haz clic</div>
    </div>
  );
}
