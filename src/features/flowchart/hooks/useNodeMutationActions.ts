import type { FlowNode, FlowConnection, StickyNoteData, RecordedEvent } from "../../../types";
import { buildNodes } from "../buildNodes";

interface NodeMutationActionsProps {
  nodes: FlowNode[];
  events: RecordedEvent[];
  target_app?: any;
  positions: Record<string, { x: number; y: number }>;
  setPositions: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number }>>>;
  connections: FlowConnection[];
  notes: StickyNoteData[];
  disabledNodes: Set<string>;
  saveLayoutMetadata: (pos: any, conns: any, notes: any, disabled: any, customEvents?: RecordedEvent[]) => void;
  prompt: (opts: { title: string; message: string; defaultValue?: string; confirmLabel?: string }) => Promise<string | null>;
}

export function useNodeMutationActions({
  nodes,
  events,
  target_app,
  positions,
  setPositions,
  connections,
  notes,
  disabledNodes,
  saveLayoutMetadata,
  prompt,
}: NodeMutationActionsProps) {
  const duplicateNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.start == null || node.end == null) return;
    if (node.type === "start" || node.type === "app" || node.type === "note") return;
    const cloned = events.slice(node.start, node.end + 1).map((ev) => ({
      ...ev,
      data: {
        ...ev.data,
        id: Math.random().toString(36).substring(2, 9),
        __manual: true,
      },
    }));
    const newEvents = [...events];
    newEvents.splice(node.end + 1, 0, ...cloned);
    const newNodeIds = new Set(nodes.map((n) => n.id));
    const newNode = buildNodes(newEvents, target_app).find((n) => !newNodeIds.has(n.id));
    const srcPos = positions[node.id];
    const nextPositions = { ...positions };
    if (newNode) {
      nextPositions[newNode.id] = srcPos
        ? { x: srcPos.x + 60, y: srcPos.y + 100 }
        : { x: 200, y: 200 };
    }
    setPositions(nextPositions);
    saveLayoutMetadata(nextPositions, connections, notes, disabledNodes, newEvents);
  };

  const renameNode = async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.eventIndex == null) return;
    if (node.type === "start" || node.type === "app") return;
    const current = events[node.eventIndex]?.data?.custom_name || node.label;
    const name = await prompt({
      title: "Renombrar nodo",
      message: "Nuevo nombre para el nodo:",
      defaultValue: current,
      confirmLabel: "Guardar",
    });
    if (!name || !name.trim()) return;
    const newEvents = [...events];
    newEvents[node.eventIndex] = {
      ...newEvents[node.eventIndex],
      data: { ...newEvents[node.eventIndex].data, custom_name: name.trim() },
    };
    saveLayoutMetadata(positions, connections, notes, disabledNodes, newEvents);
  };

  return { duplicateNode, renameNode };
}
