import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Project } from "../types";

// Import other hooks
import { useCredentials } from "./useCredentials";
import { useProjects } from "./useProjects";
import { useAutomations } from "./useAutomations";
import { useRecording } from "./useRecording";
import { useExecution } from "./useExecution";
import { useAiAssistant } from "./useAiAssistant";
import { useFlowchartEdit } from "./useFlowchartEdit";

export function useAppController() {
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"library" | "project-details" | "templates">("library");
  const [aiProvider, setAiProvider] = useState("gemini-3.6-flash");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createAutTypeOpen, setCreateAutTypeOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [botPos, setBotPos] = useState({ right: 24, bottom: 80 });

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const creds = useCredentials(notify, setBusy);
  const projs = useProjects(notify, setBusy);
  const auts = useAutomations(projs.selectedProject, projs.refresh, notify, setBusy);
  const rec = useRecording(projs.selectedProject, notify, setBusy);
  const exec = useExecution(projs.selectedProject, projs.refresh, notify, setBusy);
  
  const flow = useFlowchartEdit(
    projs.selectedProject,
    auts.selectedAutomation,
    auts.selectedProjectDetail,
    auts.saveEvents,
    auts.loadProjectDetail,
    projs.refresh,
    notify,
    setBusy
  );

  const getAiApiKey = (providerOrModel: string) => {
    if (providerOrModel.includes("gemini")) return creds.geminiKey;
    if (providerOrModel.includes("openai") || providerOrModel.includes("gpt")) return creds.openaiKey;
    if (providerOrModel.includes("deepseek")) return creds.deepseekKey;
    if (providerOrModel.includes("openrouter") || providerOrModel.includes("claude") || providerOrModel.includes("llama")) return creds.openrouterKey;
    if (providerOrModel.includes("ollama")) return creds.customAiUrl;
    return creds.customAiKey || creds.openaiKey;
  };

  const ai = useAiAssistant(
    projs.selectedProject,
    auts.selectedAutomation,
    auts.loadProjectDetail,
    projs.refresh,
    notify,
    aiProvider,
    getAiApiKey(aiProvider)
  );

  useEffect(() => {
    const savedTheme = localStorage.getItem("grap_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    projs.refresh();
    const unFinished = listen<{ id: string; project_name: string; video_error: string | null }>("recording-finished", (event) => {
      rec.setRecording(false);
      auts.setCompilingIds(prev => prev.filter(x => x !== event.payload.id));
      projs.refresh().then((latestProjects) => {
        const pObj = latestProjects.find(x => x.name === event.payload.project_name);
        if (pObj) {
          projs.setSelectedProject(pObj);
          const aObj = (pObj.automations || []).find(x => x.id === event.payload.id);
          if (aObj) {
            auts.setSelectedAutomation(aObj);
            auts.loadProjectDetail(pObj.name, aObj.id);
          }
        }
      });
      notify(event.payload.video_error ? `Error al compilar video: ${event.payload.video_error}` : "Grabación guardada correctamente");
    });

    const unCancelled = listen("recording-cancelled", () => {
      rec.setRecording(false);
      notify("Grabación cancelada");
    });

    const unToggled = listen<{ active: boolean }>("recording-toggled", (event) => {
      rec.setRecording(event.payload.active);
      if (event.payload.active) {
        auts.setSelectedProjectDetail(null);
        notify("Grabando (Win+Alt+K)");
      } else {
        projs.refresh();
      }
    });

    return () => {
      unFinished.then(fn => fn());
      unCancelled.then(fn => fn());
      unToggled.then(fn => fn());
    };
  }, [projs.refresh, auts.loadProjectDetail, rec.setRecording, notify]);

  const selectProject = (project: Project) => {
    projs.setSelectedProject(project);
    setView("project-details");
    const autsList = project.automations || [];
    if (autsList.length > 0) {
      const first = autsList[0];
      auts.setSelectedAutomation(first);
      auts.loadProjectDetail(project.name, first.id);
    } else {
      auts.setSelectedAutomation(null);
      auts.setSelectedProjectDetail(null);
    }
  };

  const createEmptyAut = async (name: string, onSuccess: () => void) => {
    if (!projs.selectedProject) return;
    setBusy(true);
    try {
      const newAut = await invoke<{ id: string }>("create_empty_automation", {
        projectName: projs.selectedProject.name,
        name: name.trim()
      });
      const latest = await projs.refresh();
      onSuccess();
      notify("Automatización vacía creada");
      const currentProj = latest.find(x => x.name === projs.selectedProject?.name);
      if (currentProj) {
        projs.setSelectedProject(currentProj);
        const found = (currentProj.automations || []).find(a => a.id === newAut.id);
        if (found) auts.selectAutomation(found);
      }
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  const filteredProjects = useMemo(() => {
    return (projs.projects || [])
      .filter(p => p && p.name && typeof p.name === "string" && p.name.toLowerCase().includes((projs.search || "").toLowerCase()))
      .sort((a, b) => {
        if (projs.sortBy === "az") return (a.name || "").localeCompare(b.name || "");
        if (projs.sortBy === "za") return (b.name || "").localeCompare(a.name || "");
        if (projs.sortBy === "most") return ((b.automations || []).length) - ((a.automations || []).length);
        return 0;
      });
  }, [projs.projects, projs.search, projs.sortBy]);

  const totalPages = Math.ceil(filteredProjects.length / 6);
  const paginatedProjects = useMemo(() => {
    const start = (projs.currentPage - 1) * 6;
    return filteredProjects.slice(start, start + 6);
  }, [filteredProjects, projs.currentPage]);

  const getPageNumbers = () => {
    const list: (number | string)[] = [];
    for (let i = 1; i <= totalPages; i++) list.push(i);
    return list;
  };

  const filteredAutomations = useMemo(() => {
    if (!projs.selectedProject || !projs.selectedProject.automations) return [];
    return projs.selectedProject.automations.filter(a => a && a.name && typeof a.name === "string" && a.name.toLowerCase().includes((auts.searchAut || "").toLowerCase()));
  }, [projs.selectedProject, auts.searchAut]);

  const totalAutPages = Math.ceil(filteredAutomations.length / 5);
  const paginatedAutomations = useMemo(() => {
    const start = (auts.autPage - 1) * 5;
    return filteredAutomations.slice(start, start + 5);
  }, [filteredAutomations, auts.autPage]);

  return {
    toast, setToast,
    busy, setBusy,
    view, setView,
    aiProvider, setAiProvider,
    aiSettingsOpen, setAiSettingsOpen,
    createOpen, setCreateOpen,
    createAutTypeOpen, setCreateAutTypeOpen,
    menu, setMenu,
    botPos, setBotPos,
    notify,
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
  };
}
