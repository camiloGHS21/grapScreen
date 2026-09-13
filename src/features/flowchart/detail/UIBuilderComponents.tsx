import React from "react";
import { Plus, Trash2, Copy, ArrowUp, ArrowDown, Settings, GripVertical } from "lucide-react";
import type { UIElement, UIElementType } from "../../../types";
import { COLOR_PRESETS, PALETTE } from "./UIBuilderTemplates";

export { PropRow, ColorInput, PropsPanel } from "./UIBuilderPropsPanel";

export function CanvasEl({
  el, sel, onSel, depth, onAddInside, onAddAfter, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown
}: {
  el: UIElement;
  sel: string | null;
  onSel: (id: string) => void;
  depth: number;
  onAddInside: (cid: string, t: UIElementType) => void;
  onAddAfter: (aid: string, t: UIElementType) => void;
  onUpdate?: (id: string, fn: (e: UIElement) => UIElement) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
}) {
  const p = el.props;
  const [isEditing, setIsEditing] = React.useState(false);
  const st: React.CSSProperties = { color: p.color || "var(--text)", backgroundColor: p.bgColor === "transparent" ? undefined : p.bgColor, fontSize: p.fontSize, fontWeight: p.fontWeight, textAlign: p.align, width: p.width, height: p.height, padding: p.padding, borderRadius: p.borderRadius };
  const isSel = sel === el.id;

  const handleInlineChange = (key: string, value: string) => {
    if (onUpdate) {
      onUpdate(el.id, (e) => ({ ...e, props: { ...e.props, [key]: value } }));
    }
  };

  const inner = () => {
    if (isEditing && ["header", "label", "button", "checkbox"].includes(el.type)) {
      return (
        <input
          autoFocus
          type="text"
          className="ub-input"
          style={{ ...st, border: "2px solid var(--red)", background: "var(--s1)" }}
          value={p.text || ""}
          onChange={(e) => handleInlineChange("text", e.target.value)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(e) => { if (e.key === "Enter") setIsEditing(false); }}
        />
      );
    }

    if (isEditing && ["input", "textarea"].includes(el.type)) {
      return (
        <input
          autoFocus
          type="text"
          className="ub-input"
          style={{ ...st, border: "2px solid var(--red)", background: "var(--s1)" }}
          value={p.placeholder || ""}
          onChange={(e) => handleInlineChange("placeholder", e.target.value)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(e) => { if (e.key === "Enter") setIsEditing(false); }}
        />
      );
    }

    if (isEditing && el.type === "select") {
      return (
        <input
          autoFocus
          type="text"
          className="ub-input"
          style={{ ...st, border: "2px solid var(--red)", background: "var(--s1)" }}
          value={p.options || ""}
          onChange={(e) => handleInlineChange("options", e.target.value)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(e) => { if (e.key === "Enter") setIsEditing(false); }}
        />
      );
    }

    switch (el.type) {
      case "container": {
        const isGrid = el.direction === "grid" || el.direction === "grid2" || el.direction === "grid3";
        let gridCols = p.gridTemplate;
        if (!gridCols) {
          if (p.gridColumns) gridCols = `repeat(${p.gridColumns}, 1fr)`;
          else if (el.direction === "grid3") gridCols = "repeat(3, 1fr)";
          else if (el.direction === "grid2") gridCols = "repeat(2, 1fr)";
          else gridCols = "repeat(2, 1fr)";
        }

        const flexDir = p.flexDirection || (el.direction === "horizontal" ? "row" : "column");
        const defaultWrap = flexDir.includes("row") ? "nowrap" : "wrap";
        const containerStyle: React.CSSProperties = {
          display: isGrid ? "grid" : "flex",
          flexDirection: isGrid ? undefined : flexDir,
          flexWrap: isGrid ? undefined : (p.flexWrap || defaultWrap),
          gridTemplateColumns: isGrid ? gridCols : undefined,
          gap: el.gap ?? 10,
          justifyContent: p.justifyContent || "flex-start",
          alignItems: p.alignItems || "stretch",
          width: p.width || "100%",
          minHeight: 40,
          border: "1px dashed var(--line)",
          borderRadius: p.borderRadius || 6,
          padding: p.padding ?? 8,
          background: p.bgColor === "transparent" ? undefined : p.bgColor
        };

        return (
          <div data-drop={el.id} style={containerStyle}>
            {el.children?.map((c: UIElement) => <CanvasEl key={c.id} el={c} sel={sel} onSel={onSel} depth={depth + 1} onAddInside={onAddInside} onAddAfter={onAddAfter} onUpdate={onUpdate} onDelete={onDelete} onDuplicate={onDuplicate} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />)}
            {(!el.children || el.children.length === 0) && (
              <div className="ub-empty-cont" data-drop={el.id}>
                <Plus size={14} />
                <span>Agregar campo aquí ({flexDir})</span>
              </div>
            )}
          </div>
        );
      }
      case "header": return <h3 style={st} title="Doble clic para editar texto">{p.text}</h3>;
      case "label": return <span style={st} title="Doble clic para editar texto">{p.text}</span>;
      case "button": return <button style={{ ...st, border: 0, cursor: "pointer" }} title="Doble clic para editar texto">{p.text}</button>;
      case "input": return <input style={{ ...st, border: "1px solid var(--line)", background: "var(--s2)", color: "var(--text)" }} placeholder={p.placeholder} readOnly title="Doble clic para editar placeholder" />;
      case "textarea": return <textarea style={{ ...st, border: "1px solid var(--line)", background: "var(--s2)", color: "var(--text)" }} placeholder={p.placeholder} readOnly rows={2} title="Doble clic para editar placeholder" />;
      case "select": return <select style={{ ...st, border: "1px solid var(--line)", background: "var(--s2)", color: "var(--text)" }} disabled title="Doble clic para editar opciones"><option value="">Seleccionar...</option>{(p.options || "").split(",").map((o: string, i: number) => <option key={i}>{o.trim()}</option>)}</select>;
      case "checkbox": return <label style={{ ...st, display: "flex", alignItems: "center", gap: 6 }} title="Doble clic para editar texto"><input type="checkbox" readOnly /> {p.text}</label>;
      case "image": return <span style={{ fontSize: 32 }}>{p.src}</span>;
      case "colorPicker": return <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: 6, background: p.color, border: "1px solid var(--line)" }} /><span style={{ color: "var(--dim)", fontSize: 12 }}>{p.color}</span></div>;
      case "slider": return <input type="range" defaultValue={parseInt(p.defaultValue || "50")} readOnly style={{ width: p.width }} />;
      case "progressBar": return <div style={{ width: p.width, height: 8, background: "var(--s2)", borderRadius: 4 }}><div style={{ width: `${p.defaultValue || 60}%`, height: "100%", background: p.bgColor || "var(--red)", borderRadius: 4 }} /></div>;
      case "menu": {
        const items = (p.menuItems || "").split(",").map(s => s.trim()).filter(Boolean);
        return (
          <div className="ub-menu-preview" style={{ width: p.width || "100%" }}>
            <div className="ub-menu-preview-handle" />
            <div className="ub-menu-preview-items">
              {items.map((it, i) => <span key={i} className="ub-menu-preview-item">{it}</span>)}
              {items.length === 0 && <span className="ub-menu-preview-item">Sin elementos</span>}
            </div>
          </div>
        );
      }
      case "divider": return <div style={st} />;
      case "spacer": return <div style={st} />;
      default: return null;
    }
  };

  return (
    <div
      data-drop={el.type === "container" ? el.id : undefined}
      className={`ub-canvas-el${isSel ? " selected" : ""}`}
      onClick={(e) => { e.stopPropagation(); onSel(el.id); }}
      onDoubleClick={(e) => { e.stopPropagation(); onSel(el.id); setIsEditing(true); }}
      style={{ marginLeft: depth > 0 ? 4 : 0, position: "relative" }}
    >
      {inner()}

      {/* Jotform & Form Builder style floating side action toolbar */}
      {isSel && (
        <div className="ub-floating-actions" onClick={(e) => e.stopPropagation()}>
          <div className="ub-floating-grip" title="Arrastrar campo"><GripVertical size={13} /></div>
          {onMoveUp && <button type="button" className="ub-float-btn" onClick={() => onMoveUp(el.id)} title="Subir campo (Mover arriba)"><ArrowUp size={13} /></button>}
          {onMoveDown && <button type="button" className="ub-float-btn" onClick={() => onMoveDown(el.id)} title="Bajar campo (Mover abajo)"><ArrowDown size={13} /></button>}
          <button type="button" className="ub-float-btn" onClick={() => setIsEditing(true)} title="Editar texto (Doble clic)"><Settings size={13} /></button>
          {onDuplicate && <button type="button" className="ub-float-btn" onClick={() => onDuplicate(el.id)} title="Duplicar campo (Ctrl+D)"><Copy size={13} /></button>}
          {onDelete && <button type="button" className="ub-float-btn ub-float-danger" onClick={() => onDelete(el.id)} title="Eliminar campo (Supr)"><Trash2 size={13} /></button>}
        </div>
      )}

      {isSel && el.type === "container" && (
        <div className="ub-add-inside" onClick={(e) => { e.stopPropagation(); }}>
          <span>Añadir dentro:</span>
          {PALETTE.slice(0, 6).map(item => <button key={item.type} type="button" className="ub-mini-add" onClick={() => onAddInside(el.id, item.type)} title={item.label}>{item.icon}</button>)}
        </div>
      )}
      {isSel && (
        <div className="ub-add-after" onClick={(e) => { e.stopPropagation(); }}>
          <span>Añadir después:</span>
          {PALETTE.slice(0, 6).map(item => <button key={item.type} type="button" className="ub-mini-add" onClick={() => onAddAfter(el.id, item.type)} title={item.label}>{item.icon}</button>)}
        </div>
      )}
    </div>
  );
}
