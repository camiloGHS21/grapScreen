import React from "react";

interface N8nIntegrationFormsProps {
  type: string;
  state: any;
}

export function N8nIntegrationForms({ type, state }: N8nIntegrationFormsProps) {
  const {
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
  } = state;

  return (
    <>
      {type === "send_email" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Servidor SMTP</span>
              <input type="text" value={editEmailSmtpHost} onChange={e => setEditEmailSmtpHost?.(e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div style={{ width: "120px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Puerto</span>
              <input type="number" value={editEmailSmtpPort} onChange={e => setEditEmailSmtpPort?.(parseInt(e.target.value, 10) || 587)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Usuario</span>
              <input type="text" value={editEmailUsername} onChange={e => setEditEmailUsername?.(e.target.value)} placeholder="tu@correo.com" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Contraseña</span>
              <input type="password" value={editEmailPassword} onChange={e => setEditEmailPassword?.(e.target.value)} placeholder="contraseña o app password" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Remitente</span>
              <input type="text" value={editEmailFrom} onChange={e => setEditEmailFrom?.(e.target.value)} placeholder="tu@correo.com" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Destinatario</span>
              <input type="text" value={editEmailTo} onChange={e => setEditEmailTo?.(e.target.value)} placeholder="{{ $json.email }}" />
            </div>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Asunto</span>
            <input type="text" value={editEmailSubject} onChange={e => setEditEmailSubject?.(e.target.value)} placeholder="Asunto del correo" />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cuerpo</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editEmailBody} onChange={e => setEditEmailBody?.(e.target.value)} placeholder="{{ $json.mensaje }}" rows={5} />
          </div>
          <div className="ndv-toggle">
            <input type="checkbox" id="ndv-email-html" checked={editEmailIsHtml} onChange={e => setEditEmailIsHtml?.(e.target.checked)} />
            <label htmlFor="ndv-email-html">Enviar como HTML</label>
          </div>
        </div>
      )}

      {type === "slack_webhook" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del Incoming Webhook</span>
            <input type="text" value={editSlackWebhookUrl} onChange={e => setEditSlackWebhookUrl?.(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Mensaje</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editSlackText} onChange={e => setEditSlackText?.(e.target.value)} placeholder="{{ $json.mensaje }}" rows={4} />
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Canal (opcional)</span>
              <input type="text" value={editSlackChannel} onChange={e => setEditSlackChannel?.(e.target.value)} placeholder="#general" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Nombre del bot (opcional)</span>
              <input type="text" value={editSlackBotName} onChange={e => setEditSlackBotName?.(e.target.value)} placeholder="grapScreen" />
            </div>
          </div>
        </div>
      )}

      {type === "discord_webhook" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del Webhook de Discord</span>
            <input type="text" value={editDiscordWebhookUrl} onChange={e => setEditDiscordWebhookUrl?.(e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Contenido</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editDiscordContent} onChange={e => setEditDiscordContent?.(e.target.value)} placeholder="{{ $json.mensaje }}" rows={4} />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Nombre del bot (opcional)</span>
            <input type="text" value={editDiscordBotName} onChange={e => setEditDiscordBotName?.(e.target.value)} placeholder="grapScreen" />
          </div>
        </div>
      )}

      {type === "notion" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Operación</span>
            <select value={editNotionOperation} onChange={e => setEditNotionOperation?.(e.target.value)}>
              <option value="query_database">Consultar base de datos</option>
              <option value="create_page">Crear página</option>
              <option value="update_page">Actualizar página</option>
            </select>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Token de integración</span>
            <input type="password" value={editNotionToken} onChange={e => setEditNotionToken?.(e.target.value)} placeholder="secret_... (o credencial vinculada)" />
          </div>
          {editNotionOperation === "query_database" && (
            <>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>ID de la base de datos</span>
                <input type="text" value={editNotionDatabaseId} onChange={e => setEditNotionDatabaseId?.(e.target.value)} placeholder="32 caracteres" />
              </div>
              <div>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Filtro (JSON, opcional)</span>
                <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editNotionFilter} onChange={e => setEditNotionFilter?.(e.target.value)} placeholder='{"property": "Estado", "select": {"equals": "Hecho"}}' rows={3} />
              </div>
            </>
          )}
          {editNotionOperation === "create_page" && (
            <>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>ID de la base de datos</span>
                <input type="text" value={editNotionDatabaseId} onChange={e => setEditNotionDatabaseId?.(e.target.value)} placeholder="32 caracteres" />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Título de la página</span>
                <input type="text" value={editNotionTitle} onChange={e => setEditNotionTitle?.(e.target.value)} placeholder="{{ $json.titulo }}" />
              </div>
              <div>
                <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Propiedades (JSON, opcional)</span>
                <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editNotionProperties} onChange={e => setEditNotionProperties?.(e.target.value)} placeholder='{"Estado": {"select": {"name": "Nuevo"}}}' rows={3} />
              </div>
            </>
          )}
          {editNotionOperation === "update_page" && (
            <div>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>ID de la página</span>
              <input type="text" value={editNotionPageId} onChange={e => setEditNotionPageId?.(e.target.value)} placeholder="32 caracteres" />
            </div>
          )}
        </div>
      )}

      {type === "airtable" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Operación</span>
            <select value={editAirtableOperation} onChange={e => setEditAirtableOperation?.(e.target.value)}>
              <option value="list">Listar registros</option>
              <option value="create">Crear registro</option>
              <option value="update">Actualizar registro</option>
              <option value="delete">Eliminar registro</option>
            </select>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>API key / PAT</span>
            <input type="password" value={editAirtableApiKey} onChange={e => setEditAirtableApiKey?.(e.target.value)} placeholder="pat... (o credencial vinculada)" />
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Base ID</span>
              <input type="text" value={editAirtableBaseId} onChange={e => setEditAirtableBaseId?.(e.target.value)} placeholder="appXXXXXXXXXXXXXX" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Tabla</span>
              <input type="text" value={editAirtableTable} onChange={e => setEditAirtableTable?.(e.target.value)} placeholder="Clientes" />
            </div>
          </div>
          {(editAirtableOperation === "update" || editAirtableOperation === "delete") && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>ID del registro</span>
              <input type="text" value={editAirtableRecordId} onChange={e => setEditAirtableRecordId?.(e.target.value)} placeholder="recXXXXXXXXXXXXXX" />
            </div>
          )}
          {(editAirtableOperation === "create" || editAirtableOperation === "update") && (
            <div>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campos (JSON)</span>
              <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editAirtableFields} onChange={e => setEditAirtableFields?.(e.target.value)} placeholder='{"Nombre": "{{ $json.nombre }}"}' rows={3} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
