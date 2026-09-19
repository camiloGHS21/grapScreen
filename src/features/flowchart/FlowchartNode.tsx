import React, { useMemo } from "react";
import { Plus, Pencil, Check, X } from "lucide-react";
import { FlowNode } from "../../types";
import { NODE_COLORS, NODE_W } from "../../Flowchart";
import { getNodeIcon, getNodePorts } from "./buildNodes";
import { getNodeHeight, portY } from "./utils/nodePorts";
import n8nCatalog from "../../data/n8n-catalog.json";

const N8N_CATALOG = n8nCatalog as unknown as Array<{
  key: string;
  displayName: string;
  icon: string | null;
  glyph: { type: string; name: string } | null;
}>;
const N8N_ICON_BY_KEY = new Map(N8N_CATALOG.map((e) => [e.key, e.icon || e.glyph?.name || null]));
const N8N_NAME_BY_KEY = new Map(N8N_CATALOG.map((e) => [e.key, e.displayName]));

function n8nIconUrl(key: string): string | null {
  const icon = N8N_ICON_BY_KEY.get(key);
  if (!icon) return null;
  if (icon.endsWith(".svg")) {
    return `${import.meta.env.BASE_URL}n8n-icons/${icon}`;
  }
  // glyph name without extension → try the glyph SVG set
  return `${import.meta.env.BASE_URL}n8n-icons/${icon}.svg`;
}

function n8nInitialFor(key: string): string {
  const name = N8N_NAME_BY_KEY.get(key) || key;
  return name.trim().charAt(0).toUpperCase();
}

interface FlowchartNodeProps {
  node: FlowNode;
  pos: { x: number; y: number };
  isExpanded: boolean;
  isActive: boolean;
  isDisabled?: boolean;
  isSelected?: boolean;
  execStatus?: string;
  onNodeMouseDown: (e: React.MouseEvent, n: FlowNode) => void;
  onNodeClick: (n: FlowNode) => void;
  onEditClick?: (n: FlowNode) => void;
  onKeyDown: (e: React.KeyboardEvent, n: FlowNode) => void;
  onPortMouseDown: (e: React.MouseEvent, n: FlowNode, portId: string, color: string) => void;
  onInputPortMouseDown?: (e: React.MouseEvent, n: FlowNode, portId: string, color: string) => void;
  onAddClick: (e: React.MouseEvent, n: FlowNode, portId: string) => void;
  onContextMenu?: (e: React.MouseEvent, n: FlowNode) => void;
}

export function FlowchartNode({
  node,
  pos,
  isExpanded,
  isActive,
  isDisabled = false,
  isSelected = false,
  execStatus,
  onNodeMouseDown,
  onNodeClick,
  onEditClick,
  onKeyDown,
  onPortMouseDown,
  onInputPortMouseDown,
  onAddClick,
  onContextMenu,
}: FlowchartNodeProps) {
  const color = NODE_COLORS[node.type];
  const eventCount = (node.start == null || node.end == null) ? 0 : node.end - node.start + 1;
  const ports = node.ports || getNodePorts(node.type);
  const dynamicH = getNodeHeight(node);
  const sideInputs = ports.inputs.filter((p) => p.position !== "bottom");
  const bottomInputs = ports.inputs.filter((p) => p.position === "bottom");

  const isTrigger = node.type === "trigger" || node.type === "n8n_trigger" || node.type.endsWith("_trigger");

  return (
    <div
      data-id={node.id}
      className={`n8n-node${isTrigger ? " is-trigger" : ""}${isExpanded ? " expanded" : ""}${isActive ? " active" : ""}${isDisabled ? " disabled" : ""}${isSelected ? " selected" : ""}${execStatus === "ok" ? " exec-ok" : ""}${execStatus === "error" ? " exec-error" : ""}`}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: NODE_W,
        height: dynamicH,
        "--accent": color,
      } as React.CSSProperties}
      onMouseDown={(e) => onNodeMouseDown(e, node)}
      onClick={() => onNodeClick(node)}
      onDoubleClick={(e) => { e.stopPropagation(); onEditClick?.(node); }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, node); }}
      onKeyDown={(e) => onKeyDown(e, node)}
      tabIndex={0}
      role="button"
    >
      {/* Execution status badge (n8n-style check / error) */}
      {execStatus === "ok" && (
        <span className="n8n-status n8n-status-ok" title="Ejecutado correctamente"><Check size={10} strokeWidth={3.5} /></span>
      )}
      {execStatus === "error" && (
        <span className="n8n-status n8n-status-err" title="Error en la ejecución"><X size={10} strokeWidth={3.5} /></span>
      )}
      {execStatus === "running" && !isActive && (
        <span className="n8n-status n8n-status-run" title="Ejecutando…" />
      )}
      {node.pinEnabled && (
        <span className="n8n-status n8n-status-pin" title="Datos de prueba fijados (Pin Data)">📌</span>
      )}

      {/* Left side input ports */}
      {sideInputs.map((port, pi) => (
        <span
          key={port.id}
          className="n8n-port n8n-port-in"
          data-port={port.id}
          style={{ top: portY(pi, sideInputs.length, dynamicH), borderColor: port.color || color }}
          title={port.label}
          onMouseDown={(e) => {
            e.stopPropagation();
            onInputPortMouseDown?.(e, node, port.id, port.color || color);
          }}
        >
          {sideInputs.length > 1 && (
            <span className="n8n-port-label n8n-port-label-in">{port.label}</span>
          )}
        </span>
      ))}

      {/* Bottom sub-node input ports (n8n AI Agent sub-ports: Chat Model*, Memory, Tool) */}
      {bottomInputs.map((port, bi) => {
        const leftPct = ((bi + 1) / (bottomInputs.length + 1)) * 100;
        return (
          <div
            key={port.id}
            className="n8n-bottom-port-col"
            style={{ left: `${leftPct}%` }}
          >
            <span
              className={`n8n-port n8n-port-bottom ${port.shape === "diamond" ? "diamond-port" : ""}`}
              data-port={port.id}
              style={{ borderColor: port.color || color }}
              title={port.label}
              onMouseDown={(e) => {
                e.stopPropagation();
                onInputPortMouseDown?.(e, node, port.id, port.color || color);
              }}
            />
            <span className="n8n-bottom-port-label">
              {port.label?.replace("*", "")}
              {port.required && <span className="req-asterisk">*</span>}
            </span>
            <div className="n8n-bottom-port-stem" />
            <button
              type="button"
              className="n8n-bottom-add-btn"
              title={`Añadir ${port.label}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                onAddClick(e, node, port.id);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Plus size={9} />
            </button>
          </div>
        );
      })}

      {/* Output ports */}
      {ports.outputs.map((port, pi) => (
        <span
          key={port.id}
          className="n8n-port n8n-port-out"
          data-port={port.id}
          style={{ top: portY(pi, ports.outputs.length, dynamicH), borderColor: port.color || color }}
          title={port.label}
          onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node, port.id, port.color || color); }}
        >
          {ports.outputs.length > 1 && (
            <span className="n8n-port-label n8n-port-label-out" style={{ color: port.color || color }}>
              {port.label}
            </span>
          )}
          <button
            className="n8n-add"
            title="Añadir paso"
            onMouseDown={(e) => { e.stopPropagation(); onAddClick(e, node, port.id); }}
            // The click must be swallowed too: the node body listens for click,
            // and that handler dismisses the catalogue panel this "+" just
            // opened — so the panel flashed open and shut immediately.
            onClick={(e) => e.stopPropagation()}
          >
            <Plus size={10} />
          </button>
        </span>
      ))}

      {/* Node icon */}
      <div className="n8n-node-icon" style={{ color, borderColor: color }}>
        {node.n8nKey ? (
          <img
            src={n8nIconUrl(node.n8nKey) || undefined}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain", padding: "6px", display: "block" }}
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = "none";
              // Show a coloured initial badge as fallback, exactly like the
              // side panel does, so a missing icon never leaves a blank hole.
              const parent = img.parentElement;
              if (parent && !parent.querySelector(".n8n-initial-fallback")) {
                const span = document.createElement("span");
                span.className = "n8n-initial-fallback";
                span.textContent = n8nInitialFor(node.n8nKey!);
                span.style.cssText = `
                  position:absolute; inset:0; display:flex; align-items:center;
                  justify-content:center; font:700 14px Manrope; color:#fff;
                  background:${color}; border-radius:inherit;
                `;
                parent.appendChild(span);
              }
            }}
          />
        ) : (
          getNodeIcon(node.type)
        )}
      </div>

      {/* Node body */}
      <div className="n8n-node-body">
        <div className="n8n-node-title">{node.label}</div>
        <div className="n8n-node-sub" title={node.details}>{node.details}</div>
      </div>

      {/* Event count */}
      {node.type !== "start" && node.type !== "end" && (
        <span className="n8n-count">{eventCount}</span>
      )}

      {/* Edit button */}
      <button
        className="n8n-edit"
        title="Editar"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onEditClick?.(node); }}
      >
        <Pencil size={12} />
      </button>

      {/* Node warning badge (unconfigured node, n8n parity) */}
      {node.hasWarning && (
        <span
          className="n8n-node-warning"
          title="Este nodo no está configurado correctamente"
          onClick={(e) => {
            e.stopPropagation();
            onEditClick?.(node);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" stroke="#ffffff" strokeWidth="2.2" />
            <circle cx="12" cy="17" r="1" fill="#ffffff" stroke="none" />
          </svg>
        </span>
      )}
    </div>
  );
}
