import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import { RecordedEvent } from "../../../types";

async function pickExcelFile(format: string): Promise<string | null> {
  try {
    return await invoke<string | null>("select_excel_file", { format });
  } catch {
    return null;
  }
}

interface FormProps {
  ev: RecordedEvent;
  idx: number;
  updateSubEvent: (idx: number, key: string, val: any) => void;
}

export function IntegrationDetailForm({ ev, idx, updateSubEvent, type }: FormProps & { type: string }) {
  if (type === "google_sheets") {
    return (
      <>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Spreadsheet ID</span>
          <input type="text" className="ndp-input" value={ev.data.spreadsheet_id || ""} onChange={e => updateSubEvent(idx, "spreadsheet_id", e.target.value)} />
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Rango</span>
          <input type="text" className="ndp-input" value={ev.data.range || "Sheet1!A:Z"} onChange={e => updateSubEvent(idx, "range", e.target.value)} />
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Operación</span>
          <select className="ndp-select" value={ev.data.operation || "read"} onChange={e => updateSubEvent(idx, "operation", e.target.value)}>
            <option value="read">Leer</option>
            <option value="append">Añadir fila</option>
            <option value="update">Actualizar</option>
          </select>
        </div>
        {ev.data.operation !== "read" && (
          <div className="ndp-field ndp-field-full">
            <span className="ndp-field-label">Valores (JSON o CSV)</span>
            <textarea className="ndp-textarea" value={ev.data.values || ""} onChange={e => updateSubEvent(idx, "values", e.target.value)} rows={2} placeholder='[["Nombre","Edad"],["Ana",30]]' />
          </div>
        )}
      </>
    );
  }
  if (type === "whatsapp") {
    return (
      <>
        <div className="ndp-field">
          <span className="ndp-field-label">Tipo de API</span>
          <select className="ndp-select" value={ev.data.api_type || "web"} onChange={e => updateSubEvent(idx, "api_type", e.target.value)}>
            <option value="web">Web (WhatsApp Web)</option>
            <option value="api">API oficial</option>
          </select>
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Destinatario</span>
          <input type="text" className="ndp-input" value={ev.data.to || ""} onChange={e => updateSubEvent(idx, "to", e.target.value)} placeholder="+34..." />
        </div>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Mensaje</span>
          <textarea className="ndp-textarea" value={ev.data.message || ""} onChange={e => updateSubEvent(idx, "message", e.target.value)} rows={2} />
        </div>
      </>
    );
  }
  if (type === "telegram") {
    return (
      <>
        <div className="ndp-field">
          <span className="ndp-field-label">Chat ID</span>
          <input type="text" className="ndp-input" value={ev.data.chat_id || ""} onChange={e => updateSubEvent(idx, "chat_id", e.target.value)} />
        </div>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Mensaje</span>
          <textarea className="ndp-textarea" value={ev.data.message || ""} onChange={e => updateSubEvent(idx, "message", e.target.value)} rows={2} />
        </div>
      </>
    );
  }
  if (type === "ai_agent") {
    return (
      <>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Prompt</span>
          <textarea className="ndp-textarea" value={ev.data.prompt || ""} onChange={e => updateSubEvent(idx, "prompt", e.target.value)} rows={3} placeholder="¿Qué quieres que haga la IA?" />
        </div>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Instrucciones del sistema</span>
          <textarea className="ndp-textarea" value={ev.data.system_prompt || ""} onChange={e => updateSubEvent(idx, "system_prompt", e.target.value)} rows={2} placeholder="Eres un asistente útil..." />
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Modelo</span>
          <select className="ndp-select" value={ev.data.model || "gpt-4o-mini"} onChange={e => updateSubEvent(idx, "model", e.target.value)}>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="deepseek-chat">DeepSeek Chat</option>
            <option value="gemini-flash">Gemini Flash</option>
          </select>
        </div>
        <div className="ndp-field">
          <span className="ndp-field-label">Var. salida</span>
          <input type="text" className="ndp-input" value={ev.data.output_var || "ai_response"} onChange={e => updateSubEvent(idx, "output_var", e.target.value)} />
        </div>
      </>
    );
  }
  if (type === "google_docs") {
    return (
      <>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Document ID</span>
          <input type="text" className="ndp-input" value={ev.data.document_id || ""} onChange={e => updateSubEvent(idx, "document_id", e.target.value)} />
        </div>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Texto a insertar</span>
          <textarea className="ndp-textarea" value={ev.data.text || ""} onChange={e => updateSubEvent(idx, "text", e.target.value)} rows={3} />
        </div>
      </>
    );
  }
  if (type === "excel_local") {
    const isXlsx = (ev.data.format || "csv") === "xlsx";
    return (
      <>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Formato</span>
          <select className="ndp-select" value={ev.data.format || "csv"} onChange={e => updateSubEvent(idx, "format", e.target.value)}>
            <option value="csv">CSV (.csv)</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>
        </div>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Ruta del archivo</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" className="ndp-input" style={{ flex: 1 }} value={ev.data.file_path || ""} onChange={e => updateSubEvent(idx, "file_path", e.target.value)} placeholder={isXlsx ? "registro.xlsx o C:/ruta/registro.xlsx" : "registro.csv o C:/ruta/registro.csv"} />
            <button type="button" onClick={async () => { const p = await pickExcelFile(isXlsx ? "xlsx" : "csv"); if (p) updateSubEvent(idx, "file_path", p); }} className="ndp-btn ndp-btn-browse" title="Seleccionar o crear archivo">
              <FolderOpen size={14} /> Examinar
            </button>
          </div>
        </div>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Encabezados (matriz JSON)</span>
          <input type="text" className="ndp-input" value={ev.data.header || ""} onChange={e => updateSubEvent(idx, "header", e.target.value)} placeholder='["Nombre","Email"]' />
        </div>
        <div className="ndp-field ndp-field-full">
          <span className="ndp-field-label">Valores (matriz JSON)</span>
          <textarea className="ndp-textarea" value={ev.data.values || ""} onChange={e => updateSubEvent(idx, "values", e.target.value)} rows={3} placeholder='[["Ana","ana@mail.com"]]' />
        </div>
        {!isXlsx && (
          <div className="ndp-field">
            <span className="ndp-field-label">Separador</span>
            <select className="ndp-select" value={ev.data.delimiter || ","} onChange={e => updateSubEvent(idx, "delimiter", e.target.value)}>
              <option value=",">Coma (,)</option>
              <option value=";">Punto y coma (;)</option>
              <option value="\t">Tabulación</option>
            </select>
          </div>
        )}
        <div className="ndp-field">
          <label className="ndp-checkbox"><input type="checkbox" checked={!!ev.data.overwrite} onChange={e => updateSubEvent(idx, "overwrite", e.target.checked)} /> Sobrescribir archivo</label>
        </div>
        <p className="ndp-hint">Usa {"{{ variable }}"} para insertar los datos del formulario. Si no sobrescribe, cada ejecución añade una fila nueva.</p>
      </>
    );
  }
  return null;
}
