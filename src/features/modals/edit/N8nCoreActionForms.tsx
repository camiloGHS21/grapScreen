import React from "react";

interface N8nCoreActionFormsProps {
  type: string;
  state: any;
}

export function N8nCoreActionForms({ type, state }: N8nCoreActionFormsProps) {
  const {
    editHttpRequestMethod, setEditHttpRequestMethod,
    editHttpRequestUrl, setEditHttpRequestUrl,
    editHttpRequestHeaders, setEditHttpRequestHeaders,
    editHttpRequestBody, setEditHttpRequestBody,
    editHttpRequestOutputVar, setEditHttpRequestOutputVar,
    editCodeLanguage, setEditCodeLanguage,
    editCodeContent, setEditCodeContent,
    editCodeOutputVar, setEditCodeOutputVar,
    editScrollY, setEditScrollY,
    editErrorHandlerAction, setEditErrorHandlerAction,
    editErrorHandlerMaxRetries, setEditErrorHandlerMaxRetries,
    editStopErrorMessage, setEditStopErrorMessage,
  } = state;

  return (
    <>
      {type === "http_request" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ width: "120px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Método</span>
              <select value={editHttpRequestMethod} onChange={e => setEditHttpRequestMethod?.(e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
                <option value="HEAD">HEAD</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del Endpoint</span>
              <input type="text" value={editHttpRequestUrl} onChange={e => setEditHttpRequestUrl?.(e.target.value)} placeholder="https://api.ejemplo.com/recurso" />
            </div>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cabeceras (Headers JSON)</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editHttpRequestHeaders} onChange={e => setEditHttpRequestHeaders?.(e.target.value)} placeholder='{"Authorization": "Bearer ...", "Content-Type": "application/json"}' rows={3} />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Cuerpo de la Petición (Body)</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editHttpRequestBody} onChange={e => setEditHttpRequestBody?.(e.target.value)} placeholder='{"query": "ejemplo", "valor": "{{ $json.campo }}"}' rows={4} />
          </div>
          <div style={{ marginTop: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Guardar respuesta en variable</span>
            <input type="text" value={editHttpRequestOutputVar} onChange={e => setEditHttpRequestOutputVar?.(e.target.value)} placeholder="http_response" style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }} />
            <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>Disponible como {'{{ ' + (editHttpRequestOutputVar || "http_response") + ' }}'} y estado en {'{{ ' + (editHttpRequestOutputVar || "http_response") + '_status }}'}</span>
          </div>
        </div>
      )}

      {type === "code" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Lenguaje de ejecución</span>
            <select value={editCodeLanguage} onChange={e => setEditCodeLanguage?.(e.target.value)}>
              <option value="javascript">JavaScript (Node.js)</option>
              <option value="python">Python 3</option>
            </select>
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Código Script</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editCodeContent} onChange={e => setEditCodeContent?.(e.target.value)} rows={8} placeholder="// Escribe código que transforme datos o use console.log/print" />
          </div>
          <div style={{ marginTop: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Guardar salida (stdout) en variable</span>
            <input type="text" value={editCodeOutputVar} onChange={e => setEditCodeOutputVar?.(e.target.value)} placeholder="code_output" style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }} />
            <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>Disponible en flujos como {'{{ ' + (editCodeOutputVar || "code_output") + ' }}'}</span>
          </div>
        </div>
      )}

      {type === "scroll" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Desplazamiento Vertical (Delta Y en píxeles)</span>
          <input type="number" value={editScrollY} onChange={e => setEditScrollY?.(parseInt(e.target.value, 10) || 0)} placeholder="Ej. -120 para scroll abajo, 120 para scroll arriba" />
          <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>Un valor negativo desplaza hacia abajo; positivo desplaza hacia arriba.</span>
        </div>
      )}

      {type === "error_handler" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Acción en caso de error</span>
            <select value={editErrorHandlerAction} onChange={e => setEditErrorHandlerAction?.(e.target.value)}>
              <option value="retry">Reintentar paso fallido</option>
              <option value="ignore">Ignorar y continuar flujo</option>
              <option value="stop">Detener ejecución completa</option>
            </select>
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Intentos Máximos</span>
            <input type="number" min={1} max={10} value={editErrorHandlerMaxRetries} onChange={e => setEditErrorHandlerMaxRetries?.(parseInt(e.target.value, 10) || 1)} />
          </div>
        </div>
      )}

      {type === "stop_error" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Mensaje de error</span>
          <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editStopErrorMessage} onChange={e => setEditStopErrorMessage?.(e.target.value)} placeholder="El flujo se detuvo porque…" rows={3} />
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
            El flujo se aborta con este mensaje. Admite expresiones dinámicas como <code>{"{{ $json.motivo }}"}</code>.
          </div>
        </div>
      )}

      {type === "noop" && (
        <div style={{ marginBottom: "16px", fontSize: "11px", color: "var(--dim)", lineHeight: 1.5 }}>
          Este nodo es un paso pasante (No Operation): deja pasar los items intactos sin modificar ninguna variable ni dato.
        </div>
      )}
    </>
  );
}
