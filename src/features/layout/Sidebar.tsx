import React from "react";
import { Library, Plus, Folder, Settings, LayoutTemplate, ShieldCheck } from "lucide-react";
import { Project, AutomationSummary } from "../../types";
import { BrandLogo } from "../../components/BrandLogo";
import { SidebarAutomationList } from "./SidebarAutomationList";
import { SidebarUserProfile } from "./SidebarUserProfile";
import type { UserProfile } from "../auth/LoginPage";

interface SidebarProps {
  view?: string;
  setView: (v: "library" | "project-details" | "templates") => void;
  projects: Project[];
  selectedProject: Project | null;
  setSelectedProject: (p: Project | null) => void;
  selectedAutomation: AutomationSummary | null;
  setSelectedAutomation: (a: AutomationSummary | null) => void;
  setSelectedProjectDetail: (d: any) => void;
  selectProject: (p: Project) => void;
  selectAutomation: (a: AutomationSummary | null) => void;
  searchAut: string;
  setSearchAut: (s: string) => void;
  paginatedAutomations: AutomationSummary[];
  filteredAutomations: AutomationSummary[];
  autPage: number;
  setAutPage: React.Dispatch<React.SetStateAction<number>>;
  totalAutPages: number;
  loading: boolean;
  setCreateOpen?: (open: boolean) => void;
  setCreateAutTypeOpen?: (open: boolean) => void;
  setAiSettingsOpen?: (open: boolean) => void;
  setVaultOpen?: (open: boolean) => void;
  setSettingsTab?: (tab: "general" | "api") => void;
  user?: UserProfile | null;
  onLogout?: () => void;
  removeAut?: (aut: AutomationSummary) => void;
  renameAut?: (aut: AutomationSummary) => void;
  duplicateAut?: (aut: AutomationSummary) => void;
}

export function Sidebar({
  view,
  setView,
  projects,
  selectedProject,
  setSelectedProject,
  selectedAutomation,
  setSelectedAutomation,
  setSelectedProjectDetail,
  selectProject,
  selectAutomation,
  searchAut,
  setSearchAut,
  paginatedAutomations,
  filteredAutomations,
  autPage,
  setAutPage,
  totalAutPages,
  loading,
  setCreateOpen,
  setCreateAutTypeOpen,
  setAiSettingsOpen,
  setVaultOpen,
  setSettingsTab,
  user,
  onLogout,
  removeAut,
  renameAut,
  duplicateAut,
}: SidebarProps) {
  return (
    <aside>
      <div
        className="brand"
        onClick={() => {
          setSelectedProject(null);
          setSelectedAutomation(null);
          setView("library");
        }}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <BrandLogo />
        <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>grapScreen</span>
      </div>
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <button
          className={view === "templates" ? "active" : ""}
          onClick={() => setView("templates")}
          title="Plantillas de flujo listas para usar"
          style={view === "templates" ? {} : { opacity: 0.85 }}
        >
          <LayoutTemplate size={18} /> Plantillas
        </button>
        <div style={{ height: '6px' }} />

        {!selectedProject ? (
          <>
            <button
              className="active"
              onClick={() => {
                setSelectedProject(null);
                setSelectedAutomation(null);
                setView("library");
              }}
            >
              <Library size={18} /> Biblioteca
            </button>

            <div className="sidebar-section-title">
              <span>Proyectos</span>
            </div>

            <div className="sidebar-project-list">
              {setCreateOpen && (
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
                    minHeight: '34px',
                    marginBottom: '6px'
                  }}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} style={{ color: 'var(--red)' }} />
                  <span>Crear proyecto</span>
                </button>
              )}
              {loading && projects.length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--dim)' }}>Cargando...</div>
              ) : projects.length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--dim)' }}>Sin proyectos</div>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.name}
                    className="sidebar-project-item"
                    onClick={() => selectProject(project)}
                    title={project.name}
                  >
                    <Folder size={15} style={{ flexShrink: 0, color: 'var(--dim)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <SidebarAutomationList
            selectedProject={selectedProject}
            selectedAutomation={selectedAutomation}
            setSelectedAutomation={setSelectedAutomation}
            setSelectedProjectDetail={setSelectedProjectDetail}
            selectAutomation={selectAutomation}
            searchAut={searchAut}
            setSearchAut={setSearchAut}
            paginatedAutomations={paginatedAutomations}
            filteredAutomations={filteredAutomations}
            autPage={autPage}
            setAutPage={setAutPage}
            totalAutPages={totalAutPages}
            setCreateAutTypeOpen={setCreateAutTypeOpen}
            removeAut={removeAut}
            renameAut={renameAut}
            duplicateAut={duplicateAut}
          />
        )}
      </nav>

      {user && <SidebarUserProfile user={user} onLogout={onLogout} />}

      <button
        className="sidebar-settings-btn"
        onClick={() => setVaultOpen?.(true)}
        style={{
          marginTop: user ? '6px' : 'auto',
          padding: '10px 10px',
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12.5px',
          fontWeight: 600,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={15} style={{ color: '#10b981' }} />
          <span>Vault Credenciales</span>
        </div>
        <span style={{ fontSize: '10px', color: '#10b981', padding: '2px 6px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px' }}>
          DPAPI
        </span>
      </button>

      <button
        className="sidebar-settings-btn"
        onClick={() => {
          if (setSettingsTab) setSettingsTab(!selectedProject ? "general" : "api");
          if (setAiSettingsOpen) setAiSettingsOpen(true);
        }}
        style={{
          marginTop: '2px',
          padding: '12px 10px',
          borderTop: user ? 'none' : '1px solid var(--line)',
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12.5px',
          fontWeight: 600,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={15} style={{ color: 'var(--mint)' }} />
          <span>Configuración</span>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--dim)', padding: '2px 6px', background: 'var(--s2)', borderRadius: '4px' }}>
          {!selectedProject ? "Inicio" : "IA & APIs"}
        </span>
      </button>
    </aside>
  );
}
