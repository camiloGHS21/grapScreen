import React from "react";
import type { FlowNode, FlowConnection, StickyNoteData, RecordedEvent } from "../../../types";
import { NODE_COLORS, NODE_W } from "../../../Flowchart";
import { getNodePorts } from "../buildNodes";
import { getNodeHeight, resolvePortIndex, portY, portBottomX } from "../utils/nodePorts";

interface UseWorkspaceActionsProps {
  events: RecordedEvent[];
  nodes: FlowNode[];
  layout: Record<string, { x: number; y: number }>;
  positions: Record<string, { x: number; y: number }>;
  connections: FlowConnection[];
  setConnections: React.Dispatch<React.SetStateAction<FlowConnection[]>>;
  notes: StickyNoteData[];
  setNotes: React.Dispatch<React.SetStateAction<StickyNoteData[]>>;
  disabledNodes: Set<string>;
  saveLayoutMetadata: (pos: any, conns: any, noteList: any, disabled: Set<string>) => void;
  setSelectedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedWireId: React.Dispatch<React.SetStateAction<string | null>>;
  setCtxMenu: React.Dispatch<React.SetStateAction<any>>;
  setSelectionBox: React.Dispatch<React.SetStateAction<any>>;
  expanded: string | null;
  setExpanded: React.Dispatch<React.SetStateAction<string | null>>;
  editEventsList: RecordedEvent[];
  setEditEventsList: React.Dispatch<React.SetStateAction<RecordedEvent[]>>;
  onSaveEvents?: (updatedEvents: RecordedEvent[]) => void;
  toWorld: (x: number, y: number) => { x: number; y: number };
  connectRef: React.MutableRefObject<any>;
  setTempLine: React.Dispatch<React.SetStateAction<any>>;
  portY: (index: number, count: number, nodeH?: number) => number;
}

export function useWorkspaceActions({
  events,
  nodes,
  layout,
  positions,
  connections,
  setConnections,
  notes,
  setNotes,
  disabledNodes,
  saveLayoutMetadata,
  setSelectedNodes,
  setSelectedWireId,
  setCtxMenu,
  setSelectionBox,
  expanded,
  setExpanded,
  editEventsList,
  onSaveEvents,
  toWorld,
  connectRef,
  setTempLine,
  portY,
}: UseWorkspaceActionsProps) {

  const deleteNote = (id: string) => {
    const next = notes.filter(n => n.id !== id);
    setNotes(next);
    saveLayoutMetadata(positions, connections, next, disabledNodes);
  };

  const duplicateNote = (id: string) => {
    const original = notes.find(n => n.id === id);
    if (original) {
      const next = [...notes, { ...original, id: `note-${Date.now()}`, x: original.x + 30, y: original.y + 30 }];
      setNotes(next);
      saveLayoutMetadata(positions, connections, next, disabledNodes);
    }
  };

  const cycleNoteColor = (id: string) => {
    const colors = ["yellow", "green", "red", "blue"];
    const next = notes.map(n => n.id === id ? { ...n, color: colors[(colors.indexOf(n.color || "yellow") + 1) % colors.length] } : n);
    setNotes(next);
    saveLayoutMetadata(positions, connections, next, disabledNodes);
  };

  const handleSaveGroupedEvents = () => {
    if (!expanded) return;
    const node = nodes.find(n => n.id === expanded);
    if (!node || node.start == null || node.end == null) return;
    const newEvents = [...events];
    newEvents.splice(node.start, node.end - node.start + 1, ...editEventsList);
    onSaveEvents?.(newEvents);
    setExpanded(null);
  };

  const handleViewportMouseDown = (e: React.MouseEvent) => {
    // Reparto de gestos del lienzo:
    //   izquierdo          → mover el lienzo (lo arranca handlePanMouseDown)
    //   derecho sostenido  → selección por recuadro
    // Los nodos y las notas hacen stopPropagation, así que este handler solo
    // se dispara cuando el mousedown empieza en el fondo del lienzo.
    if (e.button === 2) {
      setSelectionBox({
        startX: e.clientX,
        startY: e.clientY,
        endX: e.clientX,
        endY: e.clientY,
        active: true,
        additive: e.shiftKey,
      });
      if (!e.shiftKey) {
        setSelectedNodes(new Set());
        setSelectedWireId(null);
      }
    } else if (e.button === 0 || e.button === 1) {
      // Paneo: ningún recuadro debe quedar vivo mientras se mueve el lienzo.
      setSelectionBox(null);
    }
    setCtxMenu(null);
  };

  const handleWireMouseDown = (e: React.MouseEvent, conn: FlowConnection) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    setSelectedWireId(conn.id);

    const srcNode = nodes.find(n => n.id === conn.sourceNodeId);
    const tgtNode = nodes.find(n => n.id === conn.targetNodeId);
    const srcPos = layout[conn.sourceNodeId];
    const tgtPos = layout[conn.targetNodeId];
    if (!srcNode || !tgtNode || !srcPos || !tgtPos) return;

    const srcPorts = srcNode.ports || getNodePorts(srcNode.type);
    const tgtPorts = tgtNode.ports || getNodePorts(tgtNode.type);
    const srcCount = srcPorts.outputs.length;
    const tgtCount = tgtPorts.inputs.length;

    const srcIdx = resolvePortIndex(srcPorts.outputs, conn.sourcePortId);
    const tgtIdx = resolvePortIndex(tgtPorts.inputs, conn.targetPortId);

    const srcH = getNodeHeight(srcNode);
    const tgtH = getNodeHeight(tgtNode);

    const tgtPort = tgtPorts.inputs[tgtIdx];
    const isBottom = tgtPort?.position === "bottom";

    let x1 = srcPos.x + NODE_W;
    let y1 = srcPos.y + portY(srcIdx, srcCount, srcH);
    if (isBottom && srcPos.y > tgtPos.y) {
      x1 = srcPos.x + NODE_W / 2;
      y1 = srcPos.y;
    }

    let x2 = tgtPos.x;
    let y2 = tgtPos.y;
    if (isBottom) {
      const bottomInputs = tgtPorts.inputs.filter((p) => p.position === "bottom");
      const bIdx = bottomInputs.findIndex((p) => p.id === tgtPort.id);
      x2 = tgtPos.x + portBottomX(bIdx >= 0 ? bIdx : 0, bottomInputs.length, NODE_W);
      y2 = tgtPos.y + tgtH;
    } else {
      const sideInputs = tgtPorts.inputs.filter((p) => p.position !== "bottom");
      const sIdx = sideInputs.findIndex((p) => p.id === tgtPort.id);
      x2 = tgtPos.x;
      y2 = tgtPos.y + portY(sIdx >= 0 ? sIdx : tgtIdx, sideInputs.length, tgtH);
    }

    const w = toWorld(e.clientX, e.clientY);
    const dSrc = Math.hypot(w.x - x1, w.y - y1);
    const dTgt = Math.hypot(w.x - x2, w.y - y2);

    const nextConns = connections.filter(c => c.id !== conn.id);
    setConnections(nextConns);

    if (dSrc < dTgt) {
      connectRef.current = {
        from: conn.targetNodeId,
        portId: conn.targetPortId,
        color: NODE_COLORS[srcNode.type] || "#888",
        type: "input"
      };
      setTempLine({ x1: x2, y1: y2, x2: w.x, y2: w.y, color: NODE_COLORS[srcNode.type] });
    } else {
      connectRef.current = {
        from: conn.sourceNodeId,
        portId: conn.sourcePortId,
        color: NODE_COLORS[srcNode.type] || "#888",
        type: "output"
      };
      setTempLine({ x1: x1, y1: y1, x2: w.x, y2: w.y, color: NODE_COLORS[srcNode.type] });
    }
    saveLayoutMetadata(positions, nextConns, notes, disabledNodes);
  };

  return {
    deleteNote,
    duplicateNote,
    cycleNoteColor,
    handleSaveGroupedEvents,
    handleViewportMouseDown,
    handleWireMouseDown,
  };
}
