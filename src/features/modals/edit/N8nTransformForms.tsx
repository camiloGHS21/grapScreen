import React from "react";

interface N8nTransformFormsProps {
  type: string;
  state: any;
}

export function N8nTransformForms({ type, state }: N8nTransformFormsProps) {
  const {
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
    editWriteFileAppend, setEditWriteFileAppend,
    editXmlSource, setEditXmlSource,
    editXmlRoot, setEditXmlRoot,
    editHtmlSource, setEditHtmlSource,
    editHtmlSelector, setEditHtmlSelector,
    editHtmlAttr, setEditHtmlAttr,
    editRssUrl, setEditRssUrl,
    editRssLimit, setEditRssLimit,
  } = state;

  return (
    <>
      {type === "split_out" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo que contiene la lista</span>
            <input type="text" value={editSplitOutField} onChange={e => setEditSplitOutField?.(e.target.value)} placeholder="items" />
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Otros campos</span>
              <select value={editSplitOutInclude} onChange={e => setEditSplitOutInclude?.(e.target.value)}>
                <option value="none">Ninguno</option>
                <option value="all">Todos los demás</option>
                <option value="selected">Solo los indicados</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Guardar el elemento en</span>
              <input type="text" value={editSplitOutDestination} onChange={e => setEditSplitOutDestination?.(e.target.value)} placeholder="(opcional) fila" />
            </div>
          </div>
          {editSplitOutInclude === "selected" && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campos a conservar (separados por comas)</span>
              <input type="text" value={editSplitOutIncludeFields} onChange={e => setEditSplitOutIncludeFields?.(e.target.value)} placeholder="id, nombre" />
            </div>
          )}
        </div>
      )}

      {type === "summarize" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Agrupar por (separado por comas)</span>
            <input type="text" value={editSummarizeGroupBy} onChange={e => setEditSummarizeGroupBy?.(e.target.value)} placeholder="ciudad, categoría" />
          </div>
          <div style={{ marginBottom: "8px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Agregaciones</span>
            {(editSummarizeAggregations || []).map((agg: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                <select
                  style={{ flex: 1 }}
                  value={agg.operation || "count"}
                  onChange={e => {
                    const next = [...(editSummarizeAggregations || [])];
                    next[i] = { ...agg, operation: e.target.value };
                    setEditSummarizeAggregations?.(next);
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
                </select>
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={agg.field || ""}
                  onChange={e => {
                    const next = [...(editSummarizeAggregations || [])];
                    next[i] = { ...agg, field: e.target.value };
                    setEditSummarizeAggregations?.(next);
                  }}
                  placeholder="campo"
                />
                <input
                  type="text"
                  style={{ width: "100px" }}
                  value={agg.output_field || ""}
                  onChange={e => {
                    const next = [...(editSummarizeAggregations || [])];
                    next[i] = { ...agg, output_field: e.target.value };
                    setEditSummarizeAggregations?.(next);
                  }}
                  placeholder="salida"
                />
                <button
                  type="button"
                  onClick={() => setEditSummarizeAggregations?.(editSummarizeAggregations.filter((_: any, j: number) => j !== i))}
                  style={{ padding: "2px 8px" }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEditSummarizeAggregations?.([...(editSummarizeAggregations || []), { operation: "count", field: "", output_field: "" }])}
              style={{ padding: "3px 10px", fontSize: "11px", borderRadius: "4px" }}
            >
              + Añadir agregación
            </button>
          </div>
          <div style={{ width: "180px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Separador</span>
            <input type="text" value={editSummarizeSeparator} onChange={e => setEditSummarizeSeparator?.(e.target.value)} placeholder=", " />
          </div>
        </div>
      )}

      {type === "rename_keys" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Renombrados de Claves</span>
            {(editRenameKeysRules || []).map((rule: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={rule.from || ""}
                  onChange={e => {
                    const next = [...(editRenameKeysRules || [])];
                    next[i] = { ...rule, from: e.target.value };
                    setEditRenameKeysRules?.(next);
                  }}
                  placeholder="clave_anterior"
                />
                <span style={{ color: "var(--dim)" }}>→</span>
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={rule.to || ""}
                  onChange={e => {
                    const next = [...(editRenameKeysRules || [])];
                    next[i] = { ...rule, to: e.target.value };
                    setEditRenameKeysRules?.(next);
                  }}
                  placeholder="nueva_clave"
                />
                <button
                  type="button"
                  onClick={() => setEditRenameKeysRules?.(editRenameKeysRules.filter((_: any, j: number) => j !== i))}
                  style={{ padding: "2px 8px" }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEditRenameKeysRules?.([...(editRenameKeysRules || []), { from: "", to: "" }])}
              style={{ padding: "3px 10px", fontSize: "11px", borderRadius: "4px" }}
            >
              + Añadir regla
            </button>
          </div>
          <div style={{ width: "200px", marginBottom: "10px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Modo</span>
            <select value={editRenameKeysMode} onChange={e => setEditRenameKeysMode?.(e.target.value)}>
              <option value="plain">Coincidencia exacta</option>
              <option value="regex">Expresión regular</option>
            </select>
          </div>
          <div className="ndv-toggle">
            <input type="checkbox" id="ndv-rk-keep" checked={editRenameKeysKeepOnly} onChange={e => setEditRenameKeysKeepOnly?.(e.target.checked)} />
            <label htmlFor="ndv-rk-keep">Conservar únicamente los campos renombrados</label>
          </div>
        </div>
      )}

      {type === "markdown" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ width: "240px", marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Modo de conversión</span>
            <select value={editMarkdownMode} onChange={e => setEditMarkdownMode?.(e.target.value)}>
              <option value="markdown_to_html">Markdown → HTML</option>
              <option value="html_to_markdown">HTML → Markdown</option>
            </select>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Texto de origen</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editMarkdownSource} onChange={e => setEditMarkdownSource?.(e.target.value)} placeholder="{{ $json.text }}" rows={4} />
          </div>
          <div style={{ width: "200px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo destino</span>
            <input type="text" value={editMarkdownTarget} onChange={e => setEditMarkdownTarget?.(e.target.value)} placeholder="data" />
          </div>
        </div>
      )}

      {type === "crypto" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Acción</span>
              <select value={editCryptoAction} onChange={e => setEditCryptoAction?.(e.target.value)}>
                <option value="hash">Hash</option>
                <option value="hmac">HMAC</option>
                <option value="random">Cadena aleatoria</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Algoritmo</span>
              <select value={editCryptoAlgorithm} onChange={e => setEditCryptoAlgorithm?.(e.target.value)} disabled={editCryptoAction === "random"}>
                <option value="SHA256">SHA-256</option>
                <option value="MD5">MD5</option>
                <option value="SHA1">SHA-1</option>
                <option value="SHA512">SHA-512</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Codificación</span>
              <select value={editCryptoEncoding} onChange={e => setEditCryptoEncoding?.(e.target.value)}>
                <option value="hex">hex</option>
                <option value="base64">base64</option>
                {editCryptoAction === "random" && <option value="alphanumeric">alfanumérica</option>}
              </select>
            </div>
          </div>
          {editCryptoAction !== "random" && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Valor</span>
              <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editCryptoValue} onChange={e => setEditCryptoValue?.(e.target.value)} placeholder="{{ $json.text }}" rows={3} />
            </div>
          )}
          {editCryptoAction === "hmac" && (
            <div style={{ marginBottom: "12px" }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Clave Secreta</span>
              <input type="text" value={editCryptoSecret} onChange={e => setEditCryptoSecret?.(e.target.value)} placeholder="secreto" />
            </div>
          )}
          <div style={{ width: "200px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo destino</span>
            <input type="text" value={editCryptoTarget} onChange={e => setEditCryptoTarget?.(e.target.value)} placeholder="data" />
          </div>
        </div>
      )}

      {type === "read_file" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta del archivo en disco</span>
            <input type="text" value={editReadFilePath} onChange={e => setEditReadFilePath?.(e.target.value)} placeholder="~/datos.txt o C:\archivos\entrada.csv" />
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Codificación</span>
              <select value={editReadFileEncoding} onChange={e => setEditReadFileEncoding?.(e.target.value)}>
                <option value="utf8">Texto (UTF-8)</option>
                <option value="base64">Base64 (binario)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo de salida</span>
              <input type="text" value={editReadFileTarget} onChange={e => setEditReadFileTarget?.(e.target.value)} placeholder="data" />
            </div>
          </div>
        </div>
      )}

      {type === "write_file" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta del archivo en disco</span>
            <input type="text" value={editWriteFilePath} onChange={e => setEditWriteFilePath?.(e.target.value)} placeholder="~/salida.txt o C:\archivos\resultado.txt" />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Contenido a escribir</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editWriteFileContent} onChange={e => setEditWriteFileContent?.(e.target.value)} placeholder="{{ $json.text }}" rows={4} />
          </div>
          <div className="ndv-toggle">
            <input type="checkbox" id="ndv-wf-append" checked={editWriteFileAppend} onChange={e => setEditWriteFileAppend?.(e.target.checked)} />
            <label htmlFor="ndv-wf-append">Añadir al final (Append) en vez de sobrescribir</label>
          </div>
        </div>
      )}

      {type === "xml_parse" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>XML de origen</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editXmlSource} onChange={e => setEditXmlSource?.(e.target.value)} placeholder="{{ $json.xml }}" rows={4} />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Ruta al elemento a expandir (opcional)</span>
            <input type="text" value={editXmlRoot} onChange={e => setEditXmlRoot?.(e.target.value)} placeholder="channel.item" />
          </div>
        </div>
      )}

      {type === "html_extract" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>HTML de origen</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editHtmlSource} onChange={e => setEditHtmlSource?.(e.target.value)} placeholder="{{ $json.html }}" rows={4} />
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Selector CSS</span>
              <input type="text" value={editHtmlSelector} onChange={e => setEditHtmlSelector?.(e.target.value)} placeholder="a.titulo, div.precio" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Atributos</span>
              <input type="text" value={editHtmlAttr} onChange={e => setEditHtmlAttr?.(e.target.value)} placeholder="href, title" />
            </div>
          </div>
        </div>
      )}

      {type === "rss_read" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>URL del Feed RSS / Atom</span>
            <input type="text" value={editRssUrl} onChange={e => setEditRssUrl?.(e.target.value)} placeholder="https://news.ycombinator.com/rss" />
          </div>
          <div style={{ width: "160px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Límite de entradas</span>
            <input type="number" min={1} value={editRssLimit} onChange={e => setEditRssLimit?.(parseInt(e.target.value, 10) || 20)} />
          </div>
        </div>
      )}
    </>
  );
}
