import React from "react";
import { FlowNode, FlowConnection } from "../../types";
import { NODE_W, NODE_COLORS } from "../../Flowchart";
import { getNodePorts } from "./buildNodes";
import { getNodeHeight, portY, resolvePortIndex } from "./utils/nodePorts";
import { useDialog } from "../../components/DialogProvider";

interface FlowchartCanvasProps {
  nodes: FlowNode[];
  layout: Record<string, { x: number; y: number }>;
  activeNode: number;
  tempLine: { x1: number; y1: number; x2: number; y2: number; color?: string } | null;
  disabledNodes?: Set<string>;
  connections?: FlowConnection[];
  onWireClick?: (connectionId: string) => void;
  onWireMouseDown?: (e: React.MouseEvent, connection: FlowConnection) => void;
  selectedWireId?: string | null;
}

export function FlowchartCanvas({
  nodes,
  layout,
  activeNode,
  tempLine,
  disabledNodes,
  connections = [],
  onWireClick,
  onWireMouseDown,
  selectedWireId,
}: FlowchartCanvasProps) {
  const { confirm } = useDialog();
  const nodeMap = React.useMemo(() => {
    const map = new Map<string, FlowNode>();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  const getCurve = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.max(50, Math.abs(x2 - x1) * 0.4);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <svg className="n8n-wires" width={12000} height={8000}>
      <defs>
        {nodes.map(n => {
          const c = NODE_COLORS[n.type];
          return (
            <linearGradient key={`grad-${n.id}`} id={`wire-grad-${n.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={c} stopOpacity="0.8" />
              <stop offset="100%" stopColor={c} stopOpacity="0.3" />
            </linearGradient>
          );
        })}
      </defs>

      {connections.map(conn => {
        const srcNode = nodeMap.get(conn.sourceNodeId);
        const tgtNode = nodeMap.get(conn.targetNodeId);
        const a = layout[conn.sourceNodeId];
        const b = layout[conn.targetNodeId];

        if (!srcNode || !tgtNode || !a || !b) return null;

        const srcPorts = srcNode.ports || getNodePorts(srcNode.type);
        const tgtPorts = tgtNode.ports || getNodePorts(tgtNode.type);
        const srcCount = srcPorts.outputs.length;
        const tgtCount = tgtPorts.inputs.length;

        const srcIdx = resolvePortIndex(srcPorts.outputs, conn.sourcePortId);
        const tgtIdx = resolvePortIndex(tgtPorts.inputs, conn.targetPortId);
        // A stale port id must not silently reroute the wire through port 0.
        if (srcIdx < 0 || tgtIdx < 0) return null;

        const srcH = getNodeHeight(srcNode);
        const tgtH = getNodeHeight(tgtNode);

        const x1 = a.x + NODE_W;
        const y1 = a.y + portY(srcIdx, srcCount, srcH);
        const x2 = b.x;
        const y2 = b.y + portY(tgtIdx, tgtCount, tgtH);

        const d = getCurve(x1, y1, x2, y2);
        const isDisabled = disabledNodes?.has(conn.sourceNodeId) || disabledNodes?.has(conn.targetNodeId);
        const isSrcActive = nodes.findIndex(n => n.id === conn.sourceNodeId) === activeNode;
        const isSelected = selectedWireId === conn.id;
        const cls = [
          isDisabled ? "disabled" : "",
          isSrcActive ? "running" : "",
          isSelected ? "selected" : "",
        ].filter(Boolean).join(" ");

        // Bezier midpoint of the curve (control-point math simplifies to the average).
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;

        return (
          <g key={conn.id}>
            <path
              className={`n8n-wire ${cls}`}
              d={d}
              stroke={`url(#wire-grad-${conn.sourceNodeId})`}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseDown={(e) => {
                if (onWireMouseDown) {
                  onWireMouseDown(e, conn);
                } else {
                  e.stopPropagation();
                  confirm("¿Deseas eliminar esta conexión de flujo?").then((ok: boolean) => {
                    if (ok) onWireClick?.(conn.id);
                  });
                }
              }}
            />
            {isSelected && (
              <g
                className="n8n-wire-del"
                transform={`translate(${mx}, ${my})`}
                style={{ pointerEvents: "all", cursor: "pointer" }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onWireClick?.(conn.id);
                }}
              >
                <circle r={9} />
                <line x1={-3.2} y1={-3.2} x2={3.2} y2={3.2} />
                <line x1={3.2} y1={-3.2} x2={-3.2} y2={3.2} />
              </g>
            )}
          </g>
        );
      })}

      {tempLine && (
        <path
          className="n8n-wire temp"
          d={getCurve(tempLine.x1, tempLine.y1, tempLine.x2, tempLine.y2)}
          stroke={tempLine.color || "#888"}
        />
      )}
    </svg>
  );
}
export default FlowchartCanvas;
