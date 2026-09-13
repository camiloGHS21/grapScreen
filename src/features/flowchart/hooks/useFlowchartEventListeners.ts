import React, { useEffect } from "react";
import type { FlowNode, FlowConnection, StickyNoteData } from "../../../types";
import { getNodeHeight } from "../utils/nodePorts";
import { NODE_W } from "../../../Flowchart";
import { getNodePorts } from "../buildNodes";
import { validateConnection } from "../utils/graphUtils";
import { useFlowchartKeyboardShortcuts } from "./useFlowchartKeyboardShortcuts";

interface EventListenersProps {
  dragRef: React.MutableRefObject<{
    id: string;
    offX: number;
    offY: number;
    startX?: number;
    startY?: number;
    initialPositions?: Record<string, { x: number; y: number }>;
  } | null>;
  dragNoteRef: React.MutableRefObject<{ id: string; offX: number; offY: number } | null>;
  connectRef: React.MutableRefObject<{ from: string; portId: string; color: string; type: "input" | "output" } | null>;
  draggedRef: React.MutableRefObject<boolean>;
  tempLine: any;
  setTempLine: any;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  positions: Record<string, { x: number; y: number }>;
  setPositions: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number }>>>;
  connections: FlowConnection[];
  setConnections: React.Dispatch<React.SetStateAction<FlowConnection[]>>;
  notes: StickyNoteData[];
  setNotes: React.Dispatch<React.SetStateAction<StickyNoteData[]>>;
  disabledNodes: Set<string>;
  selectedWireId: string | null;
  setSelectedWireId: React.Dispatch<React.SetStateAction<string | null>>;
  selectionBox: any;
  setSelectionBox: any;
  nodes: FlowNode[];
  layout: Record<string, { x: number; y: number }>;
  selectedNodes: Set<string>;
  setSelectedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  deleteSelectedElements: () => void;
  saveLayoutMetadata: (positions: any, connections: any, notes: any, disabledNodes: any) => void;
  duplicateNode?: (nodeId: string) => void;
}

function showConnectionToast(message: string) {
  let host = document.getElementById("connection-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "connection-toast-host";
    host.style.cssText =
      "position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText =
    "background:#ef4444;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:320px;";
  host.appendChild(toast);
  window.setTimeout(() => {
    toast.style.transition = "opacity .3s";
    toast.style.opacity = "0";
    window.setTimeout(() => toast.remove(), 300);
  }, 2600);
}

export function useFlowchartEventListeners({
  dragRef,
  dragNoteRef,
  connectRef,
  draggedRef,
  tempLine,
  setTempLine,
  toWorld,
  positions,
  setPositions,
  connections,
  setConnections,
  notes,
  setNotes,
  disabledNodes,
  selectedWireId,
  setSelectedWireId,
  selectionBox,
  setSelectionBox,
  nodes,
  layout,
  selectedNodes,
  setSelectedNodes,
  deleteSelectedElements,
  saveLayoutMetadata,
  duplicateNode,
}: EventListenersProps) {
  useFlowchartKeyboardShortcuts({
    nodes,
    selectedNodes,
    setSelectedNodes,
    selectedWireId,
    setSelectedWireId,
    connections,
    setConnections,
    notes,
    positions,
    disabledNodes,
    deleteSelectedElements,
    saveLayoutMetadata,
    duplicateNode,
    dragRef,
  });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const w = toWorld(e.clientX, e.clientY);
        draggedRef.current = true;
        const initPositions = dragRef.current.initialPositions;
        if (dragRef.current.startX !== undefined && dragRef.current.startY !== undefined && initPositions) {
          const dx = w.x - dragRef.current.startX;
          const dy = w.y - dragRef.current.startY;
          setPositions((p) => {
            const next = { ...p };
            Object.keys(initPositions).forEach((id) => {
              if (!id.startsWith("note-")) {
                const init = initPositions[id];
                if (init) next[id] = { x: init.x + dx, y: init.y + dy };
              }
            });
            return next;
          });
          setNotes((n) =>
            n.map((note) => {
              const init = initPositions[note.id];
              if (init) return { ...note, x: init.x + dx, y: init.y + dy };
              return note;
            })
          );
        } else {
          setPositions((p) => ({ ...p, [dragRef.current!.id]: { x: w.x - dragRef.current!.offX, y: w.y - dragRef.current!.offY } }));
        }
      } else if (dragNoteRef.current) {
        const w = toWorld(e.clientX, e.clientY);
        setNotes((n) =>
          n.map((note) =>
            note.id === dragNoteRef.current!.id
              ? { ...note, x: w.x - dragNoteRef.current!.offX, y: w.y - dragNoteRef.current!.offY }
              : note
          )
        );
      } else if (connectRef.current && tempLine) {
        const w = toWorld(e.clientX, e.clientY);
        setTempLine((t: any) => (t ? { ...t, x2: w.x, y2: w.y } : null));
      } else if (selectionBox?.active) {
        setSelectionBox((s: any) => (s ? { ...s, endX: e.clientX, endY: e.clientY } : null));
        const wStart = toWorld(selectionBox.startX, selectionBox.startY);
        const wEnd = toWorld(e.clientX, e.clientY);
        const minX = Math.min(wStart.x, wEnd.x);
        const maxX = Math.max(wStart.x, wEnd.x);
        const minY = Math.min(wStart.y, wEnd.y);
        const maxY = Math.max(wStart.y, wEnd.y);

        // Un recuadro ínfimo es en realidad un clic: no seleccionamos nada y
        // dejamos que el mouseup limpie la selección. Sin esto aparecerían
        // "selecciones" fantasma de 1-2 px cada vez que se hace clic en fondo.
        const dragged =
          Math.abs(e.clientX - selectionBox.startX) > 3 ||
          Math.abs(e.clientY - selectionBox.startY) > 3;
        if (!dragged) return;

        const newlySelected = selectionBox.additive ? new Set(selectedNodes) : new Set<string>();
        nodes.forEach((node) => {
          const pos = layout[node.id];
          if (pos) {
            const nodeH = getNodeHeight(node);
            const nodeMinX = pos.x;
            const nodeMaxX = pos.x + NODE_W;
            const nodeMinY = pos.y;
            const nodeMaxY = pos.y + nodeH;
            const intersect = !(nodeMaxX < minX || nodeMinX > maxX || nodeMaxY < minY || nodeMinY > maxY);
            if (intersect) newlySelected.add(node.id);
          }
        });
        notes.forEach((note) => {
          const noteMinX = note.x;
          const noteMaxX = note.x + note.w;
          const noteMinY = note.y;
          const noteMaxY = note.y + note.h;
          // El último término comparaba noteMaxY dos veces: la nota nunca
          // quedaba descartada por su borde superior y se seleccionaba de más.
          const intersect = !(noteMaxX < minX || noteMinX > maxX || noteMaxY < minY || noteMinY > maxY);
          if (intersect) newlySelected.add(note.id);
        });
        // Solo guardamos el conjunto si de verdad cambió: evita re-renders en
        // bucle mientras se arrastra por encima de la misma zona.
        const changed =
          newlySelected.size !== selectedNodes.size ||
          Array.from(newlySelected).some((id) => !selectedNodes.has(id));
        if (changed) setSelectedNodes(newlySelected);
      }
    };

    const onUp = (e: MouseEvent) => {
      if (dragRef.current || dragNoteRef.current) {
        saveLayoutMetadata(positions, connections, notes, disabledNodes);
      } else if (connectRef.current) {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const nodeEl = el?.closest(".n8n-node");
        const targetNodeId = nodeEl?.getAttribute("data-id");

        if (targetNodeId && targetNodeId !== connectRef.current.from) {
          const tgtNode = nodes.find((n) => n.id === targetNodeId);
          if (connectRef.current.type === "output") {
            const targetPortId =
              el?.closest(".n8n-port-in")?.getAttribute("data-port") ||
              (tgtNode ? (tgtNode.ports || getNodePorts(tgtNode.type)).inputs[0]?.id : null);
            if (targetPortId) {
              const check = validateConnection(
                connectRef.current.from,
                targetNodeId,
                targetPortId,
                connections
              );
              if (!check.ok) {
                showConnectionToast(check.reason || "Conexión no permitida.");
              } else {
                const cleanedConns = connections.filter(
                  (c) => !(c.targetNodeId === targetNodeId && c.targetPortId === targetPortId)
                );
                const next = [
                  ...cleanedConns,
                  {
                    id: `conn-${Date.now()}`,
                    sourceNodeId: connectRef.current.from,
                    sourcePortId: connectRef.current.portId,
                    targetNodeId,
                    targetPortId,
                  },
                ];
                setConnections(next);
                saveLayoutMetadata(positions, next, notes, disabledNodes);
              }
            }
          } else if (connectRef.current.type === "input") {
            const targetPortId =
              el?.closest(".n8n-port-out")?.getAttribute("data-port") ||
              (tgtNode ? (tgtNode.ports || getNodePorts(tgtNode.type)).outputs[0]?.id : null);
            if (targetPortId) {
              const check = validateConnection(
                targetNodeId,
                connectRef.current.from,
                connectRef.current.portId,
                connections
              );
              if (!check.ok) {
                showConnectionToast(check.reason || "Conexión no permitida.");
              } else {
                const cleanedConns = connections.filter(
                  (c) => !(c.targetNodeId === connectRef.current!.from && c.targetPortId === connectRef.current!.portId)
                );
                const next = [
                  ...cleanedConns,
                  {
                    id: `conn-${Date.now()}`,
                    sourceNodeId: targetNodeId,
                    sourcePortId: targetPortId,
                    targetNodeId: connectRef.current.from,
                    targetPortId: connectRef.current.portId,
                  },
                ];
                setConnections(next);
                saveLayoutMetadata(positions, next, notes, disabledNodes);
              }
            }
          }
        }
        setTempLine(null);
      } else if (selectionBox?.active) {
        // Clic simple en el fondo (sin arrastre): limpia la selección.
        const dragged =
          Math.abs(e.clientX - selectionBox.startX) > 3 ||
          Math.abs(e.clientY - selectionBox.startY) > 3;
        if (!dragged && !selectionBox.additive) {
          setSelectedNodes(new Set());
          setSelectedWireId(null);
        }
        setSelectionBox(null);
      }
      dragRef.current = null;
      dragNoteRef.current = null;
      connectRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [positions, connections, notes, disabledNodes, tempLine, selectionBox, nodes, layout, selectedNodes]);
}
