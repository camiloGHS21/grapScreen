import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project, AutomationSummary, AutomationDetail, RecordedEvent } from "../types";
import { withGraphMetadata } from "../features/flowchart/utils/layoutMetadata";
import { useDialog } from "../components/DialogProvider";

export function useAutomations(
  selectedProject: Project | null,
  refresh: () => Promise<Project[]>,
  notify: (msg: string) => void,
  setBusy: (busy: boolean) => void
) {
  const { confirm, prompt } = useDialog();

  const [selectedAutomation, setSelectedAutomation] = useState<AutomationSummary | null>(null);
  const [selectedProjectDetail, setSelectedProjectDetail] = useState<AutomationDetail | null>(null);
  const [searchAut, setSearchAut] = useState("");
  const [autPage, setAutPage] = useState(1);
  const [compilingIds, setCompilingIds] = useState<string[]>([]);

  const loadProjectDetail = useCallback(async (projectName: string, automationId: string) => {
    try {
      const detail = await invoke<AutomationDetail>("get_automation", { projectName, id: automationId });
      setSelectedProjectDetail(detail);
      return detail;
    } catch (e) {
      notify("Error cargando detalle: " + String(e));
      return null;
    }
  }, [notify]);

  const selectAutomation = useCallback(async (aut: AutomationSummary | null) => {
    setSelectedAutomation(aut);
    if (!aut || !selectedProject) {
      setSelectedProjectDetail(null);
      return;
    }
    await loadProjectDetail(selectedProject.name, aut.id);
  }, [selectedProject, loadProjectDetail]);

  const removeAut = async (aut: AutomationSummary) => {
    if (!selectedProject) return;
    const ok = await confirm({
      title: "Eliminar automatización",
      message: `¿Eliminar la automatización "${aut.name}" permanentemente?`,
      variant: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await invoke("delete_automation", { projectName: selectedProject.name, id: aut.id });
      notify("Automatización eliminada");
      const latestProjects = await refresh();
      const updatedProj = latestProjects.find(p => p.name === selectedProject.name);
      const remainingAuts = updatedProj?.automations || [];
      if (selectedAutomation?.id === aut.id) {
        if (remainingAuts.length > 0) {
          await selectAutomation(remainingAuts[0]);
        } else {
          setSelectedAutomation(null);
          setSelectedProjectDetail(null);
        }
      }
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  const renameAut = async (aut: AutomationSummary) => {
    if (!selectedProject) return;
    const newName = await prompt({
      title: "Renombrar automatización",
      message: "Nuevo nombre para la automatización:",
      defaultValue: aut.name,
      confirmLabel: "Guardar",
    });
    if (!newName || !newName.trim()) return;
    setBusy(true);
    try {
      await invoke("rename_automation", { projectName: selectedProject.name, id: aut.id, newName: newName.trim() });
      notify("Nombre actualizado");
      await refresh();
      if (selectedAutomation?.id === aut.id) {
        setSelectedAutomation(prev => prev ? { ...prev, name: newName.trim() } : null);
      }
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  const duplicateAut = async (aut: AutomationSummary) => {
    if (!selectedProject) return;
    const newName = await prompt({
      title: "Duplicar automatización",
      message: "Nombre para la copia de la automatización:",
      defaultValue: `${aut.name} (Copia)`,
      confirmLabel: "Duplicar",
    });
    if (!newName || !newName.trim()) return;
    setBusy(true);
    try {
      const dupFile = await invoke<any>("duplicate_automation", { projectName: selectedProject.name, id: aut.id, newName: newName.trim() });
      notify("Automatización duplicada con éxito");
      const latestProjects = await refresh();
      const updatedProj = latestProjects.find(p => p.name === selectedProject.name);
      const found = (updatedProj?.automations || []).find(a => a.id === dupFile.id);
      if (found) {
        await selectAutomation(found);
      }
    } catch (e) {
      notify("Error al duplicar: " + String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportAut = async (aut: AutomationSummary, targetOs: "windows" | "linux" | "macos" | "json" = "windows") => {
    if (!selectedProject) return;
    try {
      const extMap = { windows: ".exe", linux: ".AppImage", macos: ".app", json: ".json" };
      const ext = extMap[targetOs] || ".exe";
      const defaultName = `${aut.name}${ext}`;
      const destPath = await invoke<string | null>("select_save_file", { defaultName });
      if (!destPath) return;
      setBusy(true);
      await invoke("export_automation_exe", {
        projectName: selectedProject.name,
        id: aut.id,
        destPath,
        targetOs
      });
      notify(`¡Automatización exportada con éxito (${targetOs.toUpperCase()})!`);
    } catch (e) {
      notify(`Error al exportar: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const saveEvents = async (updatedEvents: RecordedEvent[]) => {
    if (!selectedProject || !selectedAutomation) return;
    setBusy(true);
    try {
      // Single choke point: always persist an up-to-date executable graph so
      // the Rust engine walks node ranges consistent with the saved events.
      const withGraph = withGraphMetadata(updatedEvents, selectedProjectDetail?.target_app ?? null);
      console.log("[saveEvents] persisting", withGraph.length, "events, kinds:", withGraph.map(e => e.kind));
      await invoke("save_automation", { projectName: selectedProject.name, id: selectedAutomation.id, events: withGraph });
      await loadProjectDetail(selectedProject.name, selectedAutomation.id);
      await refresh();
    } catch (e) {
      notify(String(e));
      console.error("[saveEvents] failed:", e);
    } finally {
      setBusy(false);
    }
  };

  return {
    selectedAutomation, setSelectedAutomation,
    selectedProjectDetail, setSelectedProjectDetail,
    searchAut, setSearchAut,
    autPage, setAutPage,
    compilingIds, setCompilingIds,
    loadProjectDetail,
    selectAutomation,
    removeAut,
    renameAut,
    duplicateAut,
    exportAut,
    saveEvents
  };
}
