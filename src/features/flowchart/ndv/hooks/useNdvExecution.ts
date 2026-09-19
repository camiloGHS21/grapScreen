import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NodeRunResult } from "../types";

interface UseNdvExecutionProps {
  automationId?: string;
  projectName?: string;
  nodeId?: string;
  onSavedBeforeRun?: () => void;
  onRefreshProject?: () => Promise<void>;
}

export function useNdvExecution({
  automationId,
  projectName = "Personal",
  nodeId,
  onSavedBeforeRun,
  onRefreshProject,
}: UseNdvExecutionProps) {
  const [stepRunning, setStepRunning] = useState(false);
  const [upstreamRunning, setUpstreamRunning] = useState(false);
  const [stepResult, setStepResult] = useState<
    | { ok: true; input: unknown; output: unknown; durationMs: number | null }
    | { ok: false; error: string }
    | null
  >(null);

  const runStep = async () => {
    if (!automationId || !nodeId) {
      setStepResult({ ok: false, error: "No hay una automatización o nodo activo para probar." });
      return;
    }

    setStepRunning(true);
    setStepResult(null);

    try {
      if (onSavedBeforeRun) {
        onSavedBeforeRun();
      }

      const statuses = await invoke<NodeRunResult[]>("run_single_node", {
        projectName,
        automationId,
        nodeId,
      });

      const mine = statuses.find((s) => s.node_id === nodeId) || statuses[statuses.length - 1];

      if (!mine) {
        setStepResult({ ok: false, error: "El motor en Rust no informó de ningún resultado para este paso." });
      } else if (mine.status === "error") {
        setStepResult({ ok: false, error: mine.detail || "El nodo terminó con error durante la ejecución." });
      } else {
        setStepResult({
          ok: true,
          input: mine.input_data ?? null,
          output: mine.output_data ?? null,
          durationMs: mine.duration_ms ?? null,
        });
      }
    } catch (err) {
      setStepResult({ ok: false, error: String(err) });
    } finally {
      setStepRunning(false);
    }
  };

  const executePreviousNodes = async (targetUpstreamNodeId: string) => {
    if (!automationId || !targetUpstreamNodeId) return;

    setUpstreamRunning(true);
    try {
      if (onSavedBeforeRun) {
        onSavedBeforeRun();
      }

      await invoke("execute_automation_until", {
        projectName,
        id: automationId,
        nodeId: targetUpstreamNodeId,
      });

      if (onRefreshProject) {
        await onRefreshProject();
      }
    } catch (err) {
      setStepResult({ ok: false, error: `Error al ejecutar nodos anteriores: ${String(err)}` });
    } finally {
      setUpstreamRunning(false);
    }
  };

  return {
    stepRunning,
    upstreamRunning,
    stepResult,
    setStepResult,
    runStep,
    executePreviousNodes,
  };
}
