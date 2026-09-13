import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LogEntry } from "../features/flowchart/components/FlowLogsPanel";

interface NodeProgressPayload {
  id: string;
  index: number;
  nodeId?: string;
}
interface NodeStatusPayload {
  id: string;
  nodeId: string;
  status: string;
}
interface NodeDetailPayload {
  id: string;
  nodeId: string;
  status: string;
  duration_ms?: number;
  output_data?: any;
  input_data?: any;
}
interface FinishedPayload {
  id: string;
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let seq = 0;
function makeEntry(level: LogEntry["level"], message: string): LogEntry {
  seq += 1;
  return { id: `log-${Date.now()}-${seq}`, time: stamp(), level, message };
}

/**
 * Turns the engine's low-level events (progress / node status / finished) into
 * a readable log stream for the bottom console, mirroring n8n's Logs panel.
 */
export function useFlowLogs(nodeLabels: Record<string, string>) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const labelsRef = useRef(nodeLabels);
  labelsRef.current = nodeLabels;

  const append = useCallback((level: LogEntry["level"], message: string) => {
    setEntries((prev) => {
      const next = [...prev, makeEntry(level, message)];
      // Keep the console bounded.
      return next.length > 300 ? next.slice(next.length - 300) : next;
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  useEffect(() => {
    const unProgress = listen<NodeProgressPayload>("automation-progress", (ev) => {
      const { nodeId } = ev.payload;
      if (!nodeId) return;
      const label = labelsRef.current[nodeId] || nodeId;
      append("info", `Ejecutando “${label}”…`);
    });

    const unStatus = listen<NodeStatusPayload>("automation-node-status", (ev) => {
      const { nodeId, status } = ev.payload;
      const label = labelsRef.current[nodeId] || nodeId;
      if (status === "running") return; // progress already logged it
      append("info", `Nodo “${label}”: ${status}`);
    });

    const unDetail = listen<NodeDetailPayload>("automation-node-detail", (ev) => {
      const { nodeId, status, duration_ms } = ev.payload;
      const label = labelsRef.current[nodeId] || nodeId;
      const time = duration_ms != null ? ` en ${(duration_ms / 1000).toFixed(1)}s` : "";
      if (status === "ok") append("success", `“${label}” completado${time}`);
      else if (status === "error") append("error", `“${label}” falló${time}`);
      else if (status === "skipped") append("warning", `“${label}” omitido (deshabilitado)`);
    });

    const unFinished = listen<FinishedPayload>("automation-finished", () => {
      append("success", "Flujo de trabajo ejecutado correctamente");
    });

    return () => {
      unProgress.then((fn) => fn());
      unStatus.then((fn) => fn());
      unDetail.then((fn) => fn());
      unFinished.then((fn) => fn());
    };
  }, [append]);

  return { entries, append, clear };
}

export default useFlowLogs;
