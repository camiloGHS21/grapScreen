import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Project, AutomationSummary } from "../types";

export function useExecution(
  selectedProject: Project | null,
  refresh: () => Promise<Project[]>,
  notify: (msg: string) => void,
  setBusy: (busy: boolean) => void
) {
  const [executing, setExecuting] = useState(false);
  const [bgMode, setBgMode] = useState(false);
  const [progressIndex, setProgressIndex] = useState<number | null>(null);
  const [progressNodeId, setProgressNodeId] = useState<string | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, string>>({});
  const [previewData, setPreviewData] = useState<string | null>(null);

  useEffect(() => {
    const unlistenProgress = listen<{ id: string; index: number; nodeId?: string }>("automation-progress", (event) => {
      setProgressIndex(event.payload.index);
      if (event.payload.nodeId) setProgressNodeId(event.payload.nodeId);
    });

    const unlistenNodeStatus = listen<{ id: string; nodeId: string; status: string }>("automation-node-status", (event) => {
      setNodeStatuses(prev => ({ ...prev, [event.payload.nodeId]: event.payload.status }));
    });

    const unlistenPreview = listen<{ id: string; data: string }>("automation-preview", (event) => {
      setPreviewData(event.payload.data);
    });

    const unlistenWarning = listen<{ id: string; warning: string; detail: string }>("automation-warning", (event) => {
      notify("⚠ " + event.payload.detail);
    });

    const unlistenTrigger = listen<{ id: string; kind: string }>("trigger-fired", (event) => {
      const kinds: Record<string, string> = {
        cron: "⏱ Intervalo",
        hotkey: "⌨ Atajo",
        file_change: "📁 Cambio de archivo",
        webhook: "🌐 Webhook",
      };
      notify(`⚡ Trigger disparado: ${kinds[event.payload.kind] || event.payload.kind}`);
    });

    const unlistenExecFinished = listen<{ id: string }>("automation-finished", () => {
      setExecuting(false);
      setProgressIndex(null);
      setProgressNodeId(null);
      setPreviewData(null);
      setBusy(false);
      refresh();
      notify("Automatización finalizada");
    });

    return () => {
      unlistenProgress.then(fn => fn());
      unlistenNodeStatus.then(fn => fn());
      unlistenPreview.then(fn => fn());
      unlistenWarning.then(fn => fn());
      unlistenTrigger.then(fn => fn());
      unlistenExecFinished.then(fn => fn());
    };
  }, [refresh, notify, setBusy]);

  const execute = async (aut: AutomationSummary) => {
    if (!selectedProject || executing) return;
    setExecuting(true);
    setProgressIndex(0);
    setProgressNodeId(null);
    setNodeStatuses({});
    try {
      if (bgMode) {
        await invoke("execute_automation_background", { projectName: selectedProject.name, id: aut.id });
        notify(`Ejecutando ${aut.name} en segundo plano (oculto, sin bloquear el ratón)`);
      } else {
        await invoke("execute_automation", { projectName: selectedProject.name, id: aut.id });
        notify(`Ejecutando ${aut.name}`);
      }
    } catch (e) {
      setExecuting(false);
      setProgressIndex(null);
      notify(String(e));
    }
  };

  const stopExecute = async () => {
    try {
      await invoke("stop_execution");
      notify("Deteniendo automatización…");
    } catch (e) {
      notify(String(e));
    }
  };

  return {
    executing, setExecuting,
    bgMode, setBgMode,
    progressIndex, setProgressIndex,
    progressNodeId, setProgressNodeId,
    nodeStatuses, setNodeStatuses,
    previewData, setPreviewData,
    execute,
    stopExecute
  };
}
