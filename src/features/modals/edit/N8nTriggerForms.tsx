import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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
    editTriggerSchedule, setEditTriggerSchedule,
    editCronSchedule, setEditCronSchedule,
    editFileChangePath, setEditFileChangePath,
    editFileChangeEvent, setEditFileChangeEvent,
    editHotkeyTriggerShortcut, setEditHotkeyTriggerShortcut,
    editStartupMode, setEditStartupMode,
    editStartupAppExe, setEditStartupAppExe,
    editStartupDelay, setEditStartupDelay,
    editWhatsappTriggerPhoneId, setEditWhatsappTriggerPhoneId,
    editWhatsappTriggerToken, setEditWhatsappTriggerToken,
    editTelegramTriggerBotToken, setEditTelegramTriggerBotToken,
    editEmailTriggerHost, setEditEmailTriggerHost,
    editEmailTriggerPort, setEditEmailTriggerPort,
    editEmailTriggerUser, setEditEmailTriggerUser,
    editEmailTriggerPassword, setEditEmailTriggerPassword,
    editEmailTriggerFolder, setEditEmailTriggerFolder,
    editRssTriggerUrl, setEditRssTriggerUrl,
    editRssTriggerInterval, setEditRssTriggerInterval,
  } = state;

  return (
    <>
      {type === "webhook" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta del Webhook</span>
            <input type="text" value={editWebhookPath} onChange={e => setEditWebhookPath?.(e.target.value)} placeholder="/webhook" />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Método HTTP</span>
            <select value={editWebhookMethod} onChange={e => setEditWebhookMethod?.(e.target.value)}>
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
              <select value={editPollingMethod} onChange={e => setEditPollingMethod?.(e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL a consultar periódicamente</span>
              <input type="text" value={editPollingUrl} onChange={e => setEditPollingUrl?.(e.target.value)} placeholder="https://api.ejemplo.com/items" />
            </div>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cabeceras (Headers JSON)</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editPollingHeaders} onChange={e => setEditPollingHeaders?.(e.target.value)} placeholder='{"Authorization": "Bearer ..."}' rows={3} />
          </div>
          {editPollingMethod !== "GET" && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cuerpo (Body)</span>
              <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editPollingBody} onChange={e => setEditPollingBody?.(e.target.value)} placeholder="{}" rows={3} />
            </div>
          )}
          <div style={{ width: "180px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Intervalo (segundos)</span>
            <input type="number" min={5} value={editPollingInterval} onChange={e => setEditPollingInterval?.(Math.max(5, parseInt(e.target.value, 10) || 60))} />
          </div>
        </div>
      )}

      {type === "trigger" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Frecuencia / Modo de Inicio</span>
          <select value={editTriggerSchedule} onChange={e => setEditTriggerSchedule?.(e.target.value)}>
            <option value="manual">Manual (Al presionar ejecutar)</option>
            <option value="cron">Cron (Programado)</option>
            <option value="interval">Intervalo periódico</option>
          </select>
        </div>
      )}

      {type === "cron" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Expresión Cron o Intervalo (Ej. 1m, 1h, 0 9 * * *)</span>
          <input type="text" value={editCronSchedule} onChange={e => setEditCronSchedule?.(e.target.value)} placeholder="1h o */10 * * * *" />
        </div>
      )}

      {type === "startup" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Modo de Disparo al Iniciar</span>
            <select value={editStartupMode || "system"} onChange={e => setEditStartupMode?.(e.target.value as "system" | "app_launch")}>
              <option value="system">🚀 Al iniciar grapScreen en el sistema</option>
              <option value="app_launch">💻 Al abrir una aplicación específica</option>
            </select>
          </div>
          {editStartupMode === "app_launch" && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ejecutable Objetivo</span>
              <select value={editStartupAppExe || "chrome.exe"} onChange={e => setEditStartupAppExe?.(e.target.value)}>
                {systemApps.map((a, idx) => (
                  <option key={idx} value={a.exe}>💻 {a.name} ({a.exe})</option>
                ))}
                <option value="chrome.exe">Google Chrome (chrome.exe)</option>
                <option value="excel.exe">Microsoft Excel (excel.exe)</option>
                <option value="notepad.exe">Bloc de Notas (notepad.exe)</option>
              </select>
            </div>
          )}
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Retardo de Inicio (Segundos)</span>
            <input type="number" min={0} max={300} value={editStartupDelay || 0} onChange={e => setEditStartupDelay?.(Number(e.target.value))} />
          </div>
        </div>
      )}

      {type === "file_change" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta a vigilar</span>
            <input type="text" value={editFileChangePath} onChange={e => setEditFileChangePath?.(e.target.value)} placeholder="C:\carpeta o /home/usuario/descargas" />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Evento detectado</span>
            <select value={editFileChangeEvent} onChange={e => setEditFileChangeEvent?.(e.target.value)}>
              <option value="Create">Archivo Creado</option>
              <option value="Modify">Archivo Modificado</option>
              <option value="Delete">Archivo Eliminado</option>
              <option value="Any">Cualquier Cambio</option>
            </select>
          </div>
        </div>
      )}

      {type === "hotkey_trigger" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Atajo Global del Sistema</span>
          <input type="text" value={editHotkeyTriggerShortcut} onChange={e => setEditHotkeyTriggerShortcut?.(e.target.value)} placeholder="Ctrl+Alt+A" />
        </div>
      )}

      {type === "whatsapp_trigger" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Phone Number ID (Meta Cloud API)</span>
            <input type="text" value={editWhatsappTriggerPhoneId || ""} onChange={e => setEditWhatsappTriggerPhoneId?.(e.target.value)} placeholder="105938472910482" />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Verify Token (Token de Verificación)</span>
            <input type="text" value={editWhatsappTriggerToken || ""} onChange={e => setEditWhatsappTriggerToken?.(e.target.value)} placeholder="mi_token_secreto_webhook" />
          </div>
          <div style={{ fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Recibe mensajes entrantes de WhatsApp Cloud API mediante webhook local (puerto 8787).
          </div>
        </div>
      )}

      {type === "telegram_trigger" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Bot Token (@BotFather)</span>
            <input type="password" value={editTelegramTriggerBotToken || ""} onChange={e => setEditTelegramTriggerBotToken?.(e.target.value)} placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ" />
          </div>
          <div style={{ fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            Consulta periódicamente las actualizaciones de tu bot de Telegram y dispara el flujo con el mensaje recibido.
          </div>
        </div>
      )}

      {type === "email_trigger" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Servidor IMAP</span>
              <input type="text" value={editEmailTriggerHost || ""} onChange={e => setEditEmailTriggerHost?.(e.target.value)} placeholder="imap.gmail.com" />
            </div>
            <div style={{ width: "100px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Puerto</span>
              <input type="number" value={editEmailTriggerPort || 993} onChange={e => setEditEmailTriggerPort?.(parseInt(e.target.value, 10) || 993)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Usuario / Correo</span>
              <input type="text" value={editEmailTriggerUser || ""} onChange={e => setEditEmailTriggerUser?.(e.target.value)} placeholder="tu@correo.com" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Contraseña o Token</span>
              <input type="password" value={editEmailTriggerPassword || ""} onChange={e => setEditEmailTriggerPassword?.(e.target.value)} placeholder="app password" />
            </div>
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Carpeta / Buzón</span>
            <input type="text" value={editEmailTriggerFolder || "INBOX"} onChange={e => setEditEmailTriggerFolder?.(e.target.value)} placeholder="INBOX" />
          </div>
        </div>
      )}

      {type === "rss_trigger" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del Feed RSS / Atom</span>
            <input type="text" value={editRssTriggerUrl || ""} onChange={e => setEditRssTriggerUrl?.(e.target.value)} placeholder="https://noticias.com/feed.xml" />
          </div>
          <div style={{ width: "180px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Intervalo de chequeo (segundos)</span>
            <input type="number" min={10} value={editRssTriggerInterval || 60} onChange={e => setEditRssTriggerInterval?.(parseInt(e.target.value, 10) || 60)} />
          </div>
        </div>
      )}
    </>
  );
}
