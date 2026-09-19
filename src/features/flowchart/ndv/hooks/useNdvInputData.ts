import { useMemo, useState } from "react";
import { FlowNode, RecordedEvent, FlowConnection, NodeRunStatus } from "../../../../types";
import { NdvInputItem } from "../types";

interface UseNdvInputDataProps {
  currentNode: FlowNode | null;
  events: RecordedEvent[];
  lastRunStatus?: NodeRunStatus | null;
  nodeRunDetails?: Record<string, NodeRunStatus>;
}

export function useNdvInputData({
  currentNode,
  events,
  lastRunStatus,
  nodeRunDetails = {},
}: UseNdvInputDataProps) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Extract layout metadata to find connections and graph nodes
  const { connections, graphNodes } = useMemo(() => {
    let conns: FlowConnection[] = [];
    let gNodes: Array<{ id: string; label?: string; pinEnabled?: boolean; pinnedData?: unknown }> = [];

    for (const ev of events) {
      if (ev.kind === "layout_metadata" && ev.data) {
        if (Array.isArray(ev.data.connections)) {
          conns = ev.data.connections;
        }
        if (Array.isArray(ev.data.graphNodes)) {
          gNodes = ev.data.graphNodes;
        }
      }
    }
    return { connections: conns, graphNodes: gNodes };
  }, [events]);

  // Find all upstream nodes connecting into the current node
  const upstreamSources = useMemo(() => {
    if (!currentNode) return [];
    const incomingConns = connections.filter((c) => c.targetNodeId === currentNode.id);
    const uniqueSourceIds = Array.from(new Set(incomingConns.map((c) => c.sourceNodeId)));

    return uniqueSourceIds.map((sourceId) => {
      const gNode = graphNodes.find((gn) => gn.id === sourceId);
      const label = gNode?.label || sourceId;

      // Check if upstream node has pinned data
      if (gNode?.pinEnabled && gNode.pinnedData !== undefined) {
        return {
          nodeId: sourceId,
          nodeLabel: `${label} (Pinned)`,
          data: gNode.pinnedData,
          itemsCount: Array.isArray(gNode.pinnedData) ? gNode.pinnedData.length : 1,
        };
      }

      // Check if upstream node was executed in the last run
      const runStatus = nodeRunDetails[sourceId];
      if (runStatus?.output_data) {
        const out = runStatus.output_data;
        const count = Array.isArray(out) ? out.length : 1;
        return {
          nodeId: sourceId,
          nodeLabel: label,
          data: out,
          itemsCount: count,
        };
      }

      return {
        nodeId: sourceId,
        nodeLabel: label,
        data: null,
        itemsCount: 0,
      };
    });
  }, [currentNode, connections, graphNodes, nodeRunDetails]);

  // Determine current active input data
  const activeInputItem = useMemo<NdvInputItem | null>(() => {
    if (!currentNode) return null;

    // 1. If user explicitly picked an upstream source
    if (selectedSourceId) {
      const found = upstreamSources.find((s) => s.nodeId === selectedSourceId);
      if (found && found.data) return found;
    }

    // 2. If there are upstream sources with data, pick the first one
    const firstWithData = upstreamSources.find((s) => s.data !== null);
    if (firstWithData) return firstWithData;

    // 3. Fallback to this node's recorded input from execution
    if (lastRunStatus?.input_data) {
      return {
        nodeId: currentNode.id,
        nodeLabel: "Entrada del flujo",
        data: lastRunStatus.input_data,
        itemsCount: Array.isArray(lastRunStatus.input_data) ? lastRunStatus.input_data.length : 1,
      };
    }

    // 4. Fallback to node's own pinned data if enabled
    if (currentNode.pinEnabled && currentNode.pinnedData !== undefined) {
      return {
        nodeId: currentNode.id,
        nodeLabel: "Datos fijados (Pin Data)",
        data: currentNode.pinnedData,
        itemsCount: Array.isArray(currentNode.pinnedData) ? currentNode.pinnedData.length : 1,
      };
    }

    return null;
  }, [currentNode, selectedSourceId, upstreamSources, lastRunStatus]);

  return {
    upstreamSources,
    selectedSourceId,
    setSelectedSourceId,
    activeInputItem,
    hasInputData: activeInputItem !== null && activeInputItem.data !== null,
  };
}
