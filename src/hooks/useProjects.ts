import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "../types";
import { useDialog } from "../components/DialogProvider";
import { safeName } from "../utils/text";

export function useProjects(notify: (msg: string) => void, setBusy: (busy: boolean) => void) {
  const { confirm } = useDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "az" | "za" | "most">("recent");
  const [currentPage, setCurrentPage] = useState(1);

  const refresh = useCallback(async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      const list = await invoke<Project[]>("get_automations");
      setProjects(list);
      setSelectedProject(prev => {
        if (!prev) return null;
        return list.find(p => p.name === prev.name) || null;
      });
      return list;
    } catch (e) {
      notify(String(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const createProject = async (name: string, onSuccess: (folderName: string) => void) => {
    const clean = safeName(name);
    if (!clean) return;
    setBusy(true);
    try {
      const folderName = await invoke<string>("create_project", { name: clean });
      const updated = await refresh();
      onSuccess(folderName);
      notify("Proyecto creado");
      return updated;
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeProj = async (project: Project, onSuccess: () => void) => {
    const ok = await confirm({
      title: "Eliminar proyecto",
      message: `¿Eliminar el proyecto "${project.name}" y todas sus grabaciones permanentemente?`,
      variant: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await invoke("delete_project", { name: project.name });
      notify("Proyecto eliminado");
      onSuccess();
      await refresh();
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    projects, setProjects,
    selectedProject, setSelectedProject,
    loading, setLoading,
    search, setSearch,
    sortBy, setSortBy,
    currentPage, setCurrentPage,
    refresh,
    createProject,
    removeProj
  };
}
