import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SubWorkflowForm } from "./SubWorkflowForm";

interface N8nTriggerFormsProps {
  type: string;
  state: any;
}

export function N8nTriggerForms({ type, state }: N8nTriggerFormsProps) {
  const [systemApps, setSystemApps] = useState<{ name: string; exe: string }[]>([]);

  useEffect(() => {
    if (type === "startup") {
      invoke<{ name: string; exe: string }[]>("get_system_installed_apps")
        .then((res) => setSystemApps(res || []))
        .catch(() => setSystemApps([]));
    }
  }, [type]);

  const {
    editWebhookPath, setEditWebhookPath,
    editWebhookMethod, setEditWebhookMethod,
    editPollingUrl, setEditPollingUrl,
    editPollingMethod, setEditPollingMethod,
    editPollingHeaders, setEditPollingHeaders,
    editPollingBody, setEditPollingBody,
    editPollingInterval, setEditPollingInterval,
    editHttpRequestMethod, setEditHttpRequestMethod,
    editHttpRequestUrl, setEditHttpRequestUrl,
    editHttpRequestHeaders, setEditHttpRequestHeaders,
    editHttpRequestBody, setEditHttpRequestBody,
    editHttpRequestOutputVar, setEditHttpRequestOutputVar,
    editSwitchField, setEditSwitchField,
    editSwitchCases, setEditSwitchCases,
    editMergeMode, setEditMergeMode,
    editWaitSeconds, setEditWaitSeconds,
    editWaitResumeOn, setEditWaitResumeOn,
    editCodeLanguage, setEditCodeLanguage,
    editCodeContent, setEditCodeContent,
    editCodeOutputVar, setEditCodeOutputVar,
    editErrorHandlerAction, setEditErrorHandlerAction,
    editErrorHandlerMaxRetries, setEditErrorHandlerMaxRetries,
    editTriggerSchedule, setEditTriggerSchedule,
    editCronSchedule, setEditCronSchedule,
    editFileChangePath, setEditFileChangePath,
    editFileChangeEvent, setEditFileChangeEvent,
    editHotkeyTriggerShortcut, setEditHotkeyTriggerShortcut,
    editScrollY, setEditScrollY,
    editStartupMode, setEditStartupMode,
    editStartupAppExe, setEditStartupAppExe,
    editStartupDelay, setEditStartupDelay,
    editXmlSource, setEditXmlSource,
    editXmlRoot, setEditXmlRoot,
    editHtmlSource, setEditHtmlSource,
    editHtmlSelector, setEditHtmlSelector,
    editHtmlAttr, setEditHtmlAttr,
    editRssUrl, setEditRssUrl,
    editRssLimit, setEditRssLimit,
    editEmailSmtpHost, setEditEmailSmtpHost,
    editEmailSmtpPort, setEditEmailSmtpPort,
    editEmailUsername, setEditEmailUsername,
    editEmailPassword, setEditEmailPassword,
    editEmailFrom, setEditEmailFrom,
    editEmailTo, setEditEmailTo,
    editEmailSubject, setEditEmailSubject,
    editEmailBody, setEditEmailBody,
    editEmailIsHtml, setEditEmailIsHtml,
    editSlackWebhookUrl, setEditSlackWebhookUrl,
    editSlackText, setEditSlackText,
    editSlackChannel, setEditSlackChannel,
    editSlackBotName, setEditSlackBotName,
    editDiscordWebhookUrl, setEditDiscordWebhookUrl,
    editDiscordContent, setEditDiscordContent,
    editDiscordBotName, setEditDiscordBotName,
    editNotionOperation, setEditNotionOperation,
    editNotionToken, setEditNotionToken,
    editNotionDatabaseId, setEditNotionDatabaseId,
    editNotionPageId, setEditNotionPageId,
    editNotionTitle, setEditNotionTitle,
    editNotionProperties, setEditNotionProperties,
    editNotionFilter, setEditNotionFilter,
    editAirtableOperation, setEditAirtableOperation,
    editAirtableApiKey, setEditAirtableApiKey,
    editAirtableBaseId, setEditAirtableBaseId,
    editAirtableTable, setEditAirtableTable,
    editAirtableRecordId, setEditAirtableRecordId,
    editAirtableFields, setEditAirtableFields,
    editStopErrorMessage, setEditStopErrorMessage,
    // n8n Core nodes.
    editSplitOutField, setEditSplitOutField,
    editSplitOutInclude, setEditSplitOutInclude,
    editSplitOutIncludeFields, setEditSplitOutIncludeFields,
    editSplitOutDestination, setEditSplitOutDestination,
    editSummarizeGroupBy, setEditSummarizeGroupBy,
    editSummarizeAggregations, setEditSummarizeAggregations,
    editSummarizeSeparator, setEditSummarizeSeparator,
    editRenameKeysRules, setEditRenameKeysRules,
    editRenameKeysMode, setEditRenameKeysMode,
    editRenameKeysKeepOnly, setEditRenameKeysKeepOnly,
    editRenameKeysDeep, setEditRenameKeysDeep,
    editMarkdownMode, setEditMarkdownMode,
    editMarkdownSource, setEditMarkdownSource,
    editMarkdownTarget, setEditMarkdownTarget,
    editCryptoAction, setEditCryptoAction,
    editCryptoAlgorithm, setEditCryptoAlgorithm,
    editCryptoEncoding, setEditCryptoEncoding,
    editCryptoValue, setEditCryptoValue,
    editCryptoSecret, setEditCryptoSecret,
    editCryptoLength, setEditCryptoLength,
    editCryptoTarget, setEditCryptoTarget,
    editReadFilePath, setEditReadFilePath,
    editReadFileEncoding, setEditReadFileEncoding,
    editReadFileTarget, setEditReadFileTarget,
    editWriteFilePath, setEditWriteFilePath,
    editWriteFileContent, setEditWriteFileContent,
    editWriteFileEncoding, setEditWriteFileEncoding,
    editWriteFileAppend, setEditWriteFileAppend
  } = state;

  return (
    <>
      {type === "webhook" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta del Webhook</span>
            <input type="text" value={editWebhookPath} onChange={e => setEditWebhookPath(e.target.value)} placeholder="Ej. /webhook" />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Método HTTP</span>
            <select value={editWebhookMethod} onChange={e => setEditWebhookMethod(e.target.value)}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
        </div>
      )}

      {type === "polling" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ width: "120px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Método</span>
              <select value={editPollingMethod} onChange={e => setEditPollingMethod(e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL a consultar</span>
              <input type="text" value={editPollingUrl} onChange={e => setEditPollingUrl(e.target.value)} placeholder="https://api.ejemplo.com/items" />
            </div>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cabeceras (Headers JSON)</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editPollingHeaders} onChange={e => setEditPollingHeaders(e.target.value)} placeholder='{"Authorization": "Bearer ..."}' rows={3} />
          </div>
          {editPollingMethod !== "GET" && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cuerpo (Body)</span>
              <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editPollingBody} onChange={e => setEditPollingBody(e.target.value)} placeholder="{}" rows={3} />
            </div>
          )}
          <div style={{ width: "180px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Intervalo (segundos)</span>
            <input type="number" min={5} value={editPollingInterval} onChange={e => setEditPollingInterval(Math.max(5, parseInt(e.target.value, 10) || 60))} />
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            El flujo se dispara cuando la respuesta de la API <b>cambia</b> respecto a la consulta anterior.
            La primera consulta solo establece la línea base, no dispara. La respuesta queda disponible
            en las variables <code>polling.body</code>, <code>polling.status</code> y <code>polling.url</code>.
          </div>
        </div>
      )}

      {type === "http_request" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ width: "120px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Método</span>
              <select value={editHttpRequestMethod} onChange={e => setEditHttpRequestMethod(e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del Endpoint</span>
              <input type="text" value={editHttpRequestUrl} onChange={e => setEditHttpRequestUrl(e.target.value)} placeholder="https://api.example.com" />
            </div>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cabeceras (Headers JSON)</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editHttpRequestHeaders} onChange={e => setEditHttpRequestHeaders(e.target.value)} placeholder="{}" rows={3} />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cuerpo de la Petición (Body)</span>
            <textarea value={editHttpRequestBody} onChange={e => setEditHttpRequestBody(e.target.value)} placeholder="Cuerpo del mensaje..." rows={4} />
          </div>
          <div style={{ marginTop: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Guardar respuesta en variable</span>
            <input type="text" value={editHttpRequestOutputVar} onChange={e => setEditHttpRequestOutputVar(e.target.value)} placeholder="http_response" style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }} />
            <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>Úsala después como {'{{ ' + (editHttpRequestOutputVar || "http_response") + ' }}'} · el estado HTTP queda en {'{{ ' + (editHttpRequestOutputVar || "http_response") + '_status }}'}</span>
          </div>
        </div>
      )}

      {type === "switch" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo o Variable a Evaluar</span>
            <input type="text" value={editSwitchField} onChange={e => setEditSwitchField(e.target.value)} placeholder="Ej. status" />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Casos de Ruta (JSON Array)</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editSwitchCases} onChange={e => setEditSwitchCases(e.target.value)} placeholder='[{"value": "ok", "output": 0}]' rows={6} />
          </div>
        </div>
      )}

      {type === "merge" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Modo de Combinación</span>
          <select value={editMergeMode} onChange={e => setEditMergeMode(e.target.value)}>
            <option value="append">Append (Unir colas)</option>
            <option value="combine">Combine (Fusionar campos)</option>
            <option value="choose">Choose (Elegir un ramal)</option>
          </select>
        </div>
      )}

      {type === "wait" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Segundos de Espera</span>
            <input type="number" value={editWaitSeconds} onChange={e => setEditWaitSeconds(parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Reanudar Por</span>
            <select value={editWaitResumeOn} onChange={e => setEditWaitResumeOn(e.target.value)}>
              <option value="timeout">Tiempo transcurrido</option>
              <option value="event">Evento recibido</option>
            </select>
          </div>
        </div>
      )}

      {type === "code" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Lenguaje</span>
            <select value={editCodeLanguage} onChange={e => setEditCodeLanguage(e.target.value)}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
            </select>
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Código Script</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editCodeContent} onChange={e => setEditCodeContent(e.target.value)} rows={8} />
          </div>
          <div style={{ marginTop: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Guardar salida (stdout) en variable</span>
            <input type="text" value={editCodeOutputVar} onChange={e => setEditCodeOutputVar(e.target.value)} placeholder="code_output" style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }} />
            <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>Úsala después como {'{{ ' + (editCodeOutputVar || "code_output") + ' }}'}</span>
          </div>
        </div>
      )}

      {type === "error_handler" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Acción en Error</span>
            <select value={editErrorHandlerAction} onChange={e => setEditErrorHandlerAction(e.target.value)}>
              <option value="retry">Reintentar</option>
              <option value="ignore">Ignorar y continuar</option>
              <option value="stop">Detener ejecución</option>
            </select>
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Intentos Máximos</span>
            <input type="number" value={editErrorHandlerMaxRetries} onChange={e => setEditErrorHandlerMaxRetries(parseInt(e.target.value) || 0)} />
          </div>
        </div>
      )}

      {type === "trigger" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Frecuencia / Programación</span>
          <select value={editTriggerSchedule} onChange={e => setEditTriggerSchedule(e.target.value)}>
            <option value="manual">Manual (Al presionar ejecutar)</option>
            <option value="cron">Cron (Programación periódica)</option>
            <option value="interval">Intervalo de tiempo</option>
          </select>
        </div>
      )}

      {type === "cron" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Programación (Ej. 1m, 1h o expresión Cron)</span>
          <input type="text" value={editCronSchedule} onChange={e => setEditCronSchedule(e.target.value)} placeholder="Ej. 1h o */5 * * * *" />
        </div>
      )}

      {type === "startup" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Modo de Disparo al Iniciar</span>
            <select
              value={editStartupMode || "system"}
              onChange={e => setEditStartupMode?.(e.target.value as "system" | "app_launch")}
            >
              <option value="system">🚀 Al iniciar grapScreen en el sistema (Windows / Linux / macOS)</option>
              <option value="app_launch">💻 Al abrir una aplicación específica en el sistema</option>
            </select>
          </div>

          {editStartupMode === "app_launch" && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "11px", color: "var(--dim)" }}>Seleccionar Aplicación Objetivo (Sistema Anfitrión)</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const picked = await invoke<string | null>("pick_executable_file");
                      if (picked) {
                        setEditStartupAppExe?.(picked);
                      }
                    } catch (err) {
                      console.error("Error picking executable file", err);
                    }
                  }}
                  style={{
                    border: "1px solid var(--line)",
                    background: "rgba(255,255,255,0.06)",
                    color: "var(--text)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    fontSize: "10.5px",
                    cursor: "pointer"
                  }}
                >
                  📂 Buscar ejecutable...
                </button>
              </div>

              <select
                value={editStartupAppExe || "chrome.exe"}
                onChange={e => setEditStartupAppExe?.(e.target.value)}
              >
                {systemApps.map((a, idx) => (
                  <option key={idx} value={a.exe}>
                    💻 {a.name} ({a.exe})
                  </option>
                ))}
                <option value="chrome.exe">🌐 Google Chrome (chrome.exe)</option>
                <option value="excel.exe">📊 Microsoft Excel (excel.exe)</option>
                <option value="notepad.exe">📝 Bloc de Notas (notepad.exe)</option>
                <option value="calculator.exe">🧮 Calculadora (calculator.exe)</option>
                <option value="msedge.exe">🌐 Microsoft Edge (msedge.exe)</option>
                <option value="powershell.exe">⚡ PowerShell (powershell.exe)</option>
                <option value="explorer.exe">📁 Explorador de Archivos (explorer.exe)</option>
                <option value="custom">⚙️ Ruta Ejecutable Personalizada (.exe / .AppImage / .app)</option>
              </select>

              {(editStartupAppExe === "custom" || !["chrome.exe", "excel.exe", "notepad.exe", "calculator.exe", "msedge.exe", "powershell.exe", "explorer.exe"].includes(editStartupAppExe)) && (
                <input
                  type="text"
                  style={{ marginTop: "6px" }}
                  value={editStartupAppExe || ""}
                  onChange={e => setEditStartupAppExe?.(e.target.value)}
                  placeholder="C:\Ruta\a\aplicacion.exe o /usr/bin/app"
                />
              )}
            </div>
          )}

          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Retardo de Inicio (Segundos)</span>
            <input
              type="number"
              min={0}
              max={300}
              value={editStartupDelay || 0}
              onChange={e => setEditStartupDelay?.(Number(e.target.value))}
              placeholder="0 (inmediato)"
            />
          </div>
        </div>
      )}

      {type === "file_change" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta de la Carpeta/Archivo a Monitorear</span>
            <input type="text" value={editFileChangePath} onChange={e => setEditFileChangePath(e.target.value)} placeholder="C:\ruta\a\carpeta" />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Evento de Archivo</span>
            <select value={editFileChangeEvent} onChange={e => setEditFileChangeEvent(e.target.value)}>
              <option value="Create">Creado</option>
              <option value="Modify">Modificado</option>
              <option value="Delete">Eliminado</option>
              <option value="Any">Cualquiera</option>
            </select>
          </div>
        </div>
      )}

      {type === "hotkey_trigger" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Atajo de Teclado Global (Hotkey)</span>
          <input type="text" value={editHotkeyTriggerShortcut} onChange={e => setEditHotkeyTriggerShortcut(e.target.value)} placeholder="Ej. Ctrl+Alt+A" />
        </div>
      )}

      {type === "scroll" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Desplazamiento Vertical (Y delta)</span>
          <input type="number" value={editScrollY} onChange={e => setEditScrollY(parseInt(e.target.value) || 0)} placeholder="Ej. -120 o 120" />
        </div>
      )}

      {type === "sub_workflow" && <SubWorkflowForm state={state} />}

      {/* ─────────────── Fase 11 · Parseo ─────────────── */}

      {type === "xml_parse" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>XML de origen</span>
            <textarea
              style={{ fontFamily: "monospace", fontSize: "11px" }}
              value={editXmlSource}
              onChange={e => setEditXmlSource(e.target.value)}
              placeholder="{{ $json.xml }}"
              rows={5}
            />
            <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
              Normalmente una expresión que apunta al XML que llega en el item.
            </span>
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta al elemento a expandir (opcional)</span>
            <input type="text" value={editXmlRoot} onChange={e => setEditXmlRoot(e.target.value)} placeholder="channel.item" />
            <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
              Vacío = se devuelve el documento completo como un item. Si apunta a una lista, cada elemento se convierte en un item.
              El nombre del elemento raíz es opcional: <code>rss.channel.item</code> y <code>channel.item</code> funcionan igual.
            </span>
          </div>
        </div>
      )}

      {type === "html_extract" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>HTML de origen</span>
            <textarea
              style={{ fontFamily: "monospace", fontSize: "11px" }}
              value={editHtmlSource}
              onChange={e => setEditHtmlSource(e.target.value)}
              placeholder="{{ $json.html }}"
              rows={5}
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Selector CSS</span>
            <input type="text" value={editHtmlSelector} onChange={e => setEditHtmlSelector(e.target.value)} placeholder="a.titulo  ·  div.card h2" />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Atributos a extraer</span>
            <input type="text" value={editHtmlAttr} onChange={e => setEditHtmlAttr(e.target.value)} placeholder="href,title" />
            <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
              Separados por comas. El texto del elemento siempre va en <code>{"{{ $json.text }}"}</code>. Sin coincidencias el nodo devuelve 0 items.
            </span>
          </div>
        </div>
      )}

      {type === "rss_read" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del feed (RSS 2.0 o Atom)</span>
            <input type="text" value={editRssUrl} onChange={e => setEditRssUrl(e.target.value)} placeholder="https://ejemplo.com/feed.xml" />
          </div>
          <div style={{ width: "180px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Nº máximo de entradas</span>
            <input type="number" min={1} value={editRssLimit} onChange={e => setEditRssLimit(Math.max(1, parseInt(e.target.value, 10) || 20))} />
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Cada entrada se convierte en un item con <code>title</code>, <code>link</code>, <code>description</code>,
            <code>pub_date</code> y <code>guid</code>.
          </div>
        </div>
      )}

      {/* ─────────────── Fase 11 · Integraciones ─────────────── */}

      {type === "send_email" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Servidor SMTP</span>
              <input type="text" value={editEmailSmtpHost} onChange={e => setEditEmailSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div style={{ width: "120px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Puerto</span>
              <input type="number" value={editEmailSmtpPort} onChange={e => setEditEmailSmtpPort(parseInt(e.target.value, 10) || 587)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Usuario</span>
              <input type="text" value={editEmailUsername} onChange={e => setEditEmailUsername(e.target.value)} placeholder="tu@correo.com" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Contraseña</span>
              <input type="password" value={editEmailPassword} onChange={e => setEditEmailPassword(e.target.value)} placeholder="contraseña o app password" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Remitente</span>
              <input type="text" value={editEmailFrom} onChange={e => setEditEmailFrom(e.target.value)} placeholder="tu@correo.com" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Destinatario</span>
              <input type="text" value={editEmailTo} onChange={e => setEditEmailTo(e.target.value)} placeholder="{{ $json.email }}" />
            </div>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Asunto</span>
            <input type="text" value={editEmailSubject} onChange={e => setEditEmailSubject(e.target.value)} placeholder="Asunto del correo" />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cuerpo</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editEmailBody} onChange={e => setEditEmailBody(e.target.value)} placeholder="{{ $json.mensaje }}" rows={5} />
          </div>
          <div className="ndv-toggle">
            <input type="checkbox" id="ndv-email-html" checked={editEmailIsHtml} onChange={e => setEditEmailIsHtml(e.target.checked)} />
            <label htmlFor="ndv-email-html">Enviar como HTML</label>
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Se envía un correo por item. El puerto 465 usa TLS directo; cualquier otro usa STARTTLS.
            Si dejas la contraseña vacía se usará la credencial de la bóveda adjunta al nodo.
          </div>
        </div>
      )}

      {type === "slack_webhook" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del Incoming Webhook</span>
            <input type="text" value={editSlackWebhookUrl} onChange={e => setEditSlackWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Mensaje</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editSlackText} onChange={e => setEditSlackText(e.target.value)} placeholder="{{ $json.mensaje }}" rows={4} />
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Canal (opcional)</span>
              <input type="text" value={editSlackChannel} onChange={e => setEditSlackChannel(e.target.value)} placeholder="#general" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Nombre del bot (opcional)</span>
              <input type="text" value={editSlackBotName} onChange={e => setEditSlackBotName(e.target.value)} placeholder="grapScreen" />
            </div>
          </div>
        </div>
      )}

      {type === "discord_webhook" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del Webhook de Discord</span>
            <input type="text" value={editDiscordWebhookUrl} onChange={e => setEditDiscordWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Contenido</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editDiscordContent} onChange={e => setEditDiscordContent(e.target.value)} placeholder="{{ $json.mensaje }}" rows={4} />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Nombre del bot (opcional)</span>
            <input type="text" value={editDiscordBotName} onChange={e => setEditDiscordBotName(e.target.value)} placeholder="grapScreen" />
          </div>
        </div>
      )}

      {type === "notion" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Operación</span>
            <select value={editNotionOperation} onChange={e => setEditNotionOperation(e.target.value)}>
              <option value="query_database">Consultar base de datos</option>
              <option value="create_page">Crear página</option>
              <option value="update_page">Actualizar página</option>
            </select>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Token de integración</span>
            <input type="password" value={editNotionToken} onChange={e => setEditNotionToken(e.target.value)} placeholder="secret_... (o usa una credencial de la bóveda)" />
          </div>
          {editNotionOperation === "query_database" && (
            <>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>ID de la base de datos</span>
                <input type="text" value={editNotionDatabaseId} onChange={e => setEditNotionDatabaseId(e.target.value)} placeholder="32 caracteres" />
              </div>
              <div>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Filtro (JSON, opcional)</span>
                <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editNotionFilter} onChange={e => setEditNotionFilter(e.target.value)} placeholder='{"property": "Estado", "select": {"equals": "Hecho"}}' rows={3} />
              </div>
            </>
          )}
          {editNotionOperation === "create_page" && (
            <>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>ID de la base de datos</span>
                <input type="text" value={editNotionDatabaseId} onChange={e => setEditNotionDatabaseId(e.target.value)} placeholder="32 caracteres" />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Título de la página</span>
                <input type="text" value={editNotionTitle} onChange={e => setEditNotionTitle(e.target.value)} placeholder="{{ $json.titulo }}" />
              </div>
              <div>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Propiedades (JSON, opcional)</span>
                <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editNotionProperties} onChange={e => setEditNotionProperties(e.target.value)} placeholder='{"Estado": {"select": {"name": "Nuevo"}}}' rows={3} />
                <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
                  Si lo dejas vacío se crea solo la propiedad de título en la columna «Name».
                </span>
              </div>
            </>
          )}
          {editNotionOperation === "update_page" && (
            <div>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>ID de la página</span>
              <input type="text" value={editNotionPageId} onChange={e => setEditNotionPageId(e.target.value)} placeholder="32 caracteres" />
            </div>
          )}
        </div>
      )}

      {type === "airtable" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Operación</span>
            <select value={editAirtableOperation} onChange={e => setEditAirtableOperation(e.target.value)}>
              <option value="list">Listar registros</option>
              <option value="create">Crear registro</option>
              <option value="update">Actualizar registro</option>
              <option value="delete">Eliminar registro</option>
            </select>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>API key / PAT</span>
            <input type="password" value={editAirtableApiKey} onChange={e => setEditAirtableApiKey(e.target.value)} placeholder="pat... (o usa una credencial de la bóveda)" />
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Base ID</span>
              <input type="text" value={editAirtableBaseId} onChange={e => setEditAirtableBaseId(e.target.value)} placeholder="appXXXXXXXXXXXXXX" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Tabla</span>
              <input type="text" value={editAirtableTable} onChange={e => setEditAirtableTable(e.target.value)} placeholder="Clientes" />
            </div>
          </div>
          {(editAirtableOperation === "update" || editAirtableOperation === "delete") && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>ID del registro</span>
              <input type="text" value={editAirtableRecordId} onChange={e => setEditAirtableRecordId(e.target.value)} placeholder="recXXXXXXXXXXXXXX" />
            </div>
          )}
          {(editAirtableOperation === "create" || editAirtableOperation === "update") && (
            <div>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campos (JSON)</span>
              <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editAirtableFields} onChange={e => setEditAirtableFields(e.target.value)} placeholder='{"Nombre": "{{ $json.nombre }}"}' rows={3} />
            </div>
          )}
        </div>
      )}

      {/* ─────────────── Fase 11 · Control de flujo ─────────────── */}

      {type === "stop_error" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Mensaje de error</span>
          <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editStopErrorMessage} onChange={e => setEditStopErrorMessage(e.target.value)} placeholder="El flujo se detuvo porque…" rows={3} />
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            El flujo se aborta con este mensaje. Admite expresiones como <code>{"{{ $json.motivo }}"}</code>.
            Nada sale de este nodo: es una salida sin retorno.
          </div>
        </div>
      )}

      {type === "noop" && (
        <div style={{ marginBottom: "16px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
          Este nodo no hace nada: deja pasar los items sin tocarlos. Útil como marcador o
          para unir dos ramas visualmente sin alterar los datos.
        </div>
      )}

      {/* ─────────────── n8n Core · Transformación de datos ─────────────── */}

      {type === "split_out" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo que contiene la lista</span>
            <input type="text" value={editSplitOutField} onChange={e => setEditSplitOutField(e.target.value)} placeholder="items" />
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Otros campos</span>
              <select value={editSplitOutInclude} onChange={e => setEditSplitOutInclude(e.target.value)}>
                <option value="none">Ninguno</option>
                <option value="all">Todos los demás</option>
                <option value="selected">Solo los indicados</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Guardar el elemento en</span>
              <input type="text" value={editSplitOutDestination} onChange={e => setEditSplitOutDestination(e.target.value)} placeholder="(opcional) row" />
            </div>
          </div>
          {editSplitOutInclude === "selected" && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campos a conservar (separados por comas)</span>
              <input type="text" value={editSplitOutIncludeFields} onChange={e => setEditSplitOutIncludeFields(e.target.value)} placeholder="id, nombre" />
            </div>
          )}
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Cada elemento de la lista se convierte en un item. Si el campo no es una lista, el item
            pasa sin cambios en lugar de perderse. Con «Guardar el elemento en» el elemento se anida
            bajo esa clave en vez de fusionarse.
          </div>
        </div>
      )}

      {type === "summarize" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Agrupar por (separado por comas, vacío = un solo grupo)</span>
            <input type="text" value={editSummarizeGroupBy} onChange={e => setEditSummarizeGroupBy(e.target.value)} placeholder="ciudad" />
          </div>
          <div style={{ marginBottom: "8px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Agregaciones</span>
            {editSummarizeAggregations.map((agg: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                <select
                  style={{ flex: 1 }}
                  value={agg.operation || "count"}
                  onChange={e => {
                    const next = editSummarizeAggregations.slice();
                    next[i] = { ...agg, operation: e.target.value };
                    setEditSummarizeAggregations(next);
                  }}
                >
                  <option value="count">Contar items</option>
                  <option value="count_unique">Contar únicos</option>
                  <option value="sum">Sumar</option>
                  <option value="average">Promediar</option>
                  <option value="min">Mínimo</option>
                  <option value="max">Máximo</option>
                  <option value="concatenate">Concatenar</option>
                  <option value="first">Primero</option>
                  <option value="last">Último</option>
                  <option value="append">Recoger en lista</option>
                </select>
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={agg.field || ""}
                  onChange={e => {
                    const next = editSummarizeAggregations.slice();
                    next[i] = { ...agg, field: e.target.value };
                    setEditSummarizeAggregations(next);
                  }}
                  placeholder={agg.operation === "count" ? "(no aplica)" : "campo"}
                />
                <input
                  type="text"
                  style={{ width: "110px" }}
                  value={agg.output_field || ""}
                  onChange={e => {
                    const next = editSummarizeAggregations.slice();
                    next[i] = { ...agg, output_field: e.target.value };
                    setEditSummarizeAggregations(next);
                  }}
                  placeholder="salida"
                />
                <button
                  type="button"
                  onClick={() => setEditSummarizeAggregations(editSummarizeAggregations.filter((_: any, j: number) => j !== i))}
                  disabled={editSummarizeAggregations.length <= 1}
                  style={{ padding: "2px 8px" }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEditSummarizeAggregations([...editSummarizeAggregations, { operation: "count", field: "", output_field: "" }])}
              style={{ padding: "2px 10px", fontSize: "11px" }}
            >
              + Añadir agregación
            </button>
          </div>
          <div style={{ width: "180px", marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Separador al concatenar</span>
            <input type="text" value={editSummarizeSeparator} onChange={e => setEditSummarizeSeparator(e.target.value)} placeholder=", " />
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Produce un item por grupo con los campos de agrupación y una clave por agregación.
            Si dejas «salida» vacía se nombra sola: <code>count</code>, <code>sum_total</code>, etc.
          </div>
        </div>
      )}

      {type === "rename_keys" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Renombrados</span>
            {editRenameKeysRules.map((rule: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={rule.from || ""}
                  onChange={e => {
                    const next = editRenameKeysRules.slice();
                    next[i] = { ...rule, from: e.target.value };
                    setEditRenameKeysRules(next);
                  }}
                  placeholder={editRenameKeysMode === "regex" ? "^user_" : "nombre_viejo"}
                />
                <span style={{ color: "var(--dim)" }}>→</span>
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={rule.to || ""}
                  onChange={e => {
                    const next = editRenameKeysRules.slice();
                    next[i] = { ...rule, to: e.target.value };
                    setEditRenameKeysRules(next);
                  }}
                  placeholder="nombre_nuevo"
                />
                <button
                  type="button"
                  onClick={() => setEditRenameKeysRules(editRenameKeysRules.filter((_: any, j: number) => j !== i))}
                  disabled={editRenameKeysRules.length <= 1}
                  style={{ padding: "2px 8px" }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEditRenameKeysRules([...editRenameKeysRules, { from: "", to: "" }])}
              style={{ padding: "2px 10px", fontSize: "11px" }}
            >
              + Añadir regla
            </button>
          </div>
          <div style={{ width: "200px", marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Modo</span>
            <select value={editRenameKeysMode} onChange={e => setEditRenameKeysMode(e.target.value)}>
              <option value="plain">Coincidencia exacta</option>
              <option value="regex">Expresión regular</option>
            </select>
          </div>
          <div className="ndv-toggle">
            <input type="checkbox" id="ndv-rk-keep" checked={editRenameKeysKeepOnly} onChange={e => setEditRenameKeysKeepOnly(e.target.checked)} />
            <label htmlFor="ndv-rk-keep">Conservar solo los campos renombrados</label>
          </div>
          <div className="ndv-toggle">
            <input type="checkbox" id="ndv-rk-deep" checked={editRenameKeysDeep} onChange={e => setEditRenameKeysDeep(e.target.checked)} />
            <label htmlFor="ndv-rk-deep">Aplicar también dentro de objetos anidados</label>
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            En modo expresión regular cada «origen» se aplica con reemplazo global, así que
            <code>^user_</code> → vacío convierte <code>user_id</code> en <code>id</code>.
          </div>
        </div>
      )}

      {type === "markdown" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ width: "240px", marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Conversión</span>
            <select value={editMarkdownMode} onChange={e => setEditMarkdownMode(e.target.value)}>
              <option value="markdown_to_html">Markdown → HTML</option>
              <option value="html_to_markdown">HTML → Markdown</option>
            </select>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Texto de origen</span>
            <textarea
              style={{ fontFamily: "monospace", fontSize: "11px" }}
              value={editMarkdownSource}
              onChange={e => setEditMarkdownSource(e.target.value)}
              placeholder="{{ $json.text }}"
              rows={4}
            />
          </div>
          <div style={{ width: "200px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo de salida</span>
            <input type="text" value={editMarkdownTarget} onChange={e => setEditMarkdownTarget(e.target.value)} placeholder="data" />
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Si dejas el origen vacío se usa el propio valor de texto del item. El resultado se añade
            al item en el campo de salida, sin borrar el resto.
          </div>
        </div>
      )}

      {type === "crypto" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Acción</span>
              <select value={editCryptoAction} onChange={e => setEditCryptoAction(e.target.value)}>
                <option value="hash">Hash</option>
                <option value="hmac">HMAC</option>
                <option value="random">Cadena aleatoria</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Algoritmo</span>
              <select value={editCryptoAlgorithm} onChange={e => setEditCryptoAlgorithm(e.target.value)} disabled={editCryptoAction === "random"}>
                <option value="MD5">MD5</option>
                <option value="SHA1">SHA-1</option>
                <option value="SHA256">SHA-256</option>
                <option value="SHA512">SHA-512</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Codificación</span>
              <select value={editCryptoEncoding} onChange={e => setEditCryptoEncoding(e.target.value)}>
                <option value="hex">hex</option>
                <option value="base64">base64</option>
                {editCryptoAction === "random" && <option value="alphanumeric">alfanumérica</option>}
              </select>
            </div>
          </div>

          {editCryptoAction === "random" ? (
            <div style={{ width: "180px", marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Longitud</span>
              <input
                type="number"
                min={1}
                max={4096}
                value={editCryptoLength}
                onChange={e => setEditCryptoLength(Math.max(1, parseInt(e.target.value, 10) || 32))}
              />
            </div>
          ) : (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Valor</span>
              <textarea
                style={{ fontFamily: "monospace", fontSize: "11px" }}
                value={editCryptoValue}
                onChange={e => setEditCryptoValue(e.target.value)}
                placeholder="{{ $json.text }}"
                rows={3}
              />
            </div>
          )}

          {editCryptoAction === "hmac" && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Secreto (vacío = credencial del nodo)</span>
              <input type="text" value={editCryptoSecret} onChange={e => setEditCryptoSecret(e.target.value)} placeholder="clave secreta" />
            </div>
          )}

          <div style={{ width: "200px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo de salida</span>
            <input type="text" value={editCryptoTarget} onChange={e => setEditCryptoTarget(e.target.value)} placeholder="data" />
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Los hashes se calculan aquí mismo, sin salir del equipo. Un algoritmo no soportado
            detiene el nodo con un error en vez de devolver un valor distinto.
          </div>
        </div>
      )}

      {/* ─────────────── n8n Core · Archivos ─────────────── */}

      {type === "read_file" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta del archivo</span>
            <input type="text" value={editReadFilePath} onChange={e => setEditReadFilePath(e.target.value)} placeholder="~/datos.txt" />
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Codificación</span>
              <select value={editReadFileEncoding} onChange={e => setEditReadFileEncoding(e.target.value)}>
                <option value="utf8">Texto (UTF-8)</option>
                <option value="base64">Base64 (binario)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo de salida</span>
              <input type="text" value={editReadFileTarget} onChange={e => setEditReadFileTarget(e.target.value)} placeholder="data" />
            </div>
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            <code>~</code> se expande a tu carpeta de usuario. Añade también <code>file_path</code> y
            <code>size_bytes</code>. Si el archivo no existe el nodo falla: un archivo vacío y un
            archivo inexistente no deben confundirse.
          </div>
        </div>
      )}

      {type === "write_file" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta del archivo</span>
            <input type="text" value={editWriteFilePath} onChange={e => setEditWriteFilePath(e.target.value)} placeholder="~/salida.txt" />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Contenido (vacío = el valor del item)</span>
            <textarea
              style={{ fontFamily: "monospace", fontSize: "11px" }}
              value={editWriteFileContent}
              onChange={e => setEditWriteFileContent(e.target.value)}
              placeholder="{{ $json.text }}"
              rows={4}
            />
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Codificación</span>
              <select value={editWriteFileEncoding} onChange={e => setEditWriteFileEncoding(e.target.value)}>
                <option value="utf8">Texto (UTF-8)</option>
                <option value="base64">Base64 (binario)</option>
              </select>
            </div>
          </div>
          <div className="ndv-toggle">
            <input type="checkbox" id="ndv-wf-append" checked={editWriteFileAppend} onChange={e => setEditWriteFileAppend(e.target.checked)} />
            <label htmlFor="ndv-wf-append">Añadir al final en vez de reemplazar</label>
          </div>
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Se crean las carpetas que falten. Sin «añadir», el archivo se sobrescribe por completo.
          </div>
        </div>
      )}
    </>
  );
}
