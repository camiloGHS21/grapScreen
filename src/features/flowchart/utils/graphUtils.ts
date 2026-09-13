import type { FlowNode, FlowConnection, RecordedEvent } from "../../../types";
import { getNodePorts } from "../buildNodes";

/**
 * Node types that can start a flow. Must stay in sync with `ENTRY_KINDS` in
 * `src-tauri/src/application/graph_executor/engine.rs` — if a trigger is
 * missing here it is treated as an orphan and dropped from the topological
 * order, so the flow silently never runs.
 */
export const ENTRY_NODE_TYPES: ReadonlySet<string> = new Set([
  "start",
  "trigger",
  "webhook",
  "cron",
  "startup",
  "file_change",
  "hotkey_trigger",
  "polling",
  "app",
]);

export function isEntryNodeType(type: string): boolean {
  return ENTRY_NODE_TYPES.has(type);
}

export function getConnectedNodeIds(nodes: FlowNode[], connections: FlowConnection[]): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [];
  const entryTypes = ENTRY_NODE_TYPES;
  nodes.forEach(n => {
    if (entryTypes.has(n.type)) {
      visited.add(n.id);
      queue.push(n.id);
    }
  });
  while (queue.length > 0) {
    const current = queue.shift()!;
    connections.forEach(c => {
      if (c.sourceNodeId === current) {
        if (!visited.has(c.targetNodeId)) {
          visited.add(c.targetNodeId);
          queue.push(c.targetNodeId);
        }
      }
    });
  }
  return visited;
}

export function updateEventsConnectivity(
  events: RecordedEvent[],
  nodes: FlowNode[],
  connectedNodeIds: Set<string>
): RecordedEvent[] {
  return events
    .filter(e => e.kind !== "layout_metadata")
    .map((ev, idx) => {
      const node = nodes.find(n => n.start !== undefined && n.end !== undefined && idx >= n.start && idx <= n.end);
      if (node) {
        const isNodeConnected = connectedNodeIds.has(node.id);
        const shouldBeDisabled = !isNodeConnected;
        if (shouldBeDisabled) {
          return {
            ...ev,
            data: { ...ev.data, disabled: true }
          };
        } else {
          const nextData = { ...ev.data };
          delete nextData.disabled;
          return { ...ev, data: nextData };
        }
      }
      return ev;
    });
}

export function sortEventsByConnections(
  events: RecordedEvent[],
  nodes: FlowNode[],
  connections: FlowConnection[]
): RecordedEvent[] {
  const visited = new Set<string>();
  const queue: string[] = [];
  const orderedNodeIds: string[] = [];

  // Traverse starting from entry nodes
  nodes.forEach(n => {
    if (isEntryNodeType(n.type)) {
      visited.add(n.id);
      queue.push(n.id);
      orderedNodeIds.push(n.id);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    // Find all outgoing connections from the current node
    const outgoing = connections
      .filter(c => c.sourceNodeId === current)
      .sort((a, b) => a.sourcePortId.localeCompare(b.sourcePortId)); // Deterministic port order

    outgoing.forEach(c => {
      if (!visited.has(c.targetNodeId)) {
        visited.add(c.targetNodeId);
        queue.push(c.targetNodeId);
        orderedNodeIds.push(c.targetNodeId);
      }
    });
  }

  // Find unreachable nodes
  const unreachableNodeIds: string[] = [];
  nodes.forEach(n => {
    if (!visited.has(n.id) && n.id !== "empty") {
      unreachableNodeIds.push(n.id);
    }
  });

  const finalNodeOrder = [...orderedNodeIds, ...unreachableNodeIds];

  // Map node ID to its original event slice (excluding synthesized delays)
  const nodeEventsMap = new Map<string, RecordedEvent[]>();
  nodes.forEach(n => {
    if (n.type !== "delay" && n.start !== undefined && n.end !== undefined) {
      nodeEventsMap.set(n.id, events.slice(n.start, n.end + 1));
    }
  });

  let currentTime = 0;
  const adjustedEvents: RecordedEvent[] = [];

  for (const nodeId of finalNodeOrder) {
    const slice = nodeEventsMap.get(nodeId);
    if (slice && slice.length > 0) {
      const firstTime = slice[0].at_ms;
      const isReachable = visited.has(nodeId);

      const shifted = slice.map(ev => {
        const relative = ev.at_ms - firstTime;
        const nextData = { ...ev.data };
        if (isReachable) {
          delete nextData.disabled;
        } else {
          nextData.disabled = true;
        }
        return {
          ...ev,
          at_ms: currentTime + 200 + relative,
          data: nextData,
        };
      });
      adjustedEvents.push(...shifted);
      currentTime = shifted[shifted.length - 1].at_ms;
    }
  }

  // Preserve layout_metadata at the very end
  const layoutEvent = events.find(e => e.kind === "layout_metadata");
  if (layoutEvent) {
    adjustedEvents.push({
      ...layoutEvent,
      at_ms: 99999999,
    });
  }

  return adjustedEvents;
}

export interface ConnectionValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Smart connection validation (n8n-style). Prevents the user from wiring the
 * graph into an invalid / broken state:
 *  - no self-connections
 *  - no duplicate edge on the same target port
 *  - no cycles (keeps the graph a DAG so execution stays deterministic)
 *  - input ports accept only ONE incoming edge (replace the old one instead of stacking)
 */
export function validateConnection(
  sourceNodeId: string,
  targetNodeId: string,
  targetPortId: string,
  connections: FlowConnection[]
): ConnectionValidation {
  if (!sourceNodeId || !targetNodeId) {
    return { ok: false, reason: "Conexión incompleta." };
  }
  if (sourceNodeId === targetNodeId) {
    return { ok: false, reason: "No puedes conectar un nodo consigo mismo." };
  }
  // One incoming edge per input port — replacing is allowed, stacking is not.
  const exists = connections.some(
    (c) => c.targetNodeId === targetNodeId && c.targetPortId === targetPortId
  );
  if (exists) {
    return { ok: true }; // caller replaces the existing edge
  }
  // Detect cycles: would adding source -> target create a path back to source?
  if (createsCycle(sourceNodeId, targetNodeId, connections)) {
    return { ok: false, reason: "Esa conexión crearía un bucle infinito. Conecta un nodo distinto." };
  }
  return { ok: true };
}

function createsCycle(
  source: string,
  target: string,
  connections: FlowConnection[]
): boolean {
  // If target can already reach source, adding source->target makes a cycle.
  const adj = new Map<string, string[]>();
  connections.forEach((c) => {
    if (!adj.has(c.sourceNodeId)) adj.set(c.sourceNodeId, []);
    adj.get(c.sourceNodeId)!.push(c.targetNodeId);
  });
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (adj.get(cur) || []).forEach((n) => stack.push(n));
  }
  return false;
}

/**
 * Returns the list of node ids that are not reachable from any entry node
 * (trigger/webhook/start). Used to visually flag orphans in red.
 */
export function getOrphanNodeIds(nodes: FlowNode[], connections: FlowConnection[]): Set<string> {
  const reachable = getConnectedNodeIds(nodes, connections);
  const orphans = new Set<string>();
  nodes.forEach((n) => {
    const isEntry = isEntryNodeType(n.type);
    if (!reachable.has(n.id) && n.id !== "empty" && !isEntry) {
      orphans.add(n.id);
    }
  });
  return orphans;
}

