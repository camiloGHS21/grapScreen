import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { FlowNodeType, AddMenuState } from "../../types";
import { NODE_COLORS } from "../../Flowchart";
import { getNodePorts } from "./buildNodes";
import { ADD_CATEGORIES } from "./addCategories";
import type { AddCategory } from "./addCategories";

/** Returns true if a node type has at least one input port (can follow another node) */
function nodeHasInput(type: FlowNodeType): boolean {
  const ports = getNodePorts(type);
  return ports.inputs.length > 0;
}

/** Return the items (flat list) that are compatible with the current menu mode */
function getCompatibleItems(mode: "canvas" | "node" | undefined): AddCategory["items"] {
  const all = ADD_CATEGORIES.flatMap(c => c.items);
  if (mode === "canvas") {
    // Canvas: show only trigger nodes WITHOUT inputs, excluding notes
    return all.filter(it => !nodeHasInput(it.type) && it.type !== "note");
  }
  // Node: show only nodes WITH inputs (can connect after another node)
  return all.filter(it => nodeHasInput(it.type));
}


interface StepAddMenuProps {
  addMenu: AddMenuState | null;
  setAddMenu: (menu: any) => void;
  onAddStep?: (type: FlowNodeType, afterNodeId: string, sourcePortId?: string) => Promise<string | undefined> | void;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export function StepAddMenu({ addMenu, setAddMenu, onAddStep, containerRef }: StepAddMenuProps) {
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flat list of compatible items for this mode. When the right-hand panel
  // pre-selected a concrete node we must honour it even if it would normally be
  // filtered out (e.g. an HTTP node added straight onto an empty canvas).
  const compatibleItems = useMemo(() => {
    const base = getCompatibleItems(addMenu?.mode);
    const preset = addMenu?.presetType;
    if (preset && !base.some((c) => c.type === preset)) {
      const all = ADD_CATEGORIES.flatMap((c) => c.items);
      const found = all.find((it) => it.type === preset);
      if (found) return [...base, found];
    }
    return base;
  }, [addMenu?.mode, addMenu?.presetType]);

  // Filtered categories by search + mode
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let cats = ADD_CATEGORIES
      .map(cat => ({
        ...cat,
        items: cat.items.filter(it => compatibleItems.some(c => c.type === it.type)),
      }))
      .filter(cat => cat.items.length > 0);

    if (q) {
      cats = cats
        .map(cat => ({
          ...cat,
          items: cat.items.filter(it =>
            it.label.toLowerCase().includes(q) ||
            it.type.includes(q) ||
            (it.desc || "").toLowerCase().includes(q)
          ),
        }))
        .filter(cat => cat.items.length > 0);
    }
    return cats;
  }, [search, compatibleItems]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => filtered.flatMap(cat => cat.items), [filtered]);

  const handleSelect = useCallback((opt: AddCategory["items"][number]) => {
    onAddStep?.(opt.type, addMenu!.id, addMenu!.sourcePortId);
    setAddMenu(null);
    setSearch("");
    setActiveIdx(0);
  }, [onAddStep, addMenu, setAddMenu]);

  // Reset search and focus input only when menu opens
  useEffect(() => {
    if (!addMenu) return;
    setActiveIdx(0);
    // A preset from the right-hand catalog narrows the list so the chosen
    // node is the obvious first hit.
    setSearch(addMenu.presetType ? "" : (addMenu.presetLabel || ""));
    const timer = setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [addMenu]);

  // When the panel pre-selected a concrete type, highlight it right away so a
  // single Enter (or click) confirms the placement.
  useEffect(() => {
    const preset = addMenu?.presetType;
    if (!preset) return;
    const idx = flatItems.findIndex((it) => it.type === preset &&
      (!addMenu?.presetLabel || it.label === addMenu.presetLabel));
    if (idx >= 0) setActiveIdx(idx);
    else if (flatItems.length > 0 && flatItems[0].type === preset) setActiveIdx(0);
  }, [addMenu, flatItems]);

  // Keyboard navigation & global Escape listener
  useEffect(() => {
    if (!addMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setAddMenu(null); setActiveIdx(0); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatItems.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" && flatItems.length > 0) {
        e.preventDefault();
        handleSelect(flatItems[activeIdx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addMenu, flatItems, activeIdx, handleSelect, setAddMenu]);

  const handleBackdrop = useCallback(() => {
    setAddMenu(null);
    setSearch("");
    setActiveIdx(0);
  }, [setAddMenu]);

  if (!addMenu) return null;

  const modeLabel = addMenu.mode === "canvas"
    ? "Añadir nodo inicial"
    : "Añadir nodo compatible";

  let left = addMenu.x;
  let top = addMenu.y;

  if (containerRef?.current) {
    const rect = containerRef.current.getBoundingClientRect();
    const menuWidth = 380; // expected max-width
    const menuHeight = 480; // max-height

    if (left + menuWidth > rect.width) {
      left = rect.width - menuWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    if (top + menuHeight > rect.height) {
      top = rect.height - menuHeight - 16;
    }
    if (top < 16) {
      top = 16;
    }
  }

  return (
    <>
      {/* Backdrop for click-outside close */}
      <div className="n8n-addmenu-backdrop" onMouseDown={handleBackdrop} />
      <div
        className="n8n-addmenu"
        role="dialog"
        aria-label={modeLabel}
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="n8n-addmenu-header">{modeLabel}</div>
        <div className="n8n-addmenu-search">
          {React.createElement(Search, { size: 13 })}
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar nodo..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveIdx(0); }}
            autoFocus
            role="searchbox"
            aria-label="Buscar nodo"
          />
        </div>
        <div className="n8n-addmenu-scroll" role="listbox" aria-label={modeLabel}>
          {filtered.map((cat) => (
            <div key={cat.title} className="n8n-addmenu-cat" role="group" aria-label={cat.title}>
              <div className="n8n-addmenu-cat-title">{cat.title}</div>
              <div className="n8n-addmenu-grid">
                {cat.items.map((opt) => {
                  const flatIdx = flatItems.indexOf(opt);
                  const isActive = flatIdx === activeIdx;
                  return (
                    <button
                      key={opt.type}
                      className={"n8n-addmenu-item" + (isActive ? " active" : "")}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={() => setActiveIdx(flatIdx)}
                      style={{ "--accent": NODE_COLORS[opt.type] } as React.CSSProperties}
                    >
                      <span className="n8n-addmenu-item-icon" style={{ color: NODE_COLORS[opt.type] }}>
                        {opt.icon}
                      </span>
                      <span className="n8n-addmenu-item-text">
                        <span className="n8n-addmenu-item-name">{opt.label}</span>
                        {opt.desc && <span className="n8n-addmenu-item-desc">{opt.desc}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="n8n-addmenu-empty">No se encontraron nodos</div>
          )}
        </div>
      </div>
    </>
  );
}
export default StepAddMenu;
