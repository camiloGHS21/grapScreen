import { FlowNode, FlowConnection, StickyNoteData } from "../../../types";
import { NODE_W } from "../../../Flowchart";
import { ENTRY_NODE_TYPES } from "../utils/graphUtils";

interface LayoutHelpersProps {
  nodes: FlowNode[];
  connections: FlowConnection[];
  layout: Record<string, { x: number; y: number }>;
  setPositions: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number }>>>;
  saveLayoutMetadata: (pos: any, conns: any, notes: any, disabled: any) => void;
  notes: StickyNoteData[];
  disabledNodes: Set<string>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setViewport: React.Dispatch<React.SetStateAction<{ x: number; y: number; k: number }>>;
}

export function useFlowchartLayoutHelpers({
  nodes,
  connections,
  layout,
  setPositions,
  saveLayoutMetadata,
  notes,
  disabledNodes,
  containerRef,
  setViewport,
}: LayoutHelpersProps) {
  const autoLayout = () => {
    const entryTypes = ENTRY_NODE_TYPES;
    const depth = new Map<string, number>();
    const queue: string[] = [];
    nodes.forEach((n) => {
      if (entryTypes.has(n.type)) {
        depth.set(n.id, 0);
        queue.push(n.id);
      }
    });
    if (depth.size === 0 && nodes.length > 0) {
      depth.set(nodes[0].id, 0);
      queue.push(nodes[0].id);
    }
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = depth.get(cur)!;
      connections
        .filter((c) => c.sourceNodeId === cur)
        .forEach((c) => {
          if (!depth.has(c.targetNodeId) || depth.get(c.targetNodeId)! > d + 1) {
            depth.set(c.targetNodeId, d + 1);
            queue.push(c.targetNodeId);
          }
        });
    }
    const maxD = depth.size > 0 ? Math.max(...depth.values()) : 0;
    nodes.forEach((n) => {
      if (!depth.has(n.id)) depth.set(n.id, maxD + 1);
    });

    const cols = new Map<number, string[]>();
    depth.forEach((d, id) => {
      if (!cols.has(d)) cols.set(d, []);
      cols.get(d)!.push(id);
    });
    const X_GAP = 310;
    const Y_GAP = 116;
    const next: Record<string, { x: number; y: number }> = {};
    cols.forEach((ids, d) => {
      ids.sort((a, b) => (layout[a]?.y ?? 0) - (layout[b]?.y ?? 0));
      ids.forEach((id, row) => {
        next[id] = { x: 80 + d * X_GAP, y: 120 + row * Y_GAP };
      });
    });
    setPositions(next);
    saveLayoutMetadata(next, connections, notes, disabledNodes);
  };

  const fitView = () => {
    const el = containerRef.current;
    if (!el) return;
    const pts = nodes.map((n) => layout[n.id]).filter(Boolean) as { x: number; y: number }[];
    if (pts.length === 0) return;
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x)) + NODE_W;
    const maxY = Math.max(...pts.map((p) => p.y)) + 130;
    const rect = el.getBoundingClientRect();
    const pad = 70;
    const rawK = Math.min((rect.width - pad * 2) / Math.max(1, maxX - minX), (rect.height - pad * 2) / Math.max(1, maxY - minY));
    const k = Math.max(0.15, Math.min(1.4, rawK));
    setViewport({
      k,
      x: (rect.width - (maxX - minX) * k) / 2 - minX * k,
      y: (rect.height - (maxY - minY) * k) / 2 - minY * k,
    });
  };

  return { autoLayout, fitView };
}
