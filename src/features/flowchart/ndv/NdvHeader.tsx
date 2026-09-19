import React, { useState } from "react";
import { X, Pin, Pencil, ExternalLink, Zap, Loader2 } from "lucide-react";
import { FlowNode } from "../../../types";
import { getNodeIcon } from "../buildNodes";

interface NdvHeaderProps {
  node: FlowNode;
  accent: string;
  n8nIconUrl?: string | null;
  initialFallback?: string;
  onClose: () => void;
  nodeName: string;
  setNodeName?: (val: string) => void;
  tab: "params" | "settings";
  setTab: (t: "params" | "settings") => void;
  stepRunning: boolean;
  canRunStep: boolean;
  onExecuteStep: () => void;
  isTriggerNode: boolean;
  docsUrl?: string | null;
}

export function NdvHeader({
  node,
  accent,
  n8nIconUrl: iconUrl,
  initialFallback,
  onClose,
  nodeName,
  setNodeName,
  tab,
  setTab,
  stepRunning,
  canRunStep,
  onExecuteStep,
  isTriggerNode,
  docsUrl,
}: NdvHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(nodeName || node.label);

  const fallbackIcon = getNodeIcon(node.type, 18);

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (setNodeName && titleInput.trim()) {
      setNodeName(titleInput.trim());
    }
  };

  return (
    <div className="ndv-header">
      {/* Left: Icon & Node Name with rename pencil */}
      <div className="ndv-header-left">
        <div className="ndv-icon" style={{ color: accent, borderColor: accent }}>
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain", padding: "3px" }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : initialFallback ? (
            <span className="ndv-initial-badge" style={{ background: accent }}>
              {initialFallback}
            </span>
          ) : (
            fallbackIcon
          )}
        </div>

        <div className="ndv-header-text">
          {isEditingTitle ? (
            <input
              type="text"
              className="ndv-title-input"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleBlur();
                if (e.key === "Escape") {
                  setTitleInput(nodeName || node.label);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
            />
          ) : (
            <div
              className="ndv-title"
              onClick={() => setIsEditingTitle(true)}
              title="Haz clic para renombrar el nodo"
              style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            >
              <span>{titleInput || node.label}</span>
              <Pencil size={12} className="ndv-rename-pencil" style={{ opacity: 0.45 }} />
              {node.pinEnabled && (
                <span className="ndv-pin-indicator" title="Datos fijados (Pin Data)">
                  <Pin size={10} /> Pin
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: Tabs + Execute Step button (matching n8n) */}
      <div className="ndv-header-center">
        <div className="ndv-top-tabs">
          <button
            type="button"
            className={`ndv-top-tab ${tab === "params" ? "active" : ""}`}
            onClick={() => setTab("params")}
          >
            Parameters
          </button>
          <button
            type="button"
            className={`ndv-top-tab ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        </div>

        <button
          type="button"
          className="ndv-top-exec-btn"
          disabled={!canRunStep || stepRunning}
          onClick={onExecuteStep}
          title={isTriggerNode ? "Probar este disparador" : "Ejecutar este paso"}
        >
          {stepRunning ? (
            <>
              <Loader2 size={13} className="spin" />
              <span>Ejecutando…</span>
            </>
          ) : (
            <>
              <Zap size={13} />
              <span>{isTriggerNode ? "Test step" : "Execute step"}</span>
            </>
          )}
        </button>
      </div>

      {/* Right: Docs link & Close button */}
      <div className="ndv-header-actions">
        <a
          href={docsUrl || `https://docs.n8n.io/integrations/builtin/app-nodes/${(node.n8nKey || node.type).toLowerCase()}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="ndv-docs-link"
          title="Ver documentación en n8n"
        >
          Docs <ExternalLink size={12} />
        </a>

        <button type="button" className="ndv-close" onClick={onClose} title="Cerrar vista de nodo (Esc)">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
export default NdvHeader;
