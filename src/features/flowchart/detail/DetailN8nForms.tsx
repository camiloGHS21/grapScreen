import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RecordedEvent, UIElement, UIScreen } from "../../../types";
import { UIBuilderEditor } from "./UIBuilderEditor";
import { IntegrationDetailForm } from "./IntegrationDetailForm";
import { HotkeyCaptureForm } from "./HotkeyCaptureForm";
import { TriggerDetailForm } from "./TriggerDetailForm";

export { IntegrationDetailForm, HotkeyCaptureForm, TriggerDetailForm };

interface FormProps {
  ev: RecordedEvent;
  idx: number;
  updateSubEvent: (idx: number, key: string, val: any) => void;
}

export function WebhookDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Ruta Webhook</span>
        <input type="text" className="ndp-input" value={ev.data.path || ""} onChange={e => updateSubEvent(idx, "path", e.target.value)} placeholder="/webhook" />
      </div>
      <div className="ndp-field">
        <span className="ndp-field-label">Método HTTP</span>
        <select className="ndp-select" value={ev.data.method || "POST"} onChange={e => updateSubEvent(idx, "method", e.target.value)}>
          <option value="POST">POST</option>
          <option value="GET">GET</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
    </>
  );
}

export function HttpRequestDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Método</span>
        <select className="ndp-select" value={ev.data.method || "GET"} onChange={e => updateSubEvent(idx, "method", e.target.value)}>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
      <div className="ndp-field ndp-field-grow">
        <span className="ndp-field-label">URL</span>
        <input type="text" className="ndp-input" value={ev.data.url || ""} onChange={e => updateSubEvent(idx, "url", e.target.value)} placeholder="https://api.com" />
      </div>
      <div className="ndp-field ndp-field-full">
        <span className="ndp-field-label">Headers (JSON)</span>
        <input type="text" className="ndp-input" value={ev.data.headers || "{}"} onChange={e => updateSubEvent(idx, "headers", e.target.value)} placeholder="{}" />
      </div>
      {ev.data.method !== "GET" && (
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Cuerpo (Body)</span>
          <textarea className="ndp-textarea" value={ev.data.body || ""} onChange={e => updateSubEvent(idx, "body", e.target.value)} rows={2} />
        </div>
      )}
    </>
  );
}

export function SwitchDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Campo a evaluar</span>
        <input type="text" className="ndp-input" value={ev.data.field || ""} onChange={e => updateSubEvent(idx, "field", e.target.value)} placeholder="status" />
      </div>
      <div className="ndp-field ndp-field-full">
        <span className="ndp-field-label">Casos (JSON)</span>
        <textarea className="ndp-textarea" value={JSON.stringify(ev.data.cases || [], null, 0)} onChange={e => { try { updateSubEvent(idx, "cases", JSON.parse(e.target.value)); } catch (err) {} }} rows={2} />
      </div>
    </>
  );
}
export function WaitDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Segundos</span>
        <input type="number" className="ndp-input ndp-input-sm" value={ev.data.seconds || 5} onChange={e => updateSubEvent(idx, "seconds", parseInt(e.target.value) || 5)} min="1" />
      </div>
      <div className="ndp-field">
        <span className="ndp-field-label">Reanudar en</span>
        <select className="ndp-select" value={ev.data.resume_on || "timeout"} onChange={e => updateSubEvent(idx, "resume_on", e.target.value)}>
          <option value="timeout">Timeout</option>
          <option value="event">Evento</option>
        </select>
      </div>
    </>
  );
}

export function CodeDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Lenguaje</span>
        <select className="ndp-select" value={ev.data.language || "javascript"} onChange={e => updateSubEvent(idx, "language", e.target.value)}>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
        </select>
      </div>
      <div className="ndp-field ndp-field-full">
        <span className="ndp-field-label">Código</span>
        <textarea className="ndp-textarea" value={ev.data.code || ""} onChange={e => updateSubEvent(idx, "code", e.target.value)} rows={4} placeholder="// Tu código aquí" />
      </div>
    </>
  );
}
export function ErrorHandlerDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <>
      <div className="ndp-field">
        <span className="ndp-field-label">Acción</span>
        <select className="ndp-select" value={ev.data.action || "retry"} onChange={e => updateSubEvent(idx, "action", e.target.value)}>
          <option value="retry">Reintentar</option>
          <option value="ignore">Ignorar y continuar</option>
          <option value="stop">Detener ejecución</option>
        </select>
      </div>
      <div className="ndp-field">
        <span className="ndp-field-label">Intentos máx.</span>
        <input type="number" className="ndp-input ndp-input-sm" value={ev.data.max_retries || 3} onChange={e => updateSubEvent(idx, "max_retries", parseInt(e.target.value) || 0)} min="0" />
      </div>
    </>
  );
}

export function FileChangeDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  const [picking, setPicking] = React.useState(false);
  const handlePick = async () => {
    setPicking(true);
    try {
      const folder = await invoke<string | null>("pick_folder");
      if (folder) updateSubEvent(idx, "path", folder);
    } catch (e) {
      console.error("pick_folder error:", e);
    } finally {
      setPicking(false);
    }
  };
  return (
    <>
      <div className="ndp-field ndp-field-full">
        <span className="ndp-field-label">Ruta carpeta / archivo</span>
        <div className="ndp-path-row">
          <input type="text" className="ndp-input" value={ev.data.path || ""} onChange={e => updateSubEvent(idx, "path", e.target.value)} placeholder="C:\ruta\a\carpeta" />
          <button type="button" className="ndp-pick-btn" onClick={handlePick} disabled={picking} title="Abrir explorador">
            📁
          </button>
        </div>
      </div>
      <div className="ndp-field">
        <span className="ndp-field-label">Evento</span>
        <select className="ndp-select" value={ev.data.event || "Modify"} onChange={e => updateSubEvent(idx, "event", e.target.value)}>
          <option value="Create">Creado</option>
          <option value="Modify">Modificado</option>
          <option value="Delete">Eliminado</option>
          <option value="Any">Cualquiera</option>
        </select>
      </div>
    </>
  );
}



export function MergeDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  return (
    <div className="ndp-field">
      <span className="ndp-field-label">Modo de combinación</span>
      <select className="ndp-select" value={ev.data.mode || "append"} onChange={e => updateSubEvent(idx, "mode", e.target.value)}>
        <option value="append">Añadir (Append)</option>
        <option value="combine">Combinar (Combine)</option>
        <option value="chooseFirst">Primer resultado</option>
      </select>
    </div>
  );
}

export function FormDetailForm({ ev, idx, updateSubEvent }: FormProps) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const screen: UIScreen = ev.data.screen || { title: "Mi Formulario", width: 420, height: 400, bgColor: "#1a1a2e", elements: [] };
  const elementCount = screen.elements ? countElements(screen.elements) : 0;
  return (
    <>
      <div className="ndp-field ndp-field-full">
        <span className="ndp-field-label">Diseñador de UI ({elementCount} componentes)</span>
        <button type="button" className="ndp-ui-btn" onClick={() => setBuilderOpen(true)}>
          🎨 Abrir UI Builder
        </button>
      </div>
      {builderOpen && (
        <UIBuilderEditor
          initialScreen={screen}
          onSave={(newScreen) => { updateSubEvent(idx, "screen", newScreen); updateSubEvent(idx, "fields", screenToFields(newScreen)); setBuilderOpen(false); }}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </>
  );
}

function countElements(els: UIElement[]): number {
  return els.reduce((sum, el) => sum + 1 + (el.children ? countElements(el.children) : 0), 0);
}

function screenToFields(screen: UIScreen): any[] {
  const fields: any[] = [];
  function collect(els: UIElement[]) {
    for (const el of els) {
      if (el.props.outputVar) {
        fields.push({ id: el.props.outputVar, label: el.name, type: el.type === "input" ? "text" : el.type, required: false, defaultValue: el.props.defaultValue || "" });
      }
      if (el.children) collect(el.children);
    }
  }
  collect(screen.elements);
  (screen.screens || []).forEach(s => collect(s.elements));
  return fields;
}

export function StartupDetailForm(_: FormProps) {
  return (
    <div className="ndp-field ndp-field-full">
      <p className="ndp-hint">Este nodo inicia la automatización al arrancar el agente de escritorio. No requiere configuración adicional.</p>
    </div>
  );
}