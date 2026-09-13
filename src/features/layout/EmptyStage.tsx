import React from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { Project } from "../../types";

interface EmptyStageProps {
  selectedProject: Project;
  setSelectedProject: (p: Project | null) => void;
  setView: (v: "library" | "project-details") => void;
  setCreateAutTypeOpen: (open: boolean) => void;
}

export function EmptyStage({
  selectedProject,
  setSelectedProject,
  setView,
  setCreateAutTypeOpen
}: EmptyStageProps) {
  const hasAutomations = (selectedProject.automations || []).length > 0;

  return (
    <section className="stage" style={{ gridTemplateRows: '1fr' }}>
      <div className="record-center">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
          <h3>{hasAutomations ? `Proyecto: ${selectedProject.name}` : "Este proyecto está vacío"}</h3>
          {!hasAutomations && (
            <p>Graba una tarea repetitiva en tu pantalla para empezar a automatizarla.</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            className="quiet"
            style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0 24px', height: '44px', fontSize: '14px', gap: '8px', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={() => { setSelectedProject(null); setView("library"); }}
          >
            <ChevronLeft size={18} /> Volver al Inicio
          </button>
          <button
            className="primary"
            style={{ borderRadius: '12px', padding: '0 24px', height: '44px', minHeight: '44px', fontSize: '14px', gap: '8px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={() => setCreateAutTypeOpen(true)}
          >
            <Plus size={18} /> Crear nueva automatización
          </button>
        </div>
      </div>
    </section>
  );
}
