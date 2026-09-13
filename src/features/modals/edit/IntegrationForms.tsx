import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";

interface GoogleSheetsFormProps {
  editSheetSpreadsheetId: string; setEditSheetSpreadsheetId: (id: string) => void;
  editSheetRange: string; setEditSheetRange: (r: string) => void;
  editSheetValues: string; setEditSheetValues: (v: string) => void;
}
export function GoogleSheetsForm({ editSheetSpreadsheetId, setEditSheetSpreadsheetId, editSheetRange, setEditSheetRange, editSheetValues, setEditSheetValues }: GoogleSheetsFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Spreadsheet ID (Google Sheets ID)</span>
        <input type="text" value={editSheetSpreadsheetId} onChange={e => setEditSheetSpreadsheetId(e.target.value)} placeholder="Ej. 1a2b3c4d5e6f..." />
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Rango / Hoja</span>
          <input type="text" value={editSheetRange} onChange={e => setEditSheetRange(e.target.value)} placeholder="Ej. Hoja1!A:E" />
        </div>
        <div style={{ flex: 2 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Valores (Matriz JSON)</span>
          <input type="text" value={editSheetValues} onChange={e => setEditSheetValues(e.target.value)} placeholder='Ej. [["Juan", "juan@mail.com", "Activo"]]' />
        </div>
      </div>
    </div>
  );
}

interface ExcelLocalFormProps {
  editExcelPath: string; setEditExcelPath: (v: string) => void;
  editExcelHeader: string; setEditExcelHeader: (v: string) => void;
  editExcelValues: string; setEditExcelValues: (v: string) => void;
  editExcelDelimiter: string; setEditExcelDelimiter: (v: string) => void;
  editExcelOverwrite: boolean; setEditExcelOverwrite: (v: boolean) => void;
  editExcelFormat: string; setEditExcelFormat: (v: string) => void;
}
export function ExcelLocalForm({ editExcelPath, setEditExcelPath, editExcelHeader, setEditExcelHeader, editExcelValues, setEditExcelValues, editExcelDelimiter, setEditExcelDelimiter, editExcelOverwrite, setEditExcelOverwrite, editExcelFormat, setEditExcelFormat }: ExcelLocalFormProps) {
  const isXlsx = editExcelFormat === "xlsx";
  const pickFile = async () => {
    try {
      const picked = await invoke<string | null>("select_excel_file", { format: isXlsx ? "xlsx" : "csv" });
      if (picked) setEditExcelPath(picked);
    } catch {
      /* user cancelled */
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Formato</span>
        <select value={editExcelFormat} onChange={e => setEditExcelFormat(e.target.value)}>
          <option value="csv">CSV (.csv)</option>
          <option value="xlsx">Excel (.xlsx)</option>
        </select>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Ruta del archivo</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="text" value={editExcelPath} onChange={e => setEditExcelPath(e.target.value)} placeholder={isXlsx ? "registro.xlsx o C:/ruta/registro.xlsx" : "registro.csv o C:/ruta/registro.csv"} style={{ flex: 1 }} />
          <button type="button" onClick={pickFile} className="ndp-btn ndp-btn-browse" title="Seleccionar o crear archivo">
            <FolderOpen size={14} /> Examinar
          </button>
        </div>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0, marginTop: '-4px' }}>Ruta relativa (ej. <code>registro.csv</code>) se guarda en la carpeta de datos de la app. Para ubicación propia usa ruta absoluta (ej. <code>C:/Users/tu_usuario/Documentos/registro.csv</code>).</p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 2 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Encabezados (matriz JSON)</span>
          <input type="text" value={editExcelHeader} onChange={e => setEditExcelHeader(e.target.value)} placeholder='Ej. ["Nombre","Email"]' />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Separador</span>
          <select value={editExcelDelimiter} onChange={e => setEditExcelDelimiter(e.target.value)} disabled={isXlsx}>
            <option value=",">Coma (,)</option>
            <option value=";">Punto y coma (;)</option>
            <option value="	">Tabulación</option>
          </select>
        </div>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Valores (matriz JSON)</span>
        <textarea value={editExcelValues} onChange={e => setEditExcelValues(e.target.value)} placeholder='Ej. [["Ana","ana@mail.com"]]' style={{ minHeight: '70px' }} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text)' }}>
        <input type="checkbox" checked={editExcelOverwrite} onChange={e => setEditExcelOverwrite(e.target.checked)} />
        Sobrescribir el archivo (si no, añade una fila nueva cada vez)
      </label>
      <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>Escribe <code>{"{{ nombre }}"}</code> para usar los datos del formulario. Funciona sin conexión, sin cuentas.</p>
    </div>
  );
}

interface GoogleDocsFormProps {
  editDocDocumentId: string; setEditDocDocumentId: (id: string) => void;
  editDocText: string; setEditDocText: (t: string) => void;
}
export function GoogleDocsForm({ editDocDocumentId, setEditDocDocumentId, editDocText, setEditDocText }: GoogleDocsFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Document ID (Google Docs ID)</span>
        <input type="text" value={editDocDocumentId} onChange={e => setEditDocDocumentId(e.target.value)} placeholder="Ej. 1a2b3c4d5e6f..." />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Texto a insertar al inicio</span>
        <textarea value={editDocText} onChange={e => setEditDocText(e.target.value)} placeholder="Escribe el texto..." style={{ minHeight: '80px' }} />
      </div>
    </div>
  );
}

interface WhatsappFormProps {
  editWhatsappTo: string; setEditWhatsappTo: (to: string) => void;
  editWhatsappMessage: string; setEditWhatsappMessage: (m: string) => void;
  editWhatsappApiType: "web" | "api"; setEditWhatsappApiType: (t: "web" | "api") => void;
}
export function WhatsappForm({ editWhatsappTo, setEditWhatsappTo, editWhatsappMessage, setEditWhatsappMessage, editWhatsappApiType, setEditWhatsappApiType }: WhatsappFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Teléfono destinatario</span>
          <input type="text" value={editWhatsappTo} onChange={e => setEditWhatsappTo(e.target.value)} placeholder="Ej. 34600000000" />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Método de envío</span>
          <select
            value={editWhatsappApiType}
            onChange={e => setEditWhatsappApiType(e.target.value as any)}
            style={{
              background: 'var(--s1)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
              margin: 0
            }}
          >
            <option value="web">WhatsApp Web (Gratis con QR)</option>
            <option value="api">API Oficial de WhatsApp Cloud</option>
          </select>
        </div>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Cuerpo del mensaje</span>
        <textarea value={editWhatsappMessage} onChange={e => setEditWhatsappMessage(e.target.value)} placeholder="Escribe el mensaje..." style={{ minHeight: '80px' }} />
      </div>
    </div>
  );
}

interface TelegramFormProps {
  editTelegramMessage: string; setEditTelegramMessage: (m: string) => void;
  editTelegramChatId: string; setEditTelegramChatId: (id: string) => void;
}
export function TelegramForm({ editTelegramMessage, setEditTelegramMessage, editTelegramChatId, setEditTelegramChatId }: TelegramFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Chat ID (Opcional)</span>
        <input type="text" value={editTelegramChatId} onChange={e => setEditTelegramChatId(e.target.value)} placeholder="Ej. -100123456789" />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Mensaje a enviar</span>
        <textarea value={editTelegramMessage} onChange={e => setEditTelegramMessage(e.target.value)} placeholder="Escribe tu mensaje..." style={{ minHeight: '80px' }} />
      </div>
    </div>
  );
}

interface AiAgentFormProps {
  editAiAgentPrompt: string; setEditAiAgentPrompt: (p: string) => void;
  editAiAgentSystemPrompt: string; setEditAiAgentSystemPrompt: (s: string) => void;
  editAiAgentProvider: string; setEditAiAgentProvider: (p: string) => void;
  editAiAgentModel: string; setEditAiAgentModel: (m: string) => void;
  editAiAgentOutputVar: string; setEditAiAgentOutputVar: (v: string) => void;
  editAiAgentEnableTools: string[]; setEditAiAgentEnableTools: React.Dispatch<React.SetStateAction<string[]>>;
  editAiAgentMaxIterations: number; setEditAiAgentMaxIterations: (i: number) => void;
}

export function AiAgentForm({
  editAiAgentPrompt, setEditAiAgentPrompt,
  editAiAgentSystemPrompt, setEditAiAgentSystemPrompt,
  editAiAgentProvider, setEditAiAgentProvider,
  editAiAgentModel, setEditAiAgentModel,
  editAiAgentOutputVar, setEditAiAgentOutputVar,
  editAiAgentEnableTools, setEditAiAgentEnableTools,
  editAiAgentMaxIterations, setEditAiAgentMaxIterations
}: AiAgentFormProps) {

  const toggleTool = (toolName: string) => {
    setEditAiAgentEnableTools((prev) =>
      prev.includes(toolName)
        ? prev.filter((t) => t !== toolName)
        : [...prev, toolName]
    );
  };

  const availableTools = [
    { id: "ocr_scan_text", label: "OCR Scan Screen", desc: "La IA analiza y lee el texto en pantalla" },
    { id: "rpa_click", label: "RPA Mouse Click", desc: "La IA hace clic en coordenadas (x,y)" },
    { id: "rpa_type_text", label: "RPA Type Text", desc: "La IA escribe texto en la app activa" },
    { id: "get_workflow_var", label: "Read Variables", desc: "Accede a las variables del flujo" },
    { id: "set_workflow_var", label: "Write Variables", desc: "Guarda resultados en el flujo" },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Proveedor IA</span>
          <select
            value={editAiAgentProvider}
            onChange={e => {
              const p = e.target.value;
              setEditAiAgentProvider(p);
              if (p === "ollama") setEditAiAgentModel("llama3");
              else if (p === "lmstudio") setEditAiAgentModel("local-model");
              else if (p === "gemini") setEditAiAgentModel("gemini-1.5-flash");
              else if (p === "deepseek") setEditAiAgentModel("deepseek-chat");
              else if (p === "openai") setEditAiAgentModel("gpt-4o-mini");
            }}
            style={{
              background: 'var(--s1)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
              margin: 0
            }}
          >
            <option value="openai">OpenAI (GPT-4o)</option>
            <option value="ollama">Ollama (Local)</option>
            <option value="lmstudio">LM Studio (Local)</option>
            <option value="gemini">Google Gemini</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openrouter">OpenRouter AI</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Modelo</span>
          <input
            type="text"
            value={editAiAgentModel}
            onChange={e => setEditAiAgentModel(e.target.value)}
            placeholder="Ej. gpt-4o-mini, llama3, deepseek-chat"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Variable Salida</span>
          <input type="text" value={editAiAgentOutputVar} onChange={e => setEditAiAgentOutputVar(e.target.value)} placeholder="Ej. ai_response" />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Máx. Iteraciones (Tools Loop)</span>
          <input type="number" min={1} max={15} value={editAiAgentMaxIterations} onChange={e => setEditAiAgentMaxIterations(parseInt(e.target.value) || 5)} />
        </div>
      </div>

      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '6px', fontWeight: 600 }}>Herramientas Autónomas (Tools / Function Calling)</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--s1)', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          {availableTools.map((tool) => {
            const checked = editAiAgentEnableTools.includes(tool.id);
            return (
              <label
                key={tool.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11.5px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  background: checked ? 'var(--red-subtle)' : 'transparent',
                  transition: 'background 0.15s ease'
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTool(tool.id)}
                  style={{ cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '11.5px' }}>{tool.label}</div>
                  <div style={{ fontSize: '10px', color: 'var(--dim)' }}>{tool.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Prompt del Sistema (Instrucciones)</span>
        <input type="text" value={editAiAgentSystemPrompt} onChange={e => setEditAiAgentSystemPrompt(e.target.value)} placeholder="Ej. Eres un agente inteligente experto en automatización..." />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Prompt del Usuario (Soporta {'{variables}'})</span>
        <textarea value={editAiAgentPrompt} onChange={e => setEditAiAgentPrompt(e.target.value)} placeholder="Ej. Escanea la pantalla con OCR y haz clic en el botón Confirmar" style={{ minHeight: '75px' }} />
      </div>
    </div>
  );
}

