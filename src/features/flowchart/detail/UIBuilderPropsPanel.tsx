import React from "react";
import { ArrowUp, ArrowDown, Copy, Trash2 } from "lucide-react";
import type { UIElement } from "../../../types";
import { COLOR_PRESETS } from "./UIBuilderTemplates";

export function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="ub-prop-row"><label className="ub-prop-label">{label}</label><div className="ub-prop-input">{children}</div></div>;
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="ub-color-row">
      <input type="color" value={value === "transparent" ? "#000000" : value} onChange={e => onChange(e.target.value)} className="ub-color-native" />
      <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} className="ub-input-sm" />
      <div className="ub-color-presets">{COLOR_PRESETS.map(c => <button key={c} type="button" className="ub-color-swatch" style={{ background: c === "transparent" ? "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 50% / 8px 8px" : c }} onClick={() => onChange(c)} title={c} />)}</div>
    </div>
  );
}

export function PropsPanel({
  el, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown
}: {
  el: UIElement | null;
  onUpdate: (id: string, fn: (e: UIElement) => UIElement) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [tab, setTab] = React.useState<"edit" | "json" | "code">("edit");
  if (!el) return <div className="ub-props-empty"><p>Selecciona un componente<br />para editar sus propiedades</p></div>;
  const p = el.props;
  const set = (k: string, v: any) => onUpdate(el.id, (e: UIElement) => ({ ...e, props: { ...e.props, [k]: v } }));

  return (
    <div className="ub-props">
      <div className="ub-props-head">
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span className="ub-props-title">{el.name}</span>
          <span className="ub-props-type">{el.type}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {onMoveUp && <button type="button" className="ub-tb-btn" onClick={onMoveUp} title="Subir (Arriba)"><ArrowUp size={12} /></button>}
          {onMoveDown && <button type="button" className="ub-tb-btn" onClick={onMoveDown} title="Bajar (Abajo)"><ArrowDown size={12} /></button>}
          {onDuplicate && <button type="button" className="ub-tb-btn" onClick={onDuplicate} title="Duplicar (Ctrl+D)"><Copy size={12} /></button>}
          {onDelete && <button type="button" className="ub-tb-btn ub-tb-danger" onClick={onDelete} title="Eliminar (Supr)"><Trash2 size={12} /></button>}
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid var(--line)", background: "var(--s2)", padding: "4px 8px", gap: 4 }}>
        <button type="button" className={`ub-tab-pill${tab === "edit" ? " active" : ""}`} onClick={() => setTab("edit")}>Propiedades</button>
        <button type="button" className={`ub-tab-pill${tab === "json" ? " active" : ""}`} onClick={() => setTab("json")}>JSON</button>
        <button type="button" className={`ub-tab-pill${tab === "code" ? " active" : ""}`} onClick={() => setTab("code")}>Código</button>
      </div>

      {tab === "json" && (
        <pre style={{ margin: 0, padding: 12, fontSize: 11, background: "var(--s1)", color: "var(--text)", overflow: "auto", flex: 1 }}>
          {JSON.stringify(el, null, 2)}
        </pre>
      )}

      {tab === "code" && (
        <pre style={{ margin: 0, padding: 12, fontSize: 11, background: "var(--s1)", color: "var(--dim)", overflow: "auto", flex: 1 }}>
          {`<${el.type} name="${el.name}" outputVar="${p.outputVar || ''}" />`}
        </pre>
      )}

      {tab === "edit" && (
        <div className="ub-props-body">
          <PropRow label="Nombre"><input type="text" className="ub-input" value={el.name} onChange={e => onUpdate(el.id, (e2: UIElement) => ({ ...e2, name: e.target.value }))} /></PropRow>
          {["header","label","button","checkbox"].includes(el.type) && <PropRow label="Texto"><input type="text" className="ub-input" value={p.text || ""} onChange={e => set("text", e.target.value)} /></PropRow>}
          {el.type === "menu" && <PropRow label="Elementos del menú (coma)"><input type="text" className="ub-input" value={p.menuItems || ""} onChange={e => set("menuItems", e.target.value)} /></PropRow>}
          {el.type === "menu" && <div className="ub-prop-note">Cada elemento es una pestaña de navegación. Crea subpantallas con “+ Sub” en la barra superior.</div>}
          {["input","textarea"].includes(el.type) && <PropRow label="Placeholder"><input type="text" className="ub-input" value={p.placeholder || ""} onChange={e => set("placeholder", e.target.value)} /></PropRow>}
          {el.type === "select" && <PropRow label="Opciones (coma)"><input type="text" className="ub-input" value={p.options || ""} onChange={e => set("options", e.target.value)} /></PropRow>}
          {el.type === "image" && <PropRow label="Emoji / Texto"><input type="text" className="ub-input" value={p.src || ""} onChange={e => set("src", e.target.value)} /></PropRow>}
          {["slider","progressBar"].includes(el.type) && <PropRow label="Valor inicial"><input type="number" className="ub-input-sm" value={parseInt(p.defaultValue || "0")} onChange={e => set("defaultValue", String(e.target.value))} /></PropRow>}
          {el.type === "container" && (<>
            <PropRow label="Modo Layout (CSS)"><select className="ub-select" value={(el.direction === "grid2" || el.direction === "grid3") ? "grid" : (el.direction || "vertical")} onChange={e => onUpdate(el.id, (e2: UIElement) => ({ ...e2, direction: e.target.value as any }))}><option value="vertical">Flexbox (Flexible)</option><option value="grid">Grid (CSS Grid)</option></select></PropRow>
            {el.direction !== "grid" && (<>
              <PropRow label="Dirección Flex"><select className="ub-select" value={p.flexDirection || (el.direction === "horizontal" ? "row" : "column")} onChange={e => { const val = e.target.value; const isRow = val.includes("row"); set("flexDirection", val); set("flexWrap", isRow ? "nowrap" : "wrap"); onUpdate(el.id, e2 => ({ ...e2, direction: isRow ? "horizontal" : "vertical", props: { ...e2.props, flexDirection: val as any, flexWrap: isRow ? "nowrap" : "wrap" } })); }}><option value="column">Columna (Vertical ↕️)</option><option value="row">Fila (Horizontal ↔️)</option><option value="column-reverse">Columna Inversa</option><option value="row-reverse">Fila Inversa</option></select></PropRow>
              <PropRow label="Ajuste multilínea (Wrap)"><select className="ub-select" value={p.flexWrap || ((p.flexDirection || (el.direction === "horizontal" ? "row" : "column")).includes("row") ? "nowrap" : "wrap")} onChange={e => set("flexWrap", e.target.value)}><option value="nowrap">nowrap (Sin ajuste en 1 línea)</option><option value="wrap">wrap (Ajustar automáticamente multilínea)</option></select></PropRow>
            </>)}
            {(el.direction === "grid" || el.direction === "grid2" || el.direction === "grid3") && (<>
              <PropRow label="Columnas Grid (1 a 12)"><select className="ub-select" value={p.gridColumns || (el.direction === "grid3" ? 3 : 2)} onChange={e => set("gridColumns", parseInt(e.target.value))}><option value={1}>1 Columna</option><option value={2}>2 Columnas</option><option value={3}>3 Columnas</option><option value={4}>4 Columnas</option><option value={5}>5 Columnas</option><option value={6}>6 Columnas</option><option value={12}>12 Columnas</option></select></PropRow>
              <PropRow label="Template Grid CSS (Avanzado)"><input type="text" className="ub-input-sm" value={p.gridTemplate || ""} onChange={e => set("gridTemplate", e.target.value)} placeholder="repeat(4, 1fr) o 1fr 2fr" /></PropRow>
            </>)}
            <PropRow label="Justify Content (CSS)"><select className="ub-select" value={p.justifyContent || "flex-start"} onChange={e => set("justifyContent", e.target.value)}><option value="flex-start">flex-start (Inicio)</option><option value="center">center (Centro)</option><option value="flex-end">flex-end (Final)</option><option value="space-between">space-between (Distribuido)</option><option value="space-around">space-around</option></select></PropRow>
            <PropRow label="Align Items (CSS)"><select className="ub-select" value={p.alignItems || "stretch"} onChange={e => set("alignItems", e.target.value)}><option value="stretch">stretch (Estirar)</option><option value="center">center (Centro)</option><option value="flex-start">flex-start (Arriba)</option><option value="flex-end">flex-end (Abajo)</option></select></PropRow>
            <PropRow label="Espacio (gap px)"><input type="number" className="ub-input-sm" value={el.gap ?? 10} onChange={e => onUpdate(el.id, (e2: UIElement) => ({ ...e2, gap: parseInt(e.target.value) || 0 }))} /></PropRow>
          </>)}
          <PropRow label="Color texto"><ColorInput value={p.color || ""} onChange={v => set("color", v)} /></PropRow>
          <PropRow label="Color fondo"><ColorInput value={p.bgColor || ""} onChange={v => set("bgColor", v)} /></PropRow>
          <PropRow label="Tamaño fuente"><input type="number" className="ub-input-sm" value={p.fontSize || ""} onChange={e => set("fontSize", parseInt(e.target.value) || undefined)} /></PropRow>
          <PropRow label="Grosor fuente"><select className="ub-select" value={p.fontWeight || 400} onChange={e => set("fontWeight", parseInt(e.target.value))}><option value={300}>Ligera</option><option value={400}>Normal</option><option value={500}>Media</option><option value={600}>Semi-negrita</option><option value={700}>Negrita</option></select></PropRow>
          <PropRow label="Alineación"><select className="ub-select" value={p.align || "left"} onChange={e => set("align", e.target.value)}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></PropRow>
          <PropRow label="Ancho"><input type="text" className="ub-input-sm" value={p.width || ""} onChange={e => set("width", e.target.value)} placeholder="100%, auto, 200px" /></PropRow>
          <PropRow label="Padding"><input type="number" className="ub-input-sm" value={p.padding ?? ""} onChange={e => set("padding", parseInt(e.target.value) || undefined)} /></PropRow>
          <PropRow label="Radio esquinas"><input type="number" className="ub-input-sm" value={p.borderRadius ?? ""} onChange={e => set("borderRadius", parseInt(e.target.value) || undefined)} /></PropRow>
          {["input","textarea","select","checkbox","button","colorPicker","slider"].includes(el.type) && <PropRow label="Variable salida"><input type="text" className="ub-input" value={p.outputVar || ""} onChange={e => set("outputVar", e.target.value)} placeholder="mi_variable" /></PropRow>}
        </div>
      )}
    </div>
  );
}
