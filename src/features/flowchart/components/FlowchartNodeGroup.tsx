import React from "react";
import { createPortal } from "react-dom";
import { ADVANCED_NODE_TYPES } from "../utils/nodeCatalog";
import type { FlowNode, FlowConnection, RecordedEvent, AddMenuState } from "../../../types";
import { FlowchartNode } from "../FlowchartNode";
import { NodeDetailPanel } from "../NodeDetailPanel";
import { getNodePorts } from "../buildNodes";
import { getNodeHeight, resolvePortIndex, portY } from "../utils/nodePorts";
import { NODE_W } from "../../../Flowchart";

interface FlowchartNodeGroupProps {
  node: FlowNode;
  idx: number;
  activeNodeIdx: number;
  execStatus?: string;
  expanded: string | null;
  setExpanded: React.Dispatch<React.SetStateAction<string | null>>;
  disabledNodes: Set<string>;
  selectedNodes: Set<string>;
  setSelectedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  dragRef: React.MutableRefObject<{
    id: string;
    offX: number;
    offY: number;
    startX?: number;
    startY?: number;
    initialPositions?: Record<string, { x: number; y: number }>;
  } | null>;
  draggedRef: React.MutableRefObject<boolean>;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  connectRef: React.MutableRefObject<{ from: string; portId: string; color: string; type: "input" | "output" } | null>;
  setTempLine: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; color?: string } | null>>;
  connections: FlowConnection[];
  setConnections: React.Dispatch<React.SetStateAction<FlowConnection[]>>;
  layout: Record<string, { x: number; y: number }>;
  positions: Record<string, { x: number; y: number }>;
  notes: any;
  saveLayoutMetadata: (positions: any, connections: any, notes: any, disabledNodes: any) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  setAddMenu: React.Dispatch<React.SetStateAction<AddMenuState | null>>;
  setCtxMenu: React.Dispatch<React.SetStateAction<{ id: string; x: number; y: number; isNote?: boolean } | null>>;
  isEditingGroup: boolean;
  setIsEditingGroup: React.Dispatch<React.SetStateAction<boolean>>;
  editEventsList: RecordedEvent[];
  setEditEventsList: React.Dispatch<React.SetStateAction<RecordedEvent[]>>;
  handleSaveGroupedEvents: () => void;
  events: RecordedEvent[];
  nodes: FlowNode[];
  portY: (index: number, count: number, nodeH?: number) => number;
  onEditNode?: (node: FlowNode) => void;
  /**
   * Opens the catalogue panel anchored to a specific node/port, so whatever is
   * picked next gets wired to it. Replaces the inline "add node" modal: the
   * user already decided where the new node goes by clicking that "+", so a
   * second picker on top of the canvas only adds a step.
   */
  onRequestAddFrom?: (sourceNodeId: string, sourcePortId: string) => void;
  /** Fired when the user clicks a node body — used to dismiss the catalogue. */
  onNodeActivate?: () => void;
}

export function FlowchartNodeGroup({
  node,
  idx,
  activeNodeIdx,
  execStatus,
  expanded,
  setExpanded,
  disabledNodes,
  selectedNodes,
  setSelectedNodes,
  dragRef,
  draggedRef,
  toWorld,
  connectRef,
  setTempLine,
  connections,
  setConnections,
  layout,
  positions,
  notes,
  saveLayoutMetadata,
  containerRef,
  setAddMenu,
  setCtxMenu,
  isEditingGroup,
  setIsEditingGroup,
  editEventsList,
  setEditEventsList,
  handleSaveGroupedEvents,
  events,
  nodes,
  portY,
  onEditNode,
  onRequestAddFrom,
  onNodeActivate,
}: FlowchartNodeGroupProps) {
  const pos = layout[node.id];
  // Posición donde empezó el botón derecho sobre este nodo. Sirve para no
  // abrir el menú contextual cuando el gesto fue un arrastre (el recuadro de
  // selección se dibuja con el derecho sostenido).
  const rightDownRef = React.useRef<{ x: number; y: number } | null>(null);
  if (!pos) return null;

  const handleEditClick = (n: FlowNode) => {
    if (n.type === "start" || n.type === "end") return;
    setExpanded(n.id);
    setIsEditingGroup(true);
    if (n.start != null && n.end != null) {
      setEditEventsList(JSON.parse(JSON.stringify(events.slice(n.start, n.end + 1))));
    }
  };

  return (
    <div key={node.id} style={{ position: "absolute", left: pos.x, top: pos.y, width: NODE_W, height: getNodeHeight(node) }}>
      <FlowchartNode
        node={node}
        pos={{ x: 0, y: 0 }}
        execStatus={execStatus}
        isExpanded={expanded === node.id}
        isActive={idx === activeNodeIdx}
        isDisabled={disabledNodes.has(node.id)}
        isSelected={selectedNodes.has(node.id)}
        onEditClick={handleEditClick}
        onNodeMouseDown={(e) => {
          // El botón derecho/central sobre un nodo no debe llegar al lienzo:
          // allí arranca el paneo, y el clic derecho de un nodo abre su menú
          // contextual (cualquier temblor del ratón movería la vista).
          if (e.button !== 0) {
            e.stopPropagation();
            if (e.button === 2) rightDownRef.current = { x: e.clientX, y: e.clientY };
            return;
          }
          e.stopPropagation();
          const w = toWorld(e.clientX, e.clientY);

          let activeSelected = new Set(selectedNodes);
          if (!selectedNodes.has(node.id)) {
            activeSelected = new Set([node.id]);
            setSelectedNodes(activeSelected);
          }

          const initialPosMap: Record<string, { x: number; y: number }> = {};
          activeSelected.forEach((id) => {
            if (positions[id]) {
              initialPosMap[id] = { ...positions[id] };
            } else if (layout[id]) {
              initialPosMap[id] = { ...layout[id] };
            } else {
              const note = notes.find((n: any) => n.id === id);
              if (note) {
                initialPosMap[id] = { x: note.x, y: note.y };
              }
            }
          });

          dragRef.current = {
            id: node.id,
            startX: w.x,
            startY: w.y,
            initialPositions: initialPosMap,
            offX: w.x - pos.x,
            offY: w.y - pos.y,
          };
        }}
        onNodeClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          // Clicking the canvas node is an explicit "I'm done choosing": the
          // catalogue panel gets out of the way, matching n8n.
          onNodeActivate?.();
          if (node.type === "start" || node.type === "end") {
            setExpanded(null);
            setCtxMenu(null);
            return;
          }
          setExpanded((prev) => (prev === node.id ? null : node.id));
          setCtxMenu(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (node.type === "start" || node.type === "end") {
              setExpanded(null);
              return;
            }
            setExpanded((prev) => (prev === node.id ? null : node.id));
          }
        }}
        onPortMouseDown={(e, n, portId, color) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          connectRef.current = { from: n.id, portId, color, type: "output" };
          const ports = n.ports || getNodePorts(n.type);
          const outIdx = resolvePortIndex(ports.outputs, portId);
          const nodeH = getNodeHeight(n);
          const p = { x: pos.x + NODE_W, y: pos.y + portY(outIdx >= 0 ? outIdx : 0, ports.outputs.length, nodeH) };
          setTempLine({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, color });
        }}
        onInputPortMouseDown={(e, n, portId, color) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const targetConn = connections.find((c) => c.targetNodeId === n.id && c.targetPortId === portId);
          if (targetConn) {
            const nextConns = connections.filter((c) => c.id !== targetConn.id);
            setConnections(nextConns);
            connectRef.current = { from: targetConn.sourceNodeId, portId: targetConn.sourcePortId, color, type: "output" };
            const srcNodePos = layout[targetConn.sourceNodeId];
            const srcNode = nodes.find((sn) => sn.id === targetConn.sourceNodeId);
            if (srcNodePos && srcNode) {
              const ports = srcNode.ports || getNodePorts(srcNode.type);
              const outIdx = resolvePortIndex(ports.outputs, targetConn.sourcePortId);
              const srcH = getNodeHeight(srcNode);
              const p = { x: srcNodePos.x + NODE_W, y: srcNodePos.y + portY(outIdx >= 0 ? outIdx : 0, ports.outputs.length, srcH) };
              setTempLine({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, color });
            }
            saveLayoutMetadata(positions, nextConns, notes, disabledNodes);
          } else {
            connectRef.current = { from: n.id, portId, color, type: "input" };
            const ports = n.ports || getNodePorts(n.type);
            const inIdx = resolvePortIndex(ports.inputs, portId);
            const nodeH = getNodeHeight(n);
            const p = { x: pos.x, y: pos.y + portY(inIdx >= 0 ? inIdx : 0, ports.inputs.length, nodeH) };
            setTempLine({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, color });
          }
        }}
        onAddClick={(e, n, portId) => {
          e.stopPropagation();
          // Opens the catalogue panel anchored to this node/port instead of the
          // inline picker: picking there wires the node straight onto this port.
          onRequestAddFrom?.(n.id, portId);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // El recuadro de selección se dibuja con el botón derecho sostenido:
          // tras un arrastre NO debe saltar el menú contextual, igual que en
          // cualquier editor. Solo se abre si el derecho no se movió.
          const down = rightDownRef.current;
          rightDownRef.current = null;
          if (down && (Math.abs(e.clientX - down.x) > 3 || Math.abs(e.clientY - down.y) > 3)) return;
          // Si el clic derecho cae fuera de la selección, pasa a seleccionar
          // ese nodo: el menú contextual siempre habla de lo que está marcado,
          // y así "Eliminar selección" nunca borra algo invisible.
          if (!selectedNodes.has(node.id)) {
            setSelectedNodes(new Set([node.id]));
          }
          const rect = containerRef.current!.getBoundingClientRect();
          setCtxMenu({ id: node.id, x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
      />
      <NodeDetailPanel
        isExpanded={expanded === node.id}
        isEditingGroup={isEditingGroup}
        setIsEditingGroup={setIsEditingGroup}
        editEventsList={editEventsList}
        setEditEventsList={setEditEventsList}
        handleSaveGroupedEvents={handleSaveGroupedEvents}
        updateSubEvent={(i, k, v) =>
          setEditEventsList((prev) => {
            const copy = [...prev];
            copy[i] = { ...copy[i], data: { ...copy[i].data, [k]: v } };
            return copy;
          })
        }
        updateSubEventTime={(i, t) =>
          setEditEventsList((prev) => {
            const copy = [...prev];
            copy[i] = { ...copy[i], at_ms: t };
            return copy;
          })
        }
        node={node}
        events={events}
        nodes={nodes}
        onClose={() => { setExpanded(null); setIsEditingGroup(false); }}
        onEditNode={onEditNode}
      />
    </div>
  );
}
export default FlowchartNodeGroup;
