import React from "react";
import { Plus, Pencil, Check, X } from "lucide-react";
import { FlowNode } from "../../types";
import { NODE_COLORS, NODE_W } from "../../Flowchart";
import { getNodeIcon, getNodePorts } from "./buildNodes";
import { getNodeHeight, portY } from "./utils/nodePorts";

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

  return (
    <div
      data-id={node.id}
      className={`n8n-node${isExpanded ? " expanded" : ""}${isActive ? " active" : ""}${isDisabled ? " disabled" : ""}${isSelected ? " selected" : ""}${execStatus === "ok" ? " exec-ok" : ""}${execStatus === "error" ? " exec-error" : ""}`}
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


      {/* Input ports */}
      {ports.inputs.map((port, pi) => (
        <span
          key={port.id}
          className="n8n-port n8n-port-in"
          data-port={port.id}
          style={{ top: portY(pi, ports.inputs.length, dynamicH), borderColor: port.color || color }}
          title={port.label}
          onMouseDown={(e) => {
            e.stopPropagation();
            onInputPortMouseDown?.(e, node, port.id, port.color || color);
          }}
        >
          {ports.inputs.length > 1 && (
            <span className="n8n-port-label n8n-port-label-in">{port.label}</span>
          )}
        </span>
      ))}

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
        {getNodeIcon(node.type)}
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
    </div>
  );
}
