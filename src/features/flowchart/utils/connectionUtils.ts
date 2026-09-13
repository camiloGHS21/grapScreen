import type { FlowConnection, RecordedEvent } from "../../../types";
import { buildNodes, getNodePorts } from "../buildNodes";

export function getDefaultConnections(events: RecordedEvent[], target_app?: any): FlowConnection[] {
  const nodesList = buildNodes(events, target_app);
  if (nodesList.length <= 1) return [];
  
  const defaultConns: FlowConnection[] = [];
  for (let i = 0; i < nodesList.length - 1; i++) {
    const n = nodesList[i];
    const nextN = nodesList[i + 1];
    const ports = n.ports || getNodePorts(n.type);
    const nextPorts = nextN.ports || getNodePorts(nextN.type);
    if (ports.outputs.length > 0 && nextPorts.inputs.length > 0) {
      defaultConns.push({
        id: `conn-default-${n.id}-${nextN.id}`,
        sourceNodeId: n.id,
        sourcePortId: ports.outputs[0].id,
        targetNodeId: nextN.id,
        targetPortId: nextPorts.inputs[0].id,
      });
    }
  }
  return defaultConns;
}
