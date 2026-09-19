import { FlowNode, RecordedEvent, AutomationDetail, AddStepExtra } from "../../../types";
import { buildNodes, getNodePorts } from "../buildNodes";
import { buildAddedEvents } from "./eventModifiers";
import { AI_PORT_IDS, AI_PORT_OFFSETS } from "./aiPortCatalog";

export async function computeAddStepEvents(
  selectedProjectDetail: AutomationDetail,
  type: FlowNode["type"],
  afterNodeId: string,
  sourcePortId?: string,
  position?: { x: number; y: number },
  extra?: AddStepExtra,
): Promise<{ events: RecordedEvent[]; newNodeId?: string }> {
  const oldNodes = buildNodes(selectedProjectDetail.events);
  
  if (type === "trigger" || type === "startup" || type === "start") {
    const hasExistingStart = oldNodes.some(n => n.type === "start" || n.type === "trigger" || n.type === "startup");
    if (hasExistingStart) {
      return { events: selectedProjectDetail.events };
    }
  }

  const idx = oldNodes.findIndex(n => n.id === afterNodeId);
  const after = idx >= 0 ? oldNodes[idx] : null;
  let insertAt = after && after.end != null ? after.end + 1 : selectedProjectDetail.events.length;
  let evs = [...selectedProjectDetail.events];

  const layoutIdx = evs.findIndex(e => e.kind === "layout_metadata");
  let layoutEvent = layoutIdx >= 0 ? evs[layoutIdx] : null;
  let layoutData = layoutEvent?.data ? { ...layoutEvent.data } : { positions: {}, connections: [], notes: [], disabledNodeIds: [] };
  if (!layoutData.connections) layoutData.connections = [];
  if (!layoutData.positions) layoutData.positions = {};
  if (!layoutData.notes) layoutData.notes = [];
  if (!layoutData.disabledNodeIds) layoutData.disabledNodeIds = [];

  const activeEvs = evs.filter(e => e.kind !== "layout_metadata");
  const baseTime = insertAt > 0 && insertAt - 1 < activeEvs.length ? activeEvs[insertAt - 1].at_ms : 0;

  // NOTE: do NOT stamp a shared id across the created events. `buildNodes`
  // already mints a deterministic id per event, and the caller places the node
  // using the id returned below. An earlier version forced one shared
  // `data.id` onto every event in the flow (not just the new ones), which made
  // unrelated steps collapse into duplicate nodes.
  const added = buildAddedEvents(type, baseTime, activeEvs, insertAt, extra);
  if (added.length > 0) {
    activeEvs.splice(insertAt, 0, ...added);
  }

  const newNodes = buildNodes(activeEvs);
  const newNode = newNodes.find(n => !oldNodes.some(o => o.id === n.id));

  if (newNode && position) {
    layoutData.positions[newNode.id] = position;
  } else if (newNode && afterNodeId) {
    const srcPos = layoutData.positions[afterNodeId];
    if (srcPos) {
      if (sourcePortId && AI_PORT_IDS.includes(sourcePortId)) {
        layoutData.positions[newNode.id] = {
          x: srcPos.x + (AI_PORT_OFFSETS[sourcePortId] ?? 0),
          y: srcPos.y + 160,
        };
      } else {
        layoutData.positions[newNode.id] = { x: srcPos.x + 300, y: srcPos.y };
      }
    } else {
      const xs = Object.values(layoutData.positions).map((p: any) => p.x);
      const maxX = xs.length > 0 ? Math.max(...xs) : 40;
      layoutData.positions[newNode.id] = { x: maxX + 300, y: 60 };
    }
  }

  if (newNode && afterNodeId) {
    const srcNode = oldNodes.find(n => n.id === afterNodeId);
    const srcPorts = srcNode?.ports || (srcNode ? getNodePorts(srcNode.type) : null);
    const tgtPorts = newNode.ports || getNodePorts(newNode.type);

    const isBottomInput = srcPorts?.inputs.some(p => p.id === sourcePortId && p.position === "bottom");
    if (isBottomInput) {
      const fromPort = tgtPorts && tgtPorts.outputs.length > 0 ? tgtPorts.outputs[0].id : "out";
      layoutData.connections.push({
        id: `conn-${Date.now()}`,
        sourceNodeId: newNode.id,
        sourcePortId: fromPort,
        targetNodeId: afterNodeId,
        targetPortId: sourcePortId!,
      });
    } else {
      const fromPort = sourcePortId || (srcPorts && srcPorts.outputs.length > 0 ? srcPorts.outputs[0].id : null);
      const toPort = tgtPorts && tgtPorts.inputs.length > 0 ? tgtPorts.inputs[0].id : null;

      if (fromPort && toPort) {
        layoutData.connections.push({
          id: `conn-${Date.now()}`,
          sourceNodeId: afterNodeId,
          sourcePortId: fromPort,
          targetNodeId: newNode.id,
          targetPortId: toPort,
        });
      }
    }
  }

  const finalEvs = [...activeEvs];
  const newLayoutEvent = {
    kind: "layout_metadata",
    at_ms: finalEvs.length > 0 ? finalEvs[finalEvs.length - 1].at_ms + 1 : 0,
    data: layoutData
  };
  finalEvs.push(newLayoutEvent as any);

  return { events: finalEvs, newNodeId: newNode?.id };
}

/**
 * One step of a chain: a node type, plus the config that makes it coherent with
 * the rest of the chain.
 *
 * A bare type string is still accepted everywhere a spec is, so the existing
 * add-node call sites are unaffected. `data` is merged over the type's default
 * seed (see `buildAddedEvents`), which is what lets two templates that share a
 * node type seed different, working configurations.
 */
export type ChainStep = FlowNode["type"] | { type: FlowNode["type"]; data?: Record<string, unknown> };

function normalizeStep(step: ChainStep): { type: FlowNode["type"]; data?: Record<string, unknown> } {
  return typeof step === "string" ? { type: step } : step;
}

export async function computeAddStepChainEvents(
  selectedProjectDetail: AutomationDetail,
  steps: ChainStep[],
  initialAfterNodeId: string,
  sourcePortId?: string
): Promise<RecordedEvent[]> {
  let currentEvs = [...selectedProjectDetail.events];
  let currentAfterId = initialAfterNodeId;
  let currentPortId = sourcePortId;

  for (let i = 0; i < steps.length; i++) {
    const { type, data } = normalizeStep(steps[i]);
    const oldNodes = buildNodes(currentEvs);
    const idx = oldNodes.findIndex(n => n.id === currentAfterId);
    const after = idx >= 0 ? oldNodes[idx] : null;
    let insertAt = after && after.end != null ? after.end + 1 : currentEvs.length;

    const layoutIdx = currentEvs.findIndex(e => e.kind === "layout_metadata");
    let layoutEvent = layoutIdx >= 0 ? currentEvs[layoutIdx] : null;
    let layoutData = layoutEvent?.data ? { ...layoutEvent.data } : { positions: {}, connections: [], notes: [], disabledNodeIds: [] };
    if (!layoutData.connections) layoutData.connections = [];
    if (!layoutData.positions) layoutData.positions = {};
    if (!layoutData.notes) layoutData.notes = [];
    if (!layoutData.disabledNodeIds) layoutData.disabledNodeIds = [];

    const activeEvs = currentEvs.filter(e => e.kind !== "layout_metadata");
    const baseTime = insertAt > 0 && insertAt - 1 < activeEvs.length ? activeEvs[insertAt - 1].at_ms : 0;

    const added = buildAddedEvents(type, baseTime, activeEvs, insertAt, data ? { data } : undefined);
    if (added.length > 0) {
      activeEvs.splice(insertAt, 0, ...added);
    }

    const newNodes = buildNodes(activeEvs);
    const newNode = newNodes.find(n => !oldNodes.some(o => o.id === n.id));

    if (newNode && currentAfterId) {
      const srcPos = layoutData.positions[currentAfterId];
      if (srcPos) {
        layoutData.positions[newNode.id] = { x: srcPos.x + 280, y: srcPos.y };
      } else {
        const xs = Object.values(layoutData.positions).map((p: any) => p.x);
        const maxX = xs.length > 0 ? Math.max(...xs) : 40;
        layoutData.positions[newNode.id] = { x: maxX + 280, y: 60 };
      }

      const srcNode = oldNodes.find(n => n.id === currentAfterId);
      const srcPorts = srcNode?.ports || (srcNode ? getNodePorts(srcNode.type) : null);
      const tgtPorts = newNode.ports || getNodePorts(newNode.type);

      const fromPort = currentPortId || (srcPorts && srcPorts.outputs.length > 0 ? srcPorts.outputs[0].id : null);
      const toPort = tgtPorts && tgtPorts.inputs.length > 0 ? tgtPorts.inputs[0].id : null;

      if (fromPort && toPort) {
        layoutData.connections.push({
          id: `conn-${Date.now()}-${i}`,
          sourceNodeId: currentAfterId,
          sourcePortId: fromPort,
          targetNodeId: newNode.id,
          targetPortId: toPort,
        });
      }
    }

    currentEvs = [...activeEvs];
    const newLayoutEvent = {
      kind: "layout_metadata",
      at_ms: currentEvs.length > 0 ? currentEvs[currentEvs.length - 1].at_ms + 1 : 0,
      data: layoutData
    };
    currentEvs.push(newLayoutEvent as any);

    if (newNode) {
      currentAfterId = newNode.id;
      currentPortId = undefined;
    }
  }

  return currentEvs;
}
