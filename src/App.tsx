import React, { useState, useEffect } from "react";
import { Sidebar } from "./features/layout/Sidebar";
import { EmptyStage } from "./features/layout/EmptyStage";
import { LibraryView } from "./features/layout/LibraryView";
import { ExecutionIndicator } from "./features/layout/ExecutionIndicator";
import { AutomationStageView } from "./features/layout/AutomationStageView";
import { ModalRegistry } from "./components/ModalRegistry";
import { LoginPage, UserProfile } from "./features/auth/LoginPage";
import { Toast } from "./components/Toast";
import { FormUiRenderer } from "./components/FormUiRenderer";
import { RecordingOverlay } from "./components/RecordingOverlay";
import Flowchart from "./Flowchart";
import { TemplatesView } from "./features/templates/TemplatesView";
import { DialogProvider } from "./components/DialogProvider";
import { VaultManagerModal } from "./features/credentials/VaultManagerModal";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppController } from "./hooks/useAppController";

function MainAppContent() {
  const [vaultOpen, setVaultOpen] = useState(false);
  const {
    toast,
    busy,
    notify,
    view, setView,
    aiProvider, setAiProvider,
    aiSettingsOpen, setAiSettingsOpen,
    createOpen, setCreateOpen,
    createAutTypeOpen, setCreateAutTypeOpen,
    menu, setMenu,
    botPos, setBotPos,
    creds,
    projs,
    auts,
    rec,
    exec,
    flow,
    ai,
    selectProject,
    createEmptyAut,
    filteredProjects,
    totalPages,
    paginatedProjects,
    getPageNumbers,
    filteredAutomations,
    totalAutPages,
    paginatedAutomations
  } = useAppController();

  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("gs_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleLoginSuccess = (u: UserProfile) => {
    setUser(u);
    localStorage.setItem("gs_user", JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("gs_user");
  };

  const [isRunnerMode, setIsRunnerMode] = useState(false);
  const [runnerFlow, setRunnerFlow] = useState<any>(null);

  useEffect(() => {
    invoke<any>("get_runner_flow").then((flow) => {
      if (flow) {
        setRunnerFlow(flow);
        setIsRunnerMode(true);
      }
    });
  }, []);

  if (isRunnerMode) {
    return (
      <div className="shell" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "var(--bg)", position: "relative" }}>
        <div style={{ textAlign: "center", color: "var(--text)" }}>
          <div className="loader" style={{ border: "4px solid var(--s2)", borderTop: "4px solid var(--mint)", borderRadius: "50%", width: "40px", height: "40px", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <h3 style={{ fontSize: "16px", fontWeight: 600 }}>Ejecutando Automatización</h3>
          <p style={{ color: "var(--muted)", fontSize: "13px", marginTop: "4px" }}>
            {runnerFlow?.name || "Flujo portátil"} se está ejecutando en tu sistema.
          </p>
        </div>
        <Toast message={toast} />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={`shell ${rec.recording ? "recording" : ""}`} onClick={() => menu && setMenu(null)}>
      <Sidebar
        setView={setView}
        projects={projs.projects}
        selectedProject={projs.selectedProject}
        setSelectedProject={projs.setSelectedProject}
        selectedAutomation={auts.selectedAutomation}
        setSelectedAutomation={auts.setSelectedAutomation}
        setSelectedProjectDetail={auts.setSelectedProjectDetail}
        selectProject={selectProject}
        selectAutomation={auts.selectAutomation}
        searchAut={auts.searchAut}
        setSearchAut={auts.setSearchAut}
        paginatedAutomations={paginatedAutomations}
        filteredAutomations={filteredAutomations}
        autPage={auts.autPage}
        setAutPage={auts.setAutPage}
        totalAutPages={totalAutPages}
        loading={projs.loading}
        setCreateOpen={setCreateOpen}
        setCreateAutTypeOpen={setCreateAutTypeOpen}
        setAiSettingsOpen={setAiSettingsOpen}
        setVaultOpen={setVaultOpen}
        view={view}
        user={user}
        onLogout={handleLogout}
        removeAut={auts.removeAut}
        renameAut={auts.renameAut}
        duplicateAut={auts.duplicateAut}
      />

      <main style={projs.selectedProject ? { padding: '16px 20px 16px', overflow: 'hidden', height: '100vh', position: 'relative' } : { position: 'relative' }}>
        {view === "library" ? (
          <LibraryView
            paginatedProjects={paginatedProjects}
            filteredProjects={filteredProjects}
            projects={projs.projects}
            loading={projs.loading}
            search={projs.search}
            setSearch={projs.setSearch}
            sortBy={projs.sortBy}
            setSortBy={projs.setSortBy}
            setCreateOpen={setCreateOpen}
            selectProject={selectProject}
            currentPage={projs.currentPage}
            setCurrentPage={projs.setCurrentPage}
            totalPages={totalPages}
            getPageNumbers={getPageNumbers}
            removeProj={(p) => projs.removeProj(p, () => {})}
            menu={menu}
            setMenu={setMenu}
          />
        ) : view === "templates" ? (
          <TemplatesView
            projs={projs}
            auts={auts}
            flow={flow}
            setView={setView}
            notify={notify}
          />
        ) : projs.selectedProject && (
          <>
            {!auts.selectedAutomation ? (
              <EmptyStage
                selectedProject={projs.selectedProject}
                setSelectedProject={projs.setSelectedProject}
                setView={setView}
                setCreateAutTypeOpen={setCreateAutTypeOpen}
              />
            ) : (
              <AutomationStageView
                projs={projs}
                auts={auts}
                exec={exec}
                rec={rec}
                flow={flow}
                ai={ai}
                menu={menu}
                setMenu={setMenu}
                setView={setView}
                botPos={botPos}
                setBotPos={setBotPos}
                notify={notify}
                creds={creds}
              />
            )}
          </>
        )}
      </main>

      <ExecutionIndicator
        executing={exec.executing}
        bgMode={exec.bgMode}
        selectedAutomation={auts.selectedAutomation}
        progressIndex={exec.progressIndex}
        previewData={exec.previewData}
        stopExecute={exec.stopExecute}
      />

      <ModalRegistry
        busy={busy}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        createAutTypeOpen={createAutTypeOpen}
        setCreateAutTypeOpen={setCreateAutTypeOpen}
        aiSettingsOpen={aiSettingsOpen}
        setAiSettingsOpen={setAiSettingsOpen}
        aiProvider={aiProvider}
        setAiProvider={setAiProvider}
        projs={projs}
        rec={rec}
        creds={creds}
        createEmptyAut={createEmptyAut}
      />

      <VaultManagerModal open={vaultOpen} onClose={() => setVaultOpen(false)} />

      <Toast message={toast} />
    </div>
  );
}

export default function App() {
  const [windowType, setWindowType] = useState<"overlay" | "form" | "main" | null>(() => {
    if (typeof window !== "undefined") {
      if ((window as any).__IS_RECORDING_OVERLAY__ === true) return "overlay";
      if ((window as any).__IS_FORM_WINDOW__ === true) return "form";
    }
    return null;
  });

  useEffect(() => {
    if (windowType !== null) return;
    if (typeof window !== "undefined") {
      try {
        const label = getCurrentWindow().label;
        if (label === "recording-overlay") {
          setWindowType("overlay");
        } else if (label === "form-standalone") {
          setWindowType("form");
        } else {
          setWindowType("main");
        }
      } catch (e) {
        setWindowType("main");
      }
    } else {
      setWindowType("main");
    }
  }, [windowType]);

  if (windowType === null) {
    return <div style={{ background: "transparent", width: "100vw", height: "100vh" }} />;
  }

  if (windowType === "overlay") {
    return <RecordingOverlay />;
  }

  if (windowType === "form") {
    const formData = (window as any).__FORM_DATA__;
    return <FormUiRenderer fields={formData} onClose={() => { getCurrentWindow().close().catch(() => {}); }} />;
  }

  return <DialogProvider><MainAppContent /></DialogProvider>;
}
