import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project, AutomationSummary } from "../../../types";

interface SubWorkflowFormProps {
  state: any;
}

interface WorkflowOption {
  projectName: string;
  aut: AutomationSummary;
}

export function SubWorkflowForm({ state }: SubWorkflowFormProps) {
  const [options, setOptions] = useState<WorkflowOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadWorkflows() {
      setLoading(true);
      try {
        const projects = await invoke<Project[]>("get_automations");
        if (!active) return;
        const list: WorkflowOption[] = [];
        for (const proj of projects) {
          if (proj.automations && Array.isArray(proj.automations)) {
            for (const aut of proj.automations) {
              list.push({ projectName: proj.name, aut });
            }
          }
        }
        setOptions(list);
      } catch (e) {
        console.error("Error al cargar automatizaciones para el sub-flujo:", e);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadWorkflows();
    return () => {
      active = false;
    };
  }, []);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    const found = options.find(o => `${o.projectName}:${o.aut.id}` === val);
    if (found) {
      state.setEditSubWorkflowId?.(found.aut.id);
      state.setEditSubWorkflowName?.(found.aut.name);
      state.setEditSubWorkflowProject?.(found.projectName);
    }
  };

  const selectedKey = options.find(
    o => o.aut.id === state.editSubWorkflowId && o.projectName === (state.editSubWorkflowProject || "Default")
  )
    ? `${state.editSubWorkflowProject || "Default"}:${state.editSubWorkflowId}`
    : "";

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ marginBottom: "14px" }}>
        <span style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
          Seleccionar Automatización Existente
        </span>
        <select
          value={selectedKey}
          onChange={handleSelectChange}
          disabled={loading}
          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">{loading ? "Cargando flujos..." : "-- Selecciona una automatización guardada --"}</option>
          {options.map(opt => (
            <option key={`${opt.projectName}:${opt.aut.id}`} value={`${opt.projectName}:${opt.aut.id}`}>
              [{opt.projectName}] {opt.aut.name} ({opt.aut.id})
            </option>
          ))}
        </select>
        <span style={{ display: "block", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
          Al seleccionar un flujo de la lista, se completarán automáticamente el ID y Nombre del Sub-Flujo.
        </span>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>
          Nombre / Título del Sub-Flujo
        </span>
        <input
          type="text"
          value={state.editSubWorkflowName || ""}
          onChange={e => state.setEditSubWorkflowName?.(e.target.value)}
          placeholder="Ej. Procesar Factura"
        />
      </div>

      <div style={{ marginBottom: "12px" }}>
        <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>
          ID de Automatización (.json)
        </span>
        <input
          type="text"
          value={state.editSubWorkflowId || ""}
          onChange={e => state.setEditSubWorkflowId?.(e.target.value)}
          placeholder="ID de la automatización o {{ variable_id }}"
        />
      </div>

      <div>
        <span style={{ display: "block", fontSize: "11px", color: "var(--dim)", marginBottom: "4px" }}>
          Proyecto
        </span>
        <input
          type="text"
          value={state.editSubWorkflowProject || "Default"}
          onChange={e => state.setEditSubWorkflowProject?.(e.target.value)}
          placeholder="Default"
        />
      </div>
    </div>
  );
}
