import React from "react";
import { SubWorkflowForm } from "./SubWorkflowForm";

interface N8nFlowFormsProps {
  type: string;
  state: any;
}

export function N8nFlowForms({ type, state }: N8nFlowFormsProps) {
  const {
    editSwitchField, setEditSwitchField,
    editSwitchCases, setEditSwitchCases,
    editMergeMode, setEditMergeMode,
    editWaitSeconds, setEditWaitSeconds,
    editWaitResumeOn, setEditWaitResumeOn,
  } = state;

  return (
    <>
      {type === "switch" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Campo o Variable a Evaluar</span>
            <input type="text" value={editSwitchField} onChange={e => setEditSwitchField?.(e.target.value)} placeholder="Ej. status o {{ $json.tipo }}" />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Casos de Ruta (JSON Array)</span>
            <textarea style={{ fontFamily: "monospace", fontSize: "11px" }} value={editSwitchCases} onChange={e => setEditSwitchCases?.(e.target.value)} placeholder='[{"value": "ok", "output": 0}, {"value": "error", "output": 1}]' rows={6} />
            <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
              Define el valor a comparar para cada puerto de salida. Los casos no coincidentes van a la salida por defecto.
            </span>
          </div>
        </div>
      )}

      {type === "merge" && (
        <div style={{ marginBottom: "16px" }}>
          <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Modo de Combinación</span>
          <select value={editMergeMode} onChange={e => setEditMergeMode?.(e.target.value)}>
            <option value="append">Append (Unir listas de items secuencialmente)</option>
            <option value="combine">Combine (Fusionar campos de items coincidentes)</option>
            <option value="choose">Choose (Elegir un ramal prioritario)</option>
          </select>
          <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "6px" }}>
            Une los flujos provenientes de dos o más ramas previas en un único conjunto de items.
          </span>
        </div>
      )}

      {type === "wait" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Segundos de Espera</span>
            <input type="number" min={0} value={editWaitSeconds} onChange={e => setEditWaitSeconds?.(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>Reanudar Por</span>
            <select value={editWaitResumeOn} onChange={e => setEditWaitResumeOn?.(e.target.value)}>
              <option value="timeout">Tiempo transcurrido</option>
              <option value="event">Evento recibido</option>
            </select>
          </div>
        </div>
      )}

      {type === "sub_workflow" && <SubWorkflowForm state={state} />}
    </>
  );
}
