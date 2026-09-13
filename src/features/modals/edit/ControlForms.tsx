import React from "react";

interface DelayFormProps {
  editSeconds: number; setEditSeconds: (s: number) => void;
}
export function DelayForm({ editSeconds, setEditSeconds }: DelayFormProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Tiempo de espera (segundos)</span>
      <input type="number" step="0.1" min="0" value={editSeconds} onChange={e => setEditSeconds(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

interface WaitImageFormProps {
  editWaitImageDesc: string; setEditWaitImageDesc: (d: string) => void;
  editWaitImageTimeout: number; setEditWaitImageTimeout: (t: number) => void;
}
export function WaitImageForm({ editWaitImageDesc, setEditWaitImageDesc, editWaitImageTimeout, setEditWaitImageTimeout }: WaitImageFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Descripción de la imagen a buscar</span>
        <input type="text" value={editWaitImageDesc} onChange={e => setEditWaitImageDesc(e.target.value)} placeholder="Ej. Botón de aceptar verde" />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Tiempo de espera máximo (Timeout en segundos)</span>
        <input type="number" value={editWaitImageTimeout} onChange={e => setEditWaitImageTimeout(parseInt(e.target.value) || 10)} min="1" />
      </div>
    </div>
  );
}

interface SetVarFormProps {
  editVarName: string; setEditVarName: (n: string) => void;
  editVarValue: string; setEditVarValue: (v: string) => void;
}
export function SetVarForm({ editVarName, setEditVarName, editVarValue, setEditVarValue }: SetVarFormProps) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
      <div style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Nombre de variable</span>
        <input type="text" value={editVarName} onChange={e => setEditVarName(e.target.value)} placeholder="Ej. contador" />
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Valor asignado</span>
        <input type="text" value={editVarValue} onChange={e => setEditVarValue(e.target.value)} placeholder="Ej. 1" />
      </div>
    </div>
  );
}

interface ScreenshotFormProps {
  editScreenshotName: string; setEditScreenshotName: (s: string) => void;
}
export function ScreenshotForm({ editScreenshotName, setEditScreenshotName }: ScreenshotFormProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Nombre del archivo de captura (PNG)</span>
      <input type="text" value={editScreenshotName} onChange={e => setEditScreenshotName(e.target.value)} placeholder="Ej. pantalla_inicio.png" />
    </div>
  );
}

interface RunCmdFormProps {
  editRunCmd: string; setEditRunCmd: (c: string) => void;
  editRunCmdArgs: string; setEditRunCmdArgs: (a: string) => void;
}
export function RunCmdForm({ editRunCmd, setEditRunCmd, editRunCmdArgs, setEditRunCmdArgs }: RunCmdFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Comando del sistema</span>
        <input type="text" value={editRunCmd} onChange={e => setEditRunCmd(e.target.value)} placeholder="Ej. ping google.com" />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Argumentos (Opcional)</span>
        <input type="text" value={editRunCmdArgs} onChange={e => setEditRunCmdArgs(e.target.value)} placeholder="Ej. -n 4" />
      </div>
    </div>
  );
}

interface ConditionFormProps {
  editConditionDesc: string; setEditConditionDesc: (d: string) => void;
  editConditionType: "pixel" | "text" | "image" | "expression"; setEditConditionType: (t: "pixel" | "text" | "image" | "expression") => void;
  editConditionExpression?: string; setEditConditionExpression?: (e: string) => void;
}
export function ConditionForm({ editConditionDesc, setEditConditionDesc, editConditionType, setEditConditionType, editConditionExpression, setEditConditionExpression }: ConditionFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Tipo de evaluación</span>
        <select
          value={editConditionType}
          onChange={e => setEditConditionType(e.target.value as any)}
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
          <option value="expression">Expresión con variables (n8n)</option>
          <option value="text">Presencia de texto (OCR)</option>
          <option value="image">Presencia de imagen (Template Matching)</option>
          <option value="pixel">Color de píxel específico</option>
        </select>
      </div>
      {editConditionType === "expression" ? (
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Expresión (estilo n8n)</span>
          <input
            type="text"
            value={editConditionExpression ?? ""}
            onChange={e => setEditConditionExpression?.(e.target.value)}
            placeholder='{{ $json.total }} > 1000  ·  {{ $json.status }} == "ok"'
            style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
          />
          <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px', lineHeight: 1.6 }}>
            <strong>{'{{ $json.campo }}'}</strong> — dato del item actual ·{' '}
            <strong>{'{{ $node["HTTP"].json.id }}'}</strong> — salida de un nodo anterior ·{' '}
            <strong>{'{{ $items().length }}'}</strong> — número de items ·{' '}
            <strong>{'{{ $now }}'}</strong> / <strong>{'{{ $today }}'}</strong> — fecha y hora
            <br />
            Operadores: == != &gt; &lt; &gt;= &lt;= && || · aritmética + - * / % · contains, starts with, ends with
          </span>
        </div>
      ) : (
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Descripción de la regla lógica</span>
          <input type="text" value={editConditionDesc} onChange={e => setEditConditionDesc(e.target.value)} placeholder="Ej. Si la pantalla contiene el texto 'Éxito'" />
        </div>
      )}
    </div>
  );
}

interface LoopFormProps {
  editLoopIterations: number; setEditLoopIterations: (i: number) => void;
}
export function LoopForm({ editLoopIterations, setEditLoopIterations }: LoopFormProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Número de iteraciones (Repeticiones)</span>
      <input type="number" value={editLoopIterations} onChange={e => setEditLoopIterations(parseInt(e.target.value) || 1)} min="1" />
    </div>
  );
}

interface SplitBatchesFormProps {
  editSplitArrayVar: string; setEditSplitArrayVar: (v: string) => void;
  editSplitBatchSize: number; setEditSplitBatchSize: (n: number) => void;
}
export function SplitBatchesForm({ editSplitArrayVar, setEditSplitArrayVar, editSplitBatchSize, setEditSplitBatchSize }: SplitBatchesFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Variable con el array (JSON)</span>
        <input
          type="text"
          value={editSplitArrayVar}
          onChange={e => setEditSplitArrayVar(e.target.value)}
          placeholder="items  ·  {{ http_response }}"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Cada iteración expone {'{{ item }}'}, {'{{ item.index }}'} y {'{{ item.count }}'} al cuerpo del bucle.
        </span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Tamaño de lote (batch)</span>
        <input type="number" value={editSplitBatchSize} onChange={e => setEditSplitBatchSize(parseInt(e.target.value) || 1)} min="1" />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Data transformation (Phase 3)
 * ──────────────────────────────────────────────────────────────────────── */

interface FilterFormProps {
  editFilterCondition: string; setEditFilterCondition: (v: string) => void;
  editFilterMode: string; setEditFilterMode: (v: string) => void;
}
export function FilterForm({ editFilterCondition, setEditFilterCondition, editFilterMode, setEditFilterMode }: FilterFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Condición (se evalúa por cada item)</span>
        <input
          type="text"
          value={editFilterCondition}
          onChange={e => setEditFilterCondition(e.target.value)}
          placeholder='{{ $json.total }} > 100'
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Conserva los items que cumplen la condición. Admite {'{{ $json.campo }}'}, comparaciones y && · ||.
        </span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Acción</span>
        <select value={editFilterMode} onChange={e => setEditFilterMode(e.target.value)}>
          <option value="keep">Conservar los que cumplen</option>
          <option value="discard">Descartar los que cumplen</option>
        </select>
      </div>
    </div>
  );
}

interface SortFormProps {
  editSortFields: string; setEditSortFields: (v: string) => void;
}
export function SortForm({ editSortFields, setEditSortFields }: SortFormProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campos de ordenación</span>
      <input
        type="text"
        value={editSortFields}
        onChange={e => setEditSortFields(e.target.value)}
        placeholder="nombre  ·  -fecha  ·  ciudad,nombre"
        style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
      />
      <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
        Separa varios campos con comas. Prefija un campo con <b>-</b> para orden descendente (ej. <code>-created_at</code>).
      </span>
    </div>
  );
}

interface LimitFormProps {
  editLimitSkip: number; setEditLimitSkip: (v: number) => void;
  editLimitMax: number; setEditLimitMax: (v: number) => void;
}
export function LimitForm({ editLimitSkip, setEditLimitSkip, editLimitMax, setEditLimitMax }: LimitFormProps) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
      <div style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Omitir los primeros N</span>
        <input type="number" min="0" value={editLimitSkip} onChange={e => setEditLimitSkip(parseInt(e.target.value) || 0)} />
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Máximo de items</span>
        <input type="number" min="0" value={editLimitMax} onChange={e => setEditLimitMax(parseInt(e.target.value) || 0)} />
      </div>
    </div>
  );
}

interface AggregateFormProps {
  editAggregateMode: string; setEditAggregateMode: (v: string) => void;
  editAggregateField: string; setEditAggregateField: (v: string) => void;
  editAggregateSeparator: string; setEditAggregateSeparator: (v: string) => void;
}
export function AggregateForm({ editAggregateMode, setEditAggregateMode, editAggregateField, setEditAggregateField, editAggregateSeparator, setEditAggregateSeparator }: AggregateFormProps) {
  const needsField = ["sum", "min", "max", "average", "collect", "concat"].includes(editAggregateMode);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Operación</span>
        <select value={editAggregateMode} onChange={e => setEditAggregateMode(e.target.value)}>
          <option value="list">Lista — todos los items en un array</option>
          <option value="count">Contar — número de items</option>
          <option value="sum">Sumar</option>
          <option value="average">Promedio</option>
          <option value="min">Mínimo</option>
          <option value="max">Máximo</option>
          <option value="collect">Recolectar un campo</option>
          <option value="concat">Concatenar un campo como texto</option>
        </select>
      </div>
      {needsField && (
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campo (ruta dentro de cada item)</span>
          <input
            type="text"
            value={editAggregateField}
            onChange={e => setEditAggregateField(e.target.value)}
            placeholder="precio  ·  cliente.nombre"
            style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
          />
        </div>
      )}
      {editAggregateMode === "concat" && (
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Separador</span>
          <input type="text" value={editAggregateSeparator} onChange={e => setEditAggregateSeparator(e.target.value)} placeholder=", " />
        </div>
      )}
      <span style={{ fontSize: '10px', color: 'var(--dim)' }}>
        La salida es un único item con el resultado.
      </span>
    </div>
  );
}

interface EditFieldsFormProps {
  editFieldsSet: string; setEditFieldsSet: (v: string) => void;
  editFieldsKeepOnly: string; setEditFieldsKeepOnly: (v: string) => void;
}
export function EditFieldsForm({ editFieldsSet, setEditFieldsSet, editFieldsKeepOnly, setEditFieldsKeepOnly }: EditFieldsFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campos a establecer (JSON)</span>
        <textarea
          value={editFieldsSet}
          onChange={e => setEditFieldsSet(e.target.value)}
          rows={6}
          placeholder={'{\n  "total": "{{ $json.precio * $json.cantidad }}"\n}'}
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Las claves se añaden o sobreescriben en cada item. Los valores admiten expresiones.
        </span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Conservar solo estos campos (opcional)</span>
        <input
          type="text"
          value={editFieldsKeepOnly}
          onChange={e => setEditFieldsKeepOnly(e.target.value)}
          placeholder="nombre,email,telefono"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Vacío mantiene todos los campos. Útil para quedarte con lo esencial.
        </span>
      </div>
    </div>
  );
}

interface DateTimeFormProps {
  editDateTimeOperation: string; setEditDateTimeOperation: (v: string) => void;
  editDateTimeField: string; setEditDateTimeField: (v: string) => void;
  editDateTimeFormat: string; setEditDateTimeFormat: (v: string) => void;
  editDateTimeUnit: string; setEditDateTimeUnit: (v: string) => void;
  editDateTimeAmount: number; setEditDateTimeAmount: (v: number) => void;
  editDateTimeCompareTo: string; setEditDateTimeCompareTo: (v: string) => void;
  editDateTimeResultField: string; setEditDateTimeResultField: (v: string) => void;
}
export function DateTimeForm({
  editDateTimeOperation, setEditDateTimeOperation,
  editDateTimeField, setEditDateTimeField,
  editDateTimeFormat, setEditDateTimeFormat,
  editDateTimeUnit, setEditDateTimeUnit,
  editDateTimeAmount, setEditDateTimeAmount,
  editDateTimeCompareTo, setEditDateTimeCompareTo,
  editDateTimeResultField, setEditDateTimeResultField,
}: DateTimeFormProps) {
  const needsField = editDateTimeOperation !== "now";
  const isShift = editDateTimeOperation === "add" || editDateTimeOperation === "subtract";
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Operación</span>
        <select value={editDateTimeOperation} onChange={e => setEditDateTimeOperation(e.target.value)}>
          <option value="format">Formatear una fecha</option>
          <option value="add">Sumar tiempo</option>
          <option value="subtract">Restar tiempo</option>
          <option value="diff">Diferencia entre dos fechas</option>
          <option value="now">Fecha y hora actual</option>
        </select>
      </div>
      {needsField && (
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campo con la fecha</span>
          <input
            type="text"
            value={editDateTimeField}
            onChange={e => setEditDateTimeField(e.target.value)}
            placeholder="created_at"
            style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
          />
        </div>
      )}
      {editDateTimeOperation === "diff" && (
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Comparar contra</span>
          <input
            type="text"
            value={editDateTimeCompareTo}
            onChange={e => setEditDateTimeCompareTo(e.target.value)}
            placeholder="{{ $now }}  ·  2026-01-01"
            style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
          />
        </div>
      )}
      {isShift && (
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Cantidad</span>
            <input type="number" value={editDateTimeAmount} onChange={e => setEditDateTimeAmount(parseInt(e.target.value) || 0)} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Unidad</span>
            <select value={editDateTimeUnit} onChange={e => setEditDateTimeUnit(e.target.value)}>
              <option value="seconds">Segundos</option>
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
              <option value="days">Días</option>
              <option value="weeks">Semanas</option>
              <option value="months">Meses</option>
              <option value="years">Años</option>
            </select>
          </div>
        </div>
      )}
      {editDateTimeOperation !== "diff" && (
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Formato de salida</span>
          <input
            type="text"
            value={editDateTimeFormat}
            onChange={e => setEditDateTimeFormat(e.target.value)}
            placeholder="%Y-%m-%d %H:%M:%S"
            style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
          />
          <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
            Formato tipo strftime: %Y año, %m mes, %d día, %H:%M:%S hora.
          </span>
        </div>
      )}
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Guardar resultado en el campo (opcional)</span>
        <input
          type="text"
          value={editDateTimeResultField}
          onChange={e => setEditDateTimeResultField(e.target.value)}
          placeholder="(sobrescribe el campo original)"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * AI (Phase 3)
 * ──────────────────────────────────────────────────────────────────────── */

interface AiConnectionFieldsProps {
  baseUrl: string; setBaseUrl: (v: string) => void;
  apiKey: string; setApiKey: (v: string) => void;
  model: string; setModel: (v: string) => void;
  /** Optional vault credential id; when set, its api_key replaces the inline one. */
  credentialId?: string; setCredentialId?: (v: string) => void;
  /** Available vault credentials, supplied by the parent modal. */
  credentials?: { id: string; name: string; cred_type?: string }[];
}
/**
 * Shared connection block for the AI nodes: any OpenAI-compatible endpoint,
 * including local servers (Ollama / LM Studio) where the key is optional.
 *
 * A node can authenticate either with an inline key or with a credential from
 * the vault. The vault wins when both are present, so secrets stay out of the
 * workflow definition.
 */
function AiConnectionFields({ baseUrl, setBaseUrl, apiKey, setApiKey, model, setModel, credentialId, setCredentialId, credentials }: AiConnectionFieldsProps) {
  const list = credentials || [];
  return (
    <>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>URL base del proveedor</span>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
      </div>
      {setCredentialId && (
        <div>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Credencial del vault</span>
          <select
            value={credentialId || ""}
            onChange={e => setCredentialId(e.target.value)}
            style={{ fontSize: '12px' }}
          >
            <option value="">— Sin credencial (usar API Key de abajo) —</option>
            {list.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.cred_type ? ` · ${c.cred_type}` : ""}
              </option>
            ))}
          </select>
          <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
            Si eliges una credencial, su clave tiene prioridad y no se guarda ningún secreto en el flujo.
          </span>
        </div>
      )}
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={credentialId ? "(la credencial del vault tiene prioridad)" : "sk-…  (déjala vacía para un servidor local)"}
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Modelo</span>
        <input
          type="text"
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="gpt-4o-mini"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Compatible con OpenAI, Azure, Groq, OpenRouter, Ollama, LM Studio…
        </span>
      </div>
    </>
  );
}

interface LlmChainFormProps extends AiConnectionFieldsProps {
  editLlmSystemPrompt: string; setEditLlmSystemPrompt: (v: string) => void;
  editLlmPrompt: string; setEditLlmPrompt: (v: string) => void;
  editLlmTemperature: number; setEditLlmTemperature: (v: number) => void;
  editLlmMaxTokens: number; setEditLlmMaxTokens: (v: number) => void;
  editLlmResultField: string; setEditLlmResultField: (v: string) => void;
  editLlmOutputVar: string; setEditLlmOutputVar: (v: string) => void;
}
export function LlmChainForm({
  baseUrl, setBaseUrl, apiKey, setApiKey, model, setModel,
  editLlmSystemPrompt, setEditLlmSystemPrompt,
  editLlmPrompt, setEditLlmPrompt,
  editLlmTemperature, setEditLlmTemperature,
  editLlmMaxTokens, setEditLlmMaxTokens,
  editLlmResultField, setEditLlmResultField,
  editLlmOutputVar, setEditLlmOutputVar,
}: LlmChainFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <AiConnectionFields baseUrl={baseUrl} setBaseUrl={setBaseUrl} apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Prompt del sistema (opcional)</span>
        <textarea
          value={editLlmSystemPrompt}
          onChange={e => setEditLlmSystemPrompt(e.target.value)}
          rows={2}
          placeholder="Eres un asistente que responde en español, breve y claro."
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Prompt</span>
        <textarea
          value={editLlmPrompt}
          onChange={e => setEditLlmPrompt(e.target.value)}
          rows={4}
          placeholder="Resume este texto: {{ $json.body }}"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Admite expresiones: los datos del item actual entran con {'{{ $json.campo }}'}.
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Temperatura</span>
          <input type="number" step="0.1" min="0" max="2" value={editLlmTemperature} onChange={e => setEditLlmTemperature(parseFloat(e.target.value) || 0)} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Máx. tokens</span>
          <input type="number" min="1" value={editLlmMaxTokens} onChange={e => setEditLlmMaxTokens(parseInt(e.target.value) || 1024)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campo de salida</span>
          <input type="text" value={editLlmResultField} onChange={e => setEditLlmResultField(e.target.value)} placeholder="text" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Variable</span>
          <input type="text" value={editLlmOutputVar} onChange={e => setEditLlmOutputVar(e.target.value)} placeholder="ai_output" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
        </div>
      </div>
    </div>
  );
}

interface ClassifierFormProps extends AiConnectionFieldsProps {
  editClsSystemPrompt: string; setEditClsSystemPrompt: (v: string) => void;
  editClsPrompt: string; setEditClsPrompt: (v: string) => void;
  editClsCategories: string[]; setEditClsCategories: (v: string[]) => void;
  editClsCategoryField: string; setEditClsCategoryField: (v: string) => void;
  editClsOutputVar: string; setEditClsOutputVar: (v: string) => void;
}
export function ClassifierForm({
  baseUrl, setBaseUrl, apiKey, setApiKey, model, setModel,
  editClsSystemPrompt, setEditClsSystemPrompt,
  editClsPrompt, setEditClsPrompt,
  editClsCategories, setEditClsCategories,
  editClsCategoryField, setEditClsCategoryField,
  editClsOutputVar, setEditClsOutputVar,
}: ClassifierFormProps) {
  const cats = Array.isArray(editClsCategories) ? editClsCategories : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <AiConnectionFields baseUrl={baseUrl} setBaseUrl={setBaseUrl} apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Texto a clasificar</span>
        <input
          type="text"
          value={editClsPrompt}
          onChange={e => setEditClsPrompt(e.target.value)}
          placeholder="{{ $json.mensaje }}"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Categorías</span>
        <input
          type="text"
          value={cats.join(", ")}
          onChange={e => setEditClsCategories(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
          placeholder="Factura, Soporte, Otro"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Sepáralas con comas. El modelo solo puede responder una de estas etiquetas.
        </span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Instrucciones extra (opcional)</span>
        <textarea
          value={editClsSystemPrompt}
          onChange={e => setEditClsSystemPrompt(e.target.value)}
          rows={2}
          placeholder="Clasifica según la intención del cliente."
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campo de categoría</span>
          <input type="text" value={editClsCategoryField} onChange={e => setEditClsCategoryField(e.target.value)} placeholder="category" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Variable</span>
          <input type="text" value={editClsOutputVar} onChange={e => setEditClsOutputVar(e.target.value)} placeholder="classification" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
        </div>
      </div>
      <span style={{ fontSize: '10px', color: 'var(--dim)' }}>
        Conecta la salida a un Switch para enrutar por categoría.
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Phase 4 — data hygiene, dataset diffs and structured/tonal AI
 * ──────────────────────────────────────────────────────────────────────── */

interface RemoveDuplicatesFormProps {
  editDedupeFields: string; setEditDedupeFields: (v: string) => void;
  editDedupeKeep: string; setEditDedupeKeep: (v: string) => void;
}
/**
 * Deduplicates items on a comma-separated key. Leaving the key empty removes
 * only exact duplicates of the whole item.
 */
export function RemoveDuplicatesForm({
  editDedupeFields, setEditDedupeFields,
  editDedupeKeep, setEditDedupeKeep,
}: RemoveDuplicatesFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campos que forman la clave</span>
        <input
          type="text"
          value={editDedupeFields}
          onChange={e => setEditDedupeFields(e.target.value)}
          placeholder="email,   o vacío para comparar el item completo"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Sepáralos con comas. Dos items con los mismos valores en estos campos se consideran repetidos.
        </span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Cuál conservar</span>
        <select value={editDedupeKeep} onChange={e => setEditDedupeKeep(e.target.value)} style={{ fontSize: '12px' }}>
          <option value="first">El primero que aparece</option>
          <option value="last">El último que aparece</option>
        </select>
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          El orden original se respeta en ambos casos.
        </span>
      </div>
    </div>
  );
}

interface CompareDatasetsFormProps {
  editCompareWith: string; setEditCompareWith: (v: string) => void;
  editCompareKey: string; setEditCompareKey: (v: string) => void;
  editCompareFields: string; setEditCompareFields: (v: string) => void;
  editCompareMode: string; setEditCompareMode: (v: string) => void;
}
/**
 * Diffs the incoming items against a second list. Emits one item per
 * difference, tagged with `change_type`.
 */
export function CompareDatasetsForm({
  editCompareWith, setEditCompareWith,
  editCompareKey, setEditCompareKey,
  editCompareFields, setEditCompareFields,
  editCompareMode, setEditCompareMode,
}: CompareDatasetsFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Comparar con</span>
        <input
          type="text"
          value={editCompareWith}
          onChange={e => setEditCompareWith(e.target.value)}
          placeholder="{{ $vars.lista_anterior }}  o un JSON: [{&quot;id&quot;:1}]"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Una variable o expresión que contenga la otra lista.
        </span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campo clave</span>
        <input
          type="text"
          value={editCompareKey}
          onChange={e => setEditCompareKey(e.target.value)}
          placeholder="id"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Empareja cada item de ambas listas por este campo.
        </span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campos a comparar (opcional)</span>
        <input
          type="text"
          value={editCompareFields}
          onChange={e => setEditCompareFields(e.target.value)}
          placeholder="total, estado   · vacío = comparar el item completo"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Qué emitir</span>
        <select value={editCompareMode} onChange={e => setEditCompareMode(e.target.value)} style={{ fontSize: '12px' }}>
          <option value="all">Todos los cambios</option>
          <option value="added">Solo añadidos</option>
          <option value="removed">Solo eliminados</option>
          <option value="changed">Solo modificados</option>
          <option value="same">Solo sin cambios</option>
        </select>
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Cada item sale con <code>change_type</code>, <code>key</code>, <code>current</code> y <code>previous</code>.
        </span>
      </div>
    </div>
  );
}

interface InformationExtractorFormProps extends AiConnectionFieldsProps {
  editExtractSystemPrompt: string; setEditExtractSystemPrompt: (v: string) => void;
  editExtractPrompt: string; setEditExtractPrompt: (v: string) => void;
  editExtractSchema: string; setEditExtractSchema: (v: string) => void;
  editExtractMode: string; setEditExtractMode: (v: string) => void;
  editExtractOutputVar: string; setEditExtractOutputVar: (v: string) => void;
}
/**
 * Turns free text into a structured object. The schema is a JSON object whose
 * values describe each field to pull out.
 */
export function InformationExtractorForm({
  baseUrl, setBaseUrl, apiKey, setApiKey, model, setModel, credentialId, setCredentialId, credentials,
  editExtractSystemPrompt, setEditExtractSystemPrompt,
  editExtractPrompt, setEditExtractPrompt,
  editExtractSchema, setEditExtractSchema,
  editExtractMode, setEditExtractMode,
  editExtractOutputVar, setEditExtractOutputVar,
}: InformationExtractorFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <AiConnectionFields baseUrl={baseUrl} setBaseUrl={setBaseUrl} apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} credentialId={credentialId} setCredentialId={setCredentialId} credentials={credentials} />
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Texto de entrada</span>
        <textarea
          value={editExtractPrompt}
          onChange={e => setEditExtractPrompt(e.target.value)}
          rows={3}
          placeholder="Extrae los datos de esta factura: {{ $json.body }}"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Esquema de salida (JSON)</span>
        <textarea
          value={editExtractSchema}
          onChange={e => setEditExtractSchema(e.target.value)}
          rows={5}
          placeholder={'{\n  "nombre": "nombre completo",\n  "total": "importe total como número"\n}'}
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          Cada valor describe el campo a extraer. Si un dato no aparece, se devuelve null.
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Resultado</span>
          <select value={editExtractMode} onChange={e => setEditExtractMode(e.target.value)} style={{ fontSize: '12px' }}>
            <option value="merge">Combinar con el item</option>
            <option value="replace">Reemplazar el item</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Variable</span>
          <input type="text" value={editExtractOutputVar} onChange={e => setEditExtractOutputVar(e.target.value)} placeholder="extracted" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
        </div>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Instrucciones extra (opcional)</span>
        <textarea
          value={editExtractSystemPrompt}
          onChange={e => setEditExtractSystemPrompt(e.target.value)}
          rows={2}
          placeholder="Los importes van en euros, sin símbolo."
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
      </div>
    </div>
  );
}

interface SentimentAnalysisFormProps extends AiConnectionFieldsProps {
  editSentSystemPrompt: string; setEditSentSystemPrompt: (v: string) => void;
  editSentPrompt: string; setEditSentPrompt: (v: string) => void;
  editSentLabels: string; setEditSentLabels: (v: string) => void;
  editSentLabelField: string; setEditSentLabelField: (v: string) => void;
  editSentScoreField: string; setEditSentScoreField: (v: string) => void;
  editSentOutputVar: string; setEditSentOutputVar: (v: string) => void;
}
/**
 * Scores the tone of a text. The label order defines the numeric score: the
 * first label scores 1, the last -1, so the default set yields 1 / 0 / -1.
 */
export function SentimentAnalysisForm({
  baseUrl, setBaseUrl, apiKey, setApiKey, model, setModel, credentialId, setCredentialId, credentials,
  editSentSystemPrompt, setEditSentSystemPrompt,
  editSentPrompt, setEditSentPrompt,
  editSentLabels, setEditSentLabels,
  editSentLabelField, setEditSentLabelField,
  editSentScoreField, setEditSentScoreField,
  editSentOutputVar, setEditSentOutputVar,
}: SentimentAnalysisFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
      <AiConnectionFields baseUrl={baseUrl} setBaseUrl={setBaseUrl} apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} credentialId={credentialId} setCredentialId={setCredentialId} credentials={credentials} />
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Texto a analizar</span>
        <textarea
          value={editSentPrompt}
          onChange={e => setEditSentPrompt(e.target.value)}
          rows={3}
          placeholder="{{ $json.comentario }}"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Etiquetas, de más positiva a más negativa</span>
        <input
          type="text"
          value={editSentLabels}
          onChange={e => setEditSentLabels(e.target.value)}
          placeholder="positive,neutral,negative"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }}
        />
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--dim)', marginTop: '4px' }}>
          La primera puntúa 1 y la última -1; las intermedias se interpolan. Añade o quita etiquetas libremente.
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campo de etiqueta</span>
          <input type="text" value={editSentLabelField} onChange={e => setEditSentLabelField(e.target.value)} placeholder="sentiment" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Campo de puntuación</span>
          <input type="text" value={editSentScoreField} onChange={e => setEditSentScoreField(e.target.value)} placeholder="sentiment_score" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Variable</span>
          <input type="text" value={editSentOutputVar} onChange={e => setEditSentOutputVar(e.target.value)} placeholder="sentiment" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px' }} />
        </div>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Instrucciones extra (opcional)</span>
        <textarea
          value={editSentSystemPrompt}
          onChange={e => setEditSentSystemPrompt(e.target.value)}
          rows={2}
          placeholder="Ten en cuenta el sarcasmo."
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--dim)' }}>
        Usa la puntuación en un If para reaccionar solo a los casos negativos.
      </span>
    </div>
  );
}

// ─────────────────────────── SQLite: Query ───────────────────────────

interface SqliteQueryFormProps {
  editDbPath: string; setEditDbPath: (s: string) => void;
  editQuery: string; setEditQuery: (s: string) => void;
  editParams: string; setEditParams: (s: string) => void;
}

export function SqliteQueryForm({
  editDbPath, setEditDbPath,
  editQuery, setEditQuery,
  editParams, setEditParams,
}: SqliteQueryFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Fichero de base de datos</span>
        <input type="text" value={editDbPath} onChange={e => setEditDbPath(e.target.value)} placeholder="datos.db" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%' }} />
        <span style={{ fontSize: '10px', color: 'var(--dim)' }}>Ruta relativa a Documentos/automateScreen/databases, o absoluta.</span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Consulta SQL</span>
        <textarea
          value={editQuery}
          onChange={e => setEditQuery(e.target.value)}
          rows={4}
          placeholder="SELECT * FROM clientes WHERE ciudad = ?"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Parámetros (JSON)</span>
        <textarea
          value={editParams}
          onChange={e => setEditParams(e.target.value)}
          rows={2}
          placeholder='[1, "Madrid"]  o  { "id": 7 }'
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
        <span style={{ fontSize: '10px', color: 'var(--dim)' }}>Lista para ?, objeto para :nombre. Deja vacío si no hay parámetros.</span>
      </div>
      <span style={{ fontSize: '10px', color: 'var(--dim)' }}>
        Cada fila del resultado se convierte en un item. Usa expresiones como {"{"}{"{"} $json.nombre {"}"}{"}"} en los parámetros.
      </span>
    </div>
  );
}

// ─────────────────────────── SQLite: Execute ───────────────────────────

interface SqliteExecuteFormProps {
  editDbPath: string; setEditDbPath: (s: string) => void;
  editQuery: string; setEditQuery: (s: string) => void;
  editParams: string; setEditParams: (s: string) => void;
}

export function SqliteExecuteForm({
  editDbPath, setEditDbPath,
  editQuery, setEditQuery,
  editParams, setEditParams,
}: SqliteExecuteFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Fichero de base de datos</span>
        <input type="text" value={editDbPath} onChange={e => setEditDbPath(e.target.value)} placeholder="datos.db" style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%' }} />
        <span style={{ fontSize: '10px', color: 'var(--dim)' }}>Ruta relativa a Documentos/automateScreen/databases, o absoluta. Se crea si no existe.</span>
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Sentencia SQL</span>
        <textarea
          value={editQuery}
          onChange={e => setEditQuery(e.target.value)}
          rows={4}
          placeholder="INSERT INTO clientes (nombre, ciudad) VALUES (?, ?)"
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--dim)', marginBottom: '4px' }}>Parámetros (JSON)</span>
        <textarea
          value={editParams}
          onChange={e => setEditParams(e.target.value)}
          rows={2}
          placeholder='[1, "Madrid"]  o  { "id": 7 }'
          style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', width: '100%', resize: 'vertical' }}
        />
        <span style={{ fontSize: '10px', color: 'var(--dim)' }}>Lista para ?, objeto para :nombre. Deja vacío si no hay parámetros.</span>
      </div>
      <span style={{ fontSize: '10px', color: 'var(--dim)' }}>
        El nodo devuelve {"{"}{"{"} $json.changes {"}"}{"}"} (filas afectadas) y {"{"}{"{"} $json.last_insert_id {"}"}{"}"}.
      </span>
    </div>
  );
}
