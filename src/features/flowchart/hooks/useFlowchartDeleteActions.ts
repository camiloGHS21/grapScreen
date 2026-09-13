import type { FlowNode, FlowConnection, StickyNoteData, RecordedEvent } from "../../../types";

interface DeleteActionsProps {
  events: RecordedEvent[];
  connections: FlowConnection[];
  setConnections: React.Dispatch<React.SetStateAction<FlowConnection[]>>;
  notes: StickyNoteData[];
  setNotes: React.Dispatch<React.SetStateAction<StickyNoteData[]>>;
  positions: Record<string, { x: number; y: number }>;
  disabledNodes: Set<string>;
  selectedNodes: Set<string>;
  setSelectedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedWireId: string | null;
  setSelectedWireId: React.Dispatch<React.SetStateAction<string | null>>;
  nodes: FlowNode[];
  saveLayoutMetadata: (
    pos: any,
    conns: any,
    noteList: any,
    disabled: Set<string>,
    customEvents?: RecordedEvent[]
  ) => void;
  onDeleteTargetApp?: () => void;
}

export function useFlowchartDeleteActions({
  events,
  connections,
  setConnections,
  notes,
  setNotes,
  positions,
  disabledNodes,
  selectedNodes,
  setSelectedNodes,
  selectedWireId,
  setSelectedWireId,
  nodes,
  saveLayoutMetadata,
  onDeleteTargetApp,
}: DeleteActionsProps) {
  const deleteSelectedElements = () => {
    const selectedNodeIds = Array.from(selectedNodes).filter((id) => !id.startsWith("note-"));

    // If deleting the target app node
    if (selectedNodeIds.includes("app")) {
      onDeleteTargetApp?.();
      setSelectedNodes(new Set());
      return;
    }

    let nextEvents = [...events];
    let nextConnections = [...connections];
    let nextNotes = [...notes];
    const nextPositions = { ...positions };
    let metadataChanged = false;

    const selectedNoteIds = Array.from(selectedNodes).filter((id) => id.startsWith("note-"));
    if (selectedNoteIds.length > 0) {
      nextNotes = notes.filter((n) => !selectedNoteIds.includes(n.id));
      metadataChanged = true;
    }

    if (selectedWireId) {
      nextConnections = nextConnections.filter((c) => c.id !== selectedWireId);
      metadataChanged = true;
    }

    if (selectedNodeIds.length > 0) {
      const nodesToDelete = nodes
        .filter((n) => selectedNodeIds.includes(n.id))
        .sort((a, b) => (b.end ?? b.start ?? 0) - (a.end ?? a.start ?? 0));

      nodesToDelete.forEach((n) => {
        if (n.type === "delay" || n.type === "wait") {
          if (n.start !== undefined && n.end !== undefined && n.start >= 0 && n.start < nextEvents.length) {
            const ev = nextEvents[n.start];
            if (ev && (ev.kind === "delay" || ev.kind === "wait")) {
              nextEvents.splice(n.start, n.end - n.start + 1);
            }
          }
          nextConnections = nextConnections.filter((c) => c.sourceNodeId !== n.id && c.targetNodeId !== n.id);
          delete nextPositions[n.id];
          metadataChanged = true;
          return;
        }
        if (n.start !== undefined && n.end !== undefined) {
          nextEvents.splice(n.start, n.end - n.start + 1);
          nextConnections = nextConnections.filter((c) => c.sourceNodeId !== n.id && c.targetNodeId !== n.id);
          delete nextPositions[n.id];
          metadataChanged = true;
        } else {
          console.warn("[deleteSelectedElements] Nodo sin rango de eventos:", n.id, n.type);
        }
      });
    }

    if (metadataChanged || selectedNodeIds.length > 0) {
      setConnections(nextConnections);
      setNotes(nextNotes);
      setSelectedNodes(new Set());
      setSelectedWireId(null);
      saveLayoutMetadata(nextPositions, nextConnections, nextNotes, disabledNodes, nextEvents);
    }
  };

  const deleteNode = (nodeId: string) => {
    console.log("[deleteNode] called with:", nodeId, "events:", events.length, "nodes:", nodes.map(n => ({ id: n.id, type: n.type, start: n.start, end: n.end })));
    if (nodeId === "app") {
      onDeleteTargetApp?.();
      return;
    }

    let nextEvents = [...events];
    let nextConnections = [...connections];
    const nextPositions = { ...positions };
    const n = nodes.find((x) => x.id === nodeId);

    if (!n) {
      console.warn("[deleteNode] Nodo no encontrado:", nodeId, "en", nodes.map(x => x.id));
      return;
    }

    if (nodeId === "start" || (n.type === "start" && n.start === undefined)) {
      const triggerIdx = nextEvents.findIndex(e => e.kind === "trigger" || e.kind === "start" || e.kind === "startup");
      if (triggerIdx !== -1) {
        nextEvents.splice(triggerIdx, 1);
      }
      nextConnections = nextConnections.filter((c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId);
      delete nextPositions[nodeId];
      setConnections(nextConnections);
      saveLayoutMetadata(nextPositions, nextConnections, notes, disabledNodes, nextEvents);
      return;
    }

    // Delay/wait nodes: si tienen rango propio (evento real), lo borramos;
    // si no, solo limpiamos conexiones y posición.
    if (n.type === "delay" || n.type === "wait") {
      if (n.start !== undefined && n.end !== undefined && n.start >= 0 && n.start < nextEvents.length) {
        const ev = nextEvents[n.start];
        if (ev && (ev.kind === "delay" || ev.kind === "wait")) {
          console.log("[deleteNode] removing delay/wait event at", n.start);
          nextEvents.splice(n.start, n.end - n.start + 1);
        } else {
          console.warn("[deleteNode] delay/wait node points to non-delay event; skipping splice");
        }
      }
      nextConnections = nextConnections.filter((c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId);
      delete nextPositions[nodeId];
      setConnections(nextConnections);
      saveLayoutMetadata(nextPositions, nextConnections, notes, disabledNodes, nextEvents);
      console.log("[deleteNode] delay/wait deleted and saveLayoutMetadata called");
      return;
    }

    if (n.start !== undefined && n.end !== undefined) {
      console.log("[deleteNode] splicing events at", n.start, "count", n.end - n.start + 1, "before:", nextEvents.map(e => e.kind));
      nextEvents.splice(n.start, n.end - n.start + 1);
      console.log("[deleteNode] after splice:", nextEvents.map(e => e.kind));
      nextConnections = nextConnections.filter((c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId);
      delete nextPositions[nodeId];

      setConnections(nextConnections);
      saveLayoutMetadata(nextPositions, nextConnections, notes, disabledNodes, nextEvents);
      console.log("[deleteNode] saveLayoutMetadata called");
    } else {
      console.warn("[deleteNode] Nodo sin rango de eventos:", nodeId, n);
    }
  };

  return {
    deleteSelectedElements,
    deleteNode,
  };
}
