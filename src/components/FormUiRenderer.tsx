import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UIElement, UIScreen } from "../types";

interface FormField {
  id: string;
  label: string;
  type: "text" | "password" | "email" | "number" | "phone" | "toggle" | "select";
  options?: string;
  required: boolean;
  defaultValue?: string;
}

interface FormUiRendererProps {
  fields: any;
  onClose: () => void;
}

function RenderUIElement({ el, values, setVal, screens, onNavigate }: { el: UIElement; values: Record<string, string>; setVal: (id: string, v: string) => void; screens?: UIScreen[]; onNavigate: (s: UIScreen) => void }) {
  const p = el.props;
  const style: React.CSSProperties = {
    color: p.color, backgroundColor: p.bgColor === "transparent" ? undefined : p.bgColor,
    fontSize: p.fontSize, fontWeight: p.fontWeight, textAlign: p.align,
    width: p.width, height: p.height, padding: p.padding, borderRadius: p.borderRadius,
  };
  switch (el.type) {
    case "container": return <div style={{ display: el.direction === "horizontal" ? "flex" : "block", flexDirection: el.direction === "horizontal" ? "row" : "column", gap: el.gap, width: "100%" }}>{el.children?.map(c => <RenderUIElement key={c.id} el={c} values={values} setVal={setVal} screens={screens} onNavigate={onNavigate} />)}</div>;
    case "header": return <h3 style={style}>{p.text}</h3>;
    case "label": return <span style={style}>{p.text}</span>;
    case "button": return <button type="button" style={{ ...style, border: 0, cursor: "pointer" }} onClick={() => { if (p.outputVar) setVal(p.outputVar, "clicked"); }}>{p.text}</button>;
    case "input": return <input style={{ ...style, border: "1px solid #444458" }} placeholder={p.placeholder} value={p.outputVar ? values[p.outputVar] || "" : undefined} onChange={e => p.outputVar && setVal(p.outputVar, e.target.value)} />;
    case "textarea": return <textarea style={{ ...style, border: "1px solid #444458" }} placeholder={p.placeholder} value={p.outputVar ? values[p.outputVar] || "" : undefined} onChange={e => p.outputVar && setVal(p.outputVar, e.target.value)} rows={3} />;
    case "select": return <select style={{ ...style, border: "1px solid #444458" }} value={p.outputVar ? values[p.outputVar] || "" : undefined} onChange={e => p.outputVar && setVal(p.outputVar, e.target.value)}><option value="">Seleccionar...</option>{(p.options || "").split(",").map((o: string, i: number) => <option key={i} value={o.trim()}>{o.trim()}</option>)}</select>;
    case "checkbox": return <label style={{ ...style, display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={p.outputVar ? values[p.outputVar] === "true" : false} onChange={e => p.outputVar && setVal(p.outputVar, e.target.checked ? "true" : "false")} />{p.text}</label>;
    case "image": return <span style={{ fontSize: 32 }}>{p.src}</span>;
    case "colorPicker": return <div style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="color" value={p.outputVar ? values[p.outputVar] || p.color || "#000000" : p.color} onChange={e => p.outputVar && setVal(p.outputVar, e.target.value)} style={{ width: 36, height: 30, border: "1px solid #555", borderRadius: 6 }} /><span style={{ color: "#a0a0b0", fontSize: 12 }}>{p.outputVar ? values[p.outputVar] || p.color : p.color}</span></div>;
    case "slider": return <input type="range" min="0" max="100" value={p.outputVar ? parseInt(values[p.outputVar] || p.defaultValue || "50") : parseInt(p.defaultValue || "50")} onChange={e => p.outputVar && setVal(p.outputVar, e.target.value)} style={{ width: p.width }} />;
    case "progressBar": return <div style={{ width: p.width, height: 8, background: "#333348", borderRadius: 4 }}><div style={{ width: `${p.defaultValue || 60}%`, height: "100%", background: p.bgColor, borderRadius: 4 }} /></div>;
    case "menu": return null;
    case "divider": return <div style={style} />;
    case "spacer": return <div style={style} />;
    default: return null;
  }
}
function ScreenView({ screen, values, setVal, onSubmit, onCancel }: { screen: UIScreen; values: Record<string, string>; setVal: (id: string, v: string) => void; onSubmit: (e: React.FormEvent) => void; onCancel: () => void }) {
  const menuEl = screen.elements.find(e => e.type === "menu");
  const baseEls = screen.elements.filter(e => e.type !== "menu");
  const tabs = menuEl ? (menuEl.props.menuItems || "").split(",").map(s => s.trim()).filter(Boolean) : [];
  const [selected, setSelected] = React.useState<string | null>(tabs[0] ?? null);
  React.useEffect(() => {
    setSelected(prev => (prev && tabs.includes(prev)) ? prev : (tabs[0] ?? null));
  }, [tabs.join("|")]);
  const sub = selected ? (screen.screens?.find(s => s.title === selected) ?? null) : null;
  const subEls = sub ? sub.elements.filter(e => e.type !== "menu") : [];
  const shownEls = [...baseEls, ...subEls];
  const leaf = !sub || !sub.screens || sub.screens.length === 0;
  return (
    <div className="form-renderer-card ub-nav-card" style={{ background: screen.bgGradient || screen.bgColor, width: screen.width, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)" }}>
      <div className="ub-nav-content">
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shownEls.map(el => <RenderUIElement key={el.id} el={el} values={values} setVal={setVal} screens={sub ? sub.screens : screen.screens} onNavigate={() => {}} />)}
          {leaf && (
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="button" className="quiet" onClick={onCancel} style={{ flex: 1 }}>Cancelar</button>
              <button type="submit" className="save" style={{ flex: 1 }}>Confirmar</button>
            </div>
          )}
        </form>
      </div>
      {tabs.length > 0 && (
        <div className="ub-bottom-nav">
          {tabs.map(t => (
            <button key={t} type="button" className={`ub-nav-item${selected === t ? " active" : ""}`} onClick={() => setSelected(t)}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FormUiRenderer({ fields, onClose }: FormUiRendererProps) {
  const screen: UIScreen | null = fields?.screen || null;
  const oldFields: FormField[] = Array.isArray(fields) ? fields : (fields?.fields || []);

  // La navegación de submenús (barra inferior estilo Android) se gestiona en <ScreenView/>.

  const [formResponses, setFormResponses] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (screen) {
      function collect(els: UIElement[]) {
        for (const el of els) {
          if (el.props.outputVar) initial[el.props.outputVar] = el.props.defaultValue || "";
          if (el.children) collect(el.children);
        }
      }
      collect(screen.elements);
    } else {
      oldFields.forEach(f => { initial[f.id] = f.defaultValue || (f.type === "toggle" ? "false" : ""); });
    }
    return initial;
  });

  const setVal = (id: string, v: string) => setFormResponses(prev => ({ ...prev, [id]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await invoke("submit_form_response", { status: "success", values: formResponses }); onClose(); }
    catch (err) { console.error(err); }
  };
  const handleCancel = async () => {
    try { await invoke("submit_form_response", { status: "cancelled", values: {} }); onClose(); }
    catch (err) { console.error(err); }
  };

  if (screen) {
    return (
      <div className="form-renderer-overlay">
        <ScreenView screen={screen} values={formResponses} setVal={setVal} onSubmit={handleSubmit} onCancel={handleCancel} />
      </div>
    );
  }

  return (
    <div className="form-renderer-overlay">
      <div className="form-renderer-card">
        <div className="form-renderer-header"><h2>Formulario de Configuración</h2><p>Introduce los datos requeridos para iniciar la automatización.</p></div>
        <form onSubmit={handleSubmit} className="form-renderer-body">
          {oldFields.map((field) => (
            <div key={field.id} className={`form-renderer-item ${field.type === "toggle" ? "form-renderer-toggle" : ""}`}>
              {field.type !== "toggle" ? (
                <>
                  <label htmlFor={field.id}>{field.label}{field.required && <span className="required">*</span>}</label>
                  {field.type === "select" ? (
                    <select id={field.id} value={formResponses[field.id] || ""} onChange={e => setVal(field.id, e.target.value)} required={field.required}>
                      <option value="">Seleccionar...</option>
                      {(field.options || "").split(",").map((opt: string) => <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>)}
                    </select>
                  ) : (
                    <input id={field.id} type={field.type} value={formResponses[field.id] || ""} onChange={e => setVal(field.id, e.target.value)} required={field.required} placeholder={`Ingresar ${field.label.toLowerCase()}`} />
                  )}
                </>
              ) : (
                <>
                  <label htmlFor={field.id}>{field.label}{field.required && <span className="required">*</span>}</label>
                  <input id={field.id} type="checkbox" checked={formResponses[field.id] === "true"} onChange={e => setVal(field.id, e.target.checked ? "true" : "false")} />
                </>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button type="button" className="quiet" onClick={handleCancel} style={{ flex: 1 }}>Cancelar</button>
            <button type="submit" className="save" style={{ flex: 1 }}>Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default FormUiRenderer;