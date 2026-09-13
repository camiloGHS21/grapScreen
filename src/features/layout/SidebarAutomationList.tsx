import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { ChevronLeft, ChevronRight, Plus, MoreVertical, Pencil, Trash2, Copy } from "lucide-react";
import { Project, AutomationSummary } from "../../types";

interface SidebarAutomationListProps {
  selectedProject: Project;
  selectedAutomation: AutomationSummary | null;
  setSelectedAutomation: (a: AutomationSummary | null) => void;
  setSelectedProjectDetail: (d: any) => void;
  selectAutomation: (a: AutomationSummary | null) => void;
  searchAut: string;
  setSearchAut: (s: string) => void;
  paginatedAutomations: AutomationSummary[];
  filteredAutomations: AutomationSummary[];
  autPage: number;
  setAutPage: React.Dispatch<React.SetStateAction<number>>;
  totalAutPages: number;
  setCreateAutTypeOpen?: (open: boolean) => void;
  removeAut?: (aut: AutomationSummary) => void;
  renameAut?: (aut: AutomationSummary) => void;
  duplicateAut?: (aut: AutomationSummary) => void;
}

export function SidebarAutomationList({
  selectedProject,
  selectedAutomation,
  setSelectedAutomation,
  setSelectedProjectDetail,
  selectAutomation,
  searchAut,
  setSearchAut,
  paginatedAutomations,
  filteredAutomations,
  autPage,
  setAutPage,
  totalAutPages,
  setCreateAutTypeOpen,
  removeAut,
  renameAut,
  duplicateAut,
}: SidebarAutomationListProps) {
  const [ctxMenu, setCtxMenu] = useState<{ aut: AutomationSummary; x: number; y: number } | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => setCtxMenu(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  return (
    <>
      <div className="sidebar-section-title" style={{ marginTop: 0 }}>
        <span>Automatizaciones — {selectedProject.name}</span>
      </div>

      {setCreateAutTypeOpen && (
        <button
          className="sidebar-project-item"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '1px dashed var(--line)',
            background: 'var(--s1)',
            color: 'var(--muted)',
            fontSize: '12px',
            fontWeight: 600,
            height: '32px',
            minHeight: '32px',
            padding: '0 10px',
            borderRadius: '6px',
            marginBottom: '6px'
          }}
          onClick={() => setCreateAutTypeOpen(true)}
        >
          <Plus size={14} style={{ color: 'var(--red)' }} />
          <span>Nueva Automatización</span>
        </button>
      )}

      <div style={{ padding: '0 2px', marginBottom: '6px' }}>
        <input
          type="text"
          placeholder="Buscar en este proyecto..."
          value={searchAut}
          onChange={(e) => {
            setSearchAut(e.target.value);
            setAutPage(1);
          }}
          style={{
            width: '100%',
            height: '30px',
            padding: '0 10px',
            fontSize: '12px',
            borderRadius: '6px',
            border: '1px solid var(--line)',
            background: 'var(--s1)',
            color: 'var(--text)'
          }}
        />
      </div>

      <div className="sidebar-aut-list" style={{ flex: 1, overflowY: 'auto' }}>
        {paginatedAutomations.map((aut) => {
          const isSelected = selectedAutomation?.id === aut.id;
          return (
            <div
              key={aut.id}
              className={`sidebar-aut-item ${isSelected ? 'active' : ''}`}
              onClick={() => {
                setSelectedAutomation(aut);
                setSelectedProjectDetail(null);
                selectAutomation(aut);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCtxMenu({ aut, x: e.clientX, y: e.clientY });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 10px',
                height: '32px',
                minHeight: '32px',
                borderRadius: '6px',
                marginBottom: '2px',
                background: isSelected ? 'var(--red-subtle)' : 'transparent',
                color: isSelected ? 'var(--red)' : 'var(--text)',
                cursor: 'pointer',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                position: 'relative'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {aut.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedAutomation(aut);
                  setSelectedProjectDetail(null);
                  selectAutomation(aut);
                  const rect = e.currentTarget.getBoundingClientRect();
                  setCtxMenu({ aut, x: rect.left, y: rect.bottom + 4 });
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--dim)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px'
                }}
                title="Opciones de Automatización"
              >
                <MoreVertical size={14} />
              </button>
            </div>
          );
        })}
        {filteredAutomations.length === 0 && (
          <div style={{ padding: '12px', fontSize: '12px', color: 'var(--dim)', textAlign: 'center' }}>
            No hay automatizaciones
          </div>
        )}
      </div>

      {ctxMenu && ReactDOM.createPortal(
        <div
          className="n8n-ctx"
          style={{
            position: 'fixed',
            left: Math.max(10, Math.min(ctxMenu.x, window.innerWidth - 210)),
            top: Math.max(10, Math.min(ctxMenu.y, window.innerHeight - 140)),
            zIndex: 9999999
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {renameAut && (
            <button onClick={() => { renameAut(ctxMenu.aut); setCtxMenu(null); }}>
              <Pencil size={13} /> Renombrar
            </button>
          )}
          {duplicateAut && (
            <button onClick={() => { duplicateAut(ctxMenu.aut); setCtxMenu(null); }}>
              <Copy size={13} /> Duplicar con otro nombre
            </button>
          )}
          {removeAut && (
            <button className="danger" onClick={() => { removeAut(ctxMenu.aut); setCtxMenu(null); }}>
              <Trash2 size={13} /> Eliminar
            </button>
          )}
        </div>,
        document.body
      )}

      {totalAutPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderTop: '1px solid var(--line)', fontSize: '11px', color: 'var(--muted)' }}>
          <button
            disabled={autPage <= 1}
            onClick={() => setAutPage((p) => Math.max(1, p - 1))}
            style={{ background: 'none', border: 'none', color: autPage <= 1 ? 'var(--line)' : 'var(--text)', cursor: autPage <= 1 ? 'default' : 'pointer' }}
          >
            <ChevronLeft size={14} />
          </button>
          <span>{autPage} / {totalAutPages}</span>
          <button
            disabled={autPage >= totalAutPages}
            onClick={() => setAutPage((p) => Math.min(totalAutPages, p + 1))}
            style={{ background: 'none', border: 'none', color: autPage >= totalAutPages ? 'var(--line)' : 'var(--text)', cursor: autPage >= totalAutPages ? 'default' : 'pointer' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
