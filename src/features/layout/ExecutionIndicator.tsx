import React from "react";
import { Loader2 } from "lucide-react";
import { AutomationSummary } from "../../types";

interface ExecutionIndicatorProps {
  executing: boolean;
  bgMode: boolean;
  selectedAutomation: AutomationSummary | null;
  progressIndex: number | null;
  previewData: string | null;
  stopExecute: () => void;
}

export function ExecutionIndicator({
  executing,
  bgMode,
  selectedAutomation,
  progressIndex,
  previewData,
  stopExecute
}: ExecutionIndicatorProps) {
  if (!executing) return null;



  if (bgMode && selectedAutomation) {
    return (
      <div className="exec-dock">
        <div className="exec-dock-head">
          <span className="exec-dot" />
          <span className="exec-dock-title">{selectedAutomation.name}</span>
          <button className="exec-dock-stop" onClick={stopExecute}>Detener</button>
        </div>
        <div className="exec-dock-progress">
          <div className="exec-dock-bar" style={{ width: `${progressIndex != null && selectedAutomation.event_count ? ((progressIndex + 1) / selectedAutomation.event_count) * 100 : 0}%` }} />
        </div>
        <div className="exec-dock-body">
          {progressIndex != null && <span>Paso {progressIndex + 1} de {selectedAutomation.event_count}</span>}
          {previewData && <div className="exec-dock-preview"><img src={`data:image/png;base64,${previewData}`} alt="Vista previa" /></div>}
        </div>
      </div>
    );
  }

  return null;
}
